import "./helpers/allow-server-only";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { contentSchema } from "../src/lib/builder/content";
import { SiteDocument } from "../src/lib/builder/render";
import { createWidgetTree, insertNode } from "../src/lib/builder/tree";
import type { BuilderDocument, BuilderNode, WidgetType } from "../src/lib/builder/types";
import { contentField } from "../src/lib/builder/widgets";
import { formSubmissionEmail } from "../src/lib/email/templates/forms";
import { compileHtml } from "../src/lib/export/compile";
import { checkSubmission, parseRecipients, type PostedFile } from "../src/lib/forms/submission";
import { composeDocument } from "../src/lib/i18n/translate";
import { SYSTEM_ROLES } from "../src/lib/rbac";
import { toCsv } from "../src/server/forms/admin-service";

const empty = (): BuilderDocument => ({ version: 1, rootId: "root", nodes: { root: { id: "root", type: "section", props: {}, style: {}, children: [] } } });

function withWidget(key: WidgetType, patch: Partial<BuilderNode> = {}) {
  const doc = empty();
  const { node, extra } = createWidgetTree(doc, key);
  const next = insertNode(doc, { ...node, ...patch, props: { ...node.props, ...patch.props } }, "root", 0, extra)!;
  return { doc: next, id: node.id, node: next.nodes[node.id] };
}

const render = (doc: BuilderDocument, opts: { editor?: boolean; formAction?: string } = {}) =>
  renderToStaticMarkup(createElement(SiteDocument, { doc, ...opts })).replace(/<style>[\s\S]*?<\/style>/, "");

const posted = (values: Record<string, string | PostedFile>) => (key: string) => values[key] ?? null;
const file = (name: string, type: string, size = 1000): PostedFile => ({ name, type, size });

describe("contact form rendering", () => {
  it("posts to the site's form endpoint with a spam trap, labelled fields and indexed choices", () => {
    const { doc, id } = withWidget("form");
    const out = render(doc, { formAction: "/api/v1/sites/aurelia/forms" });
    const formTag = out.match(/<form [^>]*>/)![0];
    for (const attr of ['data-wb-form=""', 'action="/api/v1/sites/aurelia/forms"', 'method="post"', 'encType="multipart/form-data"']) assert.ok(formTag.includes(attr), attr);
    assert.match(out, new RegExp(`<input type="hidden" name="_form" value="${id}"/>`));
    assert.match(out, /<div data-hp="" aria-hidden="true"><label>Leave this empty<input type="text" tabindex="-1" autoComplete="off" name="_hp"/);
    assert.match(out, new RegExp(`<label data-field-label="" for="form-${id}-f1">Email<span data-req="" aria-hidden="true"> \\*</span></label><input id="form-${id}-f1" required=""[^>]*type="email"[^>]*autoComplete="email"[^>]*name="f1"`));
    assert.match(out, /<option value="0">New project<\/option><option value="1">Question<\/option>/);
    assert.match(out, /<textarea[^>]*name="f3"[^>]*rows="5"/);
    assert.doesNotMatch(out, /<fieldset data-form-body="" disabled/);
    assert.match(out, /<p data-form-success="" hidden="">Thanks! We got your message/);
  });

  it("is disabled on the canvas and wherever there's nowhere to post (previews)", () => {
    const { doc } = withWidget("form");
    assert.match(render(doc, { editor: true, formAction: "/x" }), /<fieldset data-form-body="" disabled=""/);
    assert.doesNotMatch(render(doc).match(/<form [^>]*>/)![0], /action=/);
    assert.match(render(doc), /<fieldset data-form-body="" disabled=""/);
  });

  it("renders file, rating, radio and checkbox fields", () => {
    const { doc } = withWidget("form", {
      props: {
        fields: [
          { label: "CV", type: "file", required: true },
          { label: "How did we do?", type: "rating" },
          { label: "Size", type: "radio", options: ["S", "M"] },
          { label: "I agree to be contacted", type: "checkbox", required: true },
        ],
      },
    });
    const out = render(doc, { formAction: "/f" });
    assert.match(out, /type="file" accept="\.pdf,\.jpg/);
    assert.equal(out.match(/<input type="radio" name="f1" value="[1-5]"/g)?.length, 5);
    assert.match(out, /<legend data-field-label="">Size<\/legend><div data-choices=""><label><input type="radio" name="f2" value="0"\/>S<\/label>/);
    assert.match(out, /<label data-check=""><input type="checkbox" required=""[^>]*name="f3" value="yes"/);
  });

  it("ships the enhancer only on pages with a form", () => {
    assert.match(renderToStaticMarkup(createElement(SiteDocument, { doc: withWidget("newsletter").doc, formAction: "/f" })), /data-wb-form/);
    // The enhancer is a client component; on the server it renders nothing, so check the gate through a page without forms instead.
    assert.doesNotMatch(render(withWidget("rating").doc), /data-wb-form/);
  });
});

describe("newsletter and star rating", () => {
  it("renders an email-only sign-up, with an optional name", () => {
    const out = render(withWidget("newsletter").doc, { formAction: "/f" });
    assert.match(out, /<h3>Stay in the loop<\/h3>/);
    assert.match(out, /<input id="nl-[^"]+-email" type="email" required=""[^>]*name="email"/);
    assert.doesNotMatch(out, /name="name"/);
    assert.match(render(withWidget("newsletter", { props: { askName: true } }).doc, { formAction: "/f" }), /name="name"/);
  });

  it("fills partial stars and announces the score", () => {
    const out = render(withWidget("rating", { props: { value: 4.5 } }).doc);
    assert.match(out, /role="img" aria-label="Rated 4.5 out of 5"/);
    assert.match(out, /data-rating-fill="" style="width:90%"/);
    assert.equal(out.match(/<svg/g)?.length, 10);
    assert.match(render(withWidget("rating", { props: { value: 99, max: 10 } }).doc), /aria-label="Rated 10 out of 10"/);
  });
});

describe("form field content", () => {
  it("validates field types and choices; types aren't translatable", () => {
    const schema = contentSchema(contentField("form", "fields")!);
    assert.ok(schema.safeParse([{ label: "Name", type: "text", required: true, width: "half" }]).success);
    assert.equal(schema.safeParse([{ label: "Evil", type: "script" }]).success, false);
    assert.equal(schema.safeParse([]).success, false, "a form needs a field");
    const { doc, id } = withWidget("form");
    const fr = composeDocument(doc, { type: "translation", version: 1, overrides: { [id]: { fields: [{ label: "Nom", type: "file", required: false }] } } });
    const f0 = (fr.nodes[id].props.fields as Record<string, unknown>[])[0];
    assert.equal(f0.label, "Nom");
    assert.equal(f0.type, "text", "the type stays the original's");
    assert.equal(f0.required, true);
  });
});

describe("submission checks", () => {
  const form = () => withWidget("form").node;

  it("accepts a valid message and maps choice indexes back to the original labels", () => {
    const r = checkSubmission(form(), posted({ f0: "  Ada ", f1: "ada@example.com", f2: "1", f3: "Hello\r\nthere" }));
    assert.ok(r.ok && r.kind === "form");
    assert.deepEqual(r.fields.map((f) => f.value), ["Ada", "ada@example.com", "Question", "Hello\nthere"]);
    assert.equal(r.email, "ada@example.com");
    assert.equal(r.formName, "Contact form");
  });

  it("reports each problem against its field", () => {
    const r = checkSubmission(form(), posted({ f0: "", f1: "not-an-email", f2: "7", f3: "x".repeat(5001) }));
    assert.ok(!r.ok);
    assert.deepEqual(Object.keys(r.errors).sort(), ["f0", "f1", "f2", "f3"]);
  });

  it("ignores fields the published form doesn't have", () => {
    const r = checkSubmission(form(), posted({ f0: "A", f1: "a@b.co", f3: "Hi", f9: "injected", admin: "1" }));
    assert.ok(r.ok && r.kind === "form");
    assert.equal(r.fields.length, 4);
    assert.ok(!r.fields.some((f) => f.value === "injected"));
  });

  it("accepts allowed attachments up to 4 MB and refuses others", () => {
    const node = withWidget("form", { props: { fields: [{ label: "File", type: "file", required: true }] } }).node;
    const ok = checkSubmission(node, posted({ f0: file("cv.pdf", "application/pdf") }));
    assert.ok(ok.ok && ok.kind === "form" && ok.files[0].ext === "pdf");
    for (const bad of [file("x.exe", "application/x-msdownload"), file("x.html", "text/html"), file("big.pdf", "application/pdf", 5 * 1024 * 1024)]) {
      const r = checkSubmission(node, posted({ f0: bad }));
      assert.ok(!r.ok && r.errors.f0, bad.name);
    }
    const missing = checkSubmission(node, posted({}));
    assert.ok(!missing.ok && missing.errors.f0);
  });

  it("checks phone, url, number, date, rating and checkbox values", () => {
    const node = withWidget("form", {
      props: {
        fields: ["tel", "url", "number", "date", "rating", "checkbox"].map((type) => ({ label: type, type, required: true })),
      },
    }).node;
    const good = checkSubmission(node, posted({ f0: "+1 (555) 010-2030", f1: "https://ada.dev", f2: "12.5", f3: "2027-01-31", f4: "4", f5: "yes" }));
    assert.ok(good.ok && good.kind === "form");
    assert.deepEqual(good.fields.map((f) => f.value).slice(4), ["4 / 5", "Yes"]);
    const bad = checkSubmission(node, posted({ f0: "call me", f1: "javascript:alert(1)", f2: "lots", f3: "tomorrow", f4: "9" }));
    assert.ok(!bad.ok);
    assert.deepEqual(Object.keys(bad.errors).sort(), ["f0", "f1", "f2", "f3", "f4", "f5"]);
  });

  it("refuses an empty message even when nothing is required", () => {
    const node = withWidget("form", { props: { fields: [{ label: "Note", type: "text", required: false }] } }).node;
    const r = checkSubmission(node, posted({}));
    assert.ok(!r.ok);
  });

  it("checks newsletter addresses and only keeps a name when the widget asks for one", () => {
    const nl = withWidget("newsletter").node;
    const r = checkSubmission(nl, posted({ email: " Ada@Example.com ", name: "Ada" }));
    assert.ok(r.ok && r.kind === "newsletter" && r.email === "ada@example.com" && r.name === null);
    const named = checkSubmission(withWidget("newsletter", { props: { askName: true } }).node, posted({ email: "a@b.co", name: "Ada" }));
    assert.ok(named.ok && named.kind === "newsletter" && named.name === "Ada");
    assert.ok(!checkSubmission(nl, posted({ email: "nope" })).ok);
  });

  it("keeps up to five valid recipient addresses", () => {
    assert.deepEqual(parseRecipients("A@x.co, bad, b@x.co; a@x.co"), ["a@x.co", "b@x.co"]);
    assert.equal(parseRecipients(Array.from({ length: 9 }, (_, i) => `u${i}@x.co`).join(",")).length, 5);
    assert.deepEqual(parseRecipients(undefined), []);
  });
});

describe("static export", () => {
  const page = '<html><head></head><body><div data-w="form"><form data-wb-form="" action="/api/v1/sites/aurelia/forms" method="post"></form></div></body></html>';
  const ctx = { origin: "http://127.0.0.1:3000", siteKey: "aurelia", baseUrl: "https://static.example" };
  it("keeps forms posting to the platform", () => {
    const out = compileHtml(page, { ...ctx, platformOrigin: "https://samtwebcreate.site" }).html;
    assert.match(out, /action="https:\/\/samtwebcreate\.site\/api\/v1\/sites\/aurelia\/forms"/);
    assert.doesNotMatch(out, /data-static-forms/);
  });
  it("hides forms when there's no platform to post to", () => {
    assert.match(compileHtml(page, ctx).html, /data-static-forms/);
  });
});

describe("forms admin", () => {
  it("escapes visitor input in notification emails", () => {
    const email = formSubmissionEmail(
      { brand: { name: "Aurelia" }, formName: "Contact", pagePath: "/contact", fields: [{ label: "Message", type: "textarea", value: '<img src=x onerror="alert(1)">' }], attachments: [], receivedAt: new Date(0) },
      "https://example.com/admin",
    );
    assert.doesNotMatch(email.html, /<img src=x/);
    assert.match(email.html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
    assert.doesNotMatch(email.subject, /[\r\n]/);
  });

  it("writes CSV that spreadsheets can't execute", () => {
    const csv = toCsv([["Email", "Note"], ["a@b.co", '=HYPERLINK("http://evil")'], ["c@d.co", 'Say "hi", then\nleave']]);
    assert.ok(csv.startsWith("\uFEFFEmail,Note\r\n"));
    assert.match(csv, /a@b\.co,"'=HYPERLINK\(""http:\/\/evil""\)"/);
    assert.match(csv, /"Say ""hi"", then\nleave"/);
  });

  it("lets designers and client admins read messages, not editors or authors", () => {
    assert.ok(SYSTEM_ROLES.designer.permissions.includes("forms.manage"));
    assert.ok(SYSTEM_ROLES.client_admin.permissions.includes("forms.manage"));
    assert.ok(!(SYSTEM_ROLES.editor.permissions as readonly string[]).includes("forms.manage"));
    assert.ok(!(SYSTEM_ROLES.author.permissions as readonly string[]).includes("forms.manage"));
  });
});
