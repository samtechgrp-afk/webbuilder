import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildAureliaHome, type SampleImages } from "../prisma/sample-site";
import { authorizeChanges, diffDocuments } from "../src/lib/builder/policy";
import { createWidgetTree, insertNode, structuralProblem } from "../src/lib/builder/tree";
import type { BuilderDocument } from "../src/lib/builder/types";
import { applyDynamic, baseNodeId, type DynamicData, type DynamicPost } from "../src/lib/cms/binding";
import { definitionProblem, valueSchema, type FieldDef } from "../src/lib/cms/fields";
import { matchesLocation, postTypesForRules } from "../src/lib/cms/location";
import { slugFromRule, slugify, uniqueSlug } from "../src/lib/cms/slug";
import { SYSTEM_ROLES } from "../src/lib/rbac";
import { sanitizeRichText, sanitizeSvg } from "../src/server/sanitize";

const img = { assetId: "a1", src: "/uploads/x.webp", alt: "x" };
const images: SampleImages = { hero: img, living: img, kitchen: img, bedroom: img, portrait: img };
const client = { permissions: SYSTEM_ROLES.client_admin.permissions };
const designer = { permissions: SYSTEM_ROLES.designer.permissions };

const def = (d: Partial<FieldDef> & Pick<FieldDef, "key" | "type">): FieldDef => ({ label: d.key, required: false, clientEditable: true, config: {}, ...d });

describe("field definitions", () => {
  it("rejects duplicate keys at one level", () => {
    assert.match(definitionProblem([def({ key: "a", type: "TEXT" }), def({ key: "a", type: "URL" })]) ?? "", /a/);
  });

  it("requires choices for a select", () => {
    assert.ok(definitionProblem([def({ key: "size", type: "SELECT" })]));
    assert.equal(definitionProblem([def({ key: "size", type: "SELECT", config: { choices: [{ value: "s", label: "Small" }] } })]), null);
  });

  it("limits nesting depth", () => {
    const deep = def({ key: "a", type: "REPEATER", config: { subFields: [def({ key: "b", type: "REPEATER", config: { subFields: [def({ key: "c", type: "REPEATER", config: { subFields: [def({ key: "d", type: "TEXT" })] } })] } })] } });
    assert.match(definitionProblem([deep]) ?? "", /deep/);
  });
});

describe("field values", () => {
  it("enforces required, but treats empty as null when optional", () => {
    assert.equal(valueSchema(def({ key: "t", type: "TEXT", required: true })).safeParse("").success, false);
    assert.equal(valueSchema(def({ key: "t", type: "TEXT" })).parse(""), null);
  });

  it("only accepts listed choices", () => {
    const d = def({ key: "c", type: "RADIO", config: { choices: [{ value: "oak", label: "Oak" }] } });
    assert.equal(valueSchema(d).safeParse("oak").success, true);
    assert.equal(valueSchema(d).safeParse("pine").success, false);
  });

  it("rejects unsafe URLs and non-video links", () => {
    assert.equal(valueSchema(def({ key: "u", type: "URL" })).safeParse("javascript:alert(1)").success, false);
    assert.equal(valueSchema(def({ key: "v", type: "VIDEO_URL" })).safeParse("https://youtu.be/abc").success, true);
    assert.equal(valueSchema(def({ key: "v", type: "VIDEO_URL" })).safeParse("https://example.com/page").success, false);
  });

  it("validates repeater rows and their limits", () => {
    const d = def({ key: "dims", type: "REPEATER", config: { maxRows: 1, subFields: [def({ key: "label", type: "TEXT", required: true })] } });
    assert.equal(valueSchema(d).safeParse([{ label: "Height" }]).success, true);
    assert.equal(valueSchema(d).safeParse([{ label: "" }]).success, false);
    assert.equal(valueSchema(d).safeParse([{ label: "a" }, { label: "b" }]).success, false);
  });

  it("validates flexible content against its layouts", () => {
    const d = def({ key: "blocks", type: "FLEXIBLE", config: { layouts: [{ key: "quote", label: "Quote", subFields: [def({ key: "text", type: "TEXTAREA", required: true })] }] } });
    assert.equal(valueSchema(d).safeParse([{ layout: "quote", values: { text: "Hi" } }]).success, true);
    assert.equal(valueSchema(d).safeParse([{ layout: "video", values: {} }]).success, false);
  });
});

describe("location rules", () => {
  const subject = { postTypeId: "pt1", template: null, termIds: ["t1"], parentId: null };

  it("ANDs rules within a group and ORs groups", () => {
    assert.equal(matchesLocation([[{ param: "post_type", op: "==", value: "pt1" }, { param: "post_term", op: "==", value: "t1" }]], subject), true);
    assert.equal(matchesLocation([[{ param: "post_type", op: "==", value: "pt1" }, { param: "post_term", op: "==", value: "t2" }]], subject), false);
    assert.equal(
      matchesLocation([[{ param: "post_type", op: "==", value: "pt2" }], [{ param: "page_template", op: "==", value: "default" }]], subject),
      true,
    );
  });

  it("never matches malformed or empty rules", () => {
    assert.equal(matchesLocation([], subject), false);
    assert.equal(matchesLocation("nope", subject), false);
  });

  it("lists the post types a group can appear on", () => {
    assert.deepEqual(postTypesForRules([[{ param: "post_type", op: "==", value: "a" }]], ["a", "b"]), ["a"]);
    assert.deepEqual(postTypesForRules([[{ param: "post_type", op: "!=", value: "a" }]], ["a", "b"]), ["b"]);
  });
});

describe("slugs", () => {
  it("slugifies titles and applies rules", () => {
    assert.equal(slugify("  Crème Brûlée & Friends! "), "creme-brulee-and-friends");
    assert.equal(slugFromRule("DATE_TITLE", "Hello", new Date("2026-10-25T00:00:00Z")), "2026-10-25-hello");
  });

  it("finds the next free slug", async () => {
    const taken = new Set(["lamp", "lamp-2"]);
    assert.equal(await uniqueSlug("lamp", async (s) => taken.has(s)), "lamp-3");
  });
});

describe("sanitizing", () => {
  it("strips scripts, handlers and unsafe links from rich text", () => {
    const out = sanitizeRichText(`<p onclick="x()">Hi <a href="javascript:alert(1)">x</a><script>alert(1)</script><a href="/ok" target="_blank">ok</a></p>`);
    assert.doesNotMatch(out, /script|onclick|javascript/);
    assert.match(out, /href="\/ok"/);
    assert.match(out, /rel="noopener noreferrer"/);
  });

  it("removes scripts, foreign objects and external references from SVG", () => {
    const out = sanitizeSvg(`<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><foreignObject><div></div></foreignObject><use href="https://evil/x.svg#a"/><rect width="5" height="5" onload="x()"/></svg>`) ?? "";
    assert.doesNotMatch(out, /script|foreignObject|use|onload|evil/i);
    assert.match(out, /<rect/);
  });

  it("refuses input that isn't an SVG", () => {
    assert.equal(sanitizeSvg("<html><body>hi</body></html>"), null);
  });
});

const entry = (n: number, extra: Partial<DynamicPost> = {}): DynamicPost => ({
  id: `p${n}`,
  title: `Entry ${n}`,
  slug: `entry-${n}`,
  url: `/shop/entry-${n}`,
  excerpt: `Excerpt ${n}`,
  date: "2026-10-01T00:00:00.000Z",
  authorName: "Olivia",
  featuredImage: { assetId: `a${n}`, src: `/uploads/${n}.webp`, alt: `Image ${n}` },
  content: "<p>Body</p>",
  fields: { material: { type: "TEXT", label: "Material", text: `Oak ${n}` } },
  ...extra,
});

function ins(...args: Parameters<typeof insertNode>): BuilderDocument {
  const next = insertNode(...args);
  assert.ok(next, "insert refused");
  return next;
}

function withLoop() {
  const doc = buildAureliaHome(images);
  const { node, extra } = createWidgetTree(doc, "loop");
  node.props = { ...node.props, query: { postTypeId: "pt1", limit: 6, orderBy: "date", order: "desc", termId: null, offset: 0 } };
  const next = ins(doc, node, doc.rootId, 0, extra);
  return { doc: next, loopId: node.id, card: node.children![0] };
}

describe("dynamic binding", () => {
  const site = { name: "Aurelia", tagline: "Calm homes", url: "/", logo: null };

  it("builds a valid default loop card bound to post data", () => {
    const { doc } = withLoop();
    assert.equal(structuralProblem(doc), null);
    const bound = Object.values(doc.nodes).flatMap((n) => Object.values(n.bindings ?? {}).map((b) => b.key));
    assert.ok(bound.includes("title") && bound.includes("featured_image") && bound.includes("url"));
  });

  it("repeats the card once per entry, keeping the first item's ids", () => {
    const { doc, loopId, card } = withLoop();
    const data: DynamicData = { site, post: null, loops: { [loopId]: [entry(1), entry(2), entry(3)] } };
    const out = applyDynamic(doc, data);
    const children = out.nodes[loopId].children!;
    assert.equal(children.length, 3);
    assert.equal(children[0], card);
    assert.equal(baseNodeId(children[2]), card);
    const titles = Object.values(out.nodes).filter((n) => n.type === "heading" && n.bindings?.text?.key === "title").map((n) => n.props.text);
    assert.deepEqual(titles.sort(), ["Entry 1", "Entry 2", "Entry 3"]);
  });

  it("resolves custom fields, site data and fallbacks", () => {
    const doc = buildAureliaHome(images);
    doc.nodes["hero-title"].bindings = { text: { source: "field", key: "material" } };
    doc.nodes["hero-copy"].bindings = { text: { source: "site", key: "tagline" } };
    const out = applyDynamic(doc, { site, post: entry(7), loops: {} });
    assert.equal(out.nodes["hero-title"].props.text, "Oak 7");
    assert.equal(out.nodes["hero-copy"].props.text, "Calm homes");

    doc.nodes["hero-title"].bindings = { text: { source: "field", key: "missing", fallback: "Coming soon" } };
    assert.equal(applyDynamic(doc, { site, post: entry(7), loops: {} }).nodes["hero-title"].props.text, "Coming soon");
  });

  it("never renders a stored rich text prop, only server-resolved HTML", () => {
    const doc = buildAureliaHome(images);
    const { node } = createWidgetTree(doc, "richtext");
    node.props = { html: "<img src=x onerror=alert(1)>" };
    const next = ins(doc, node, doc.rootId, 0, {});
    assert.equal(applyDynamic(next, { site, post: null, loops: {} }).nodes[node.id].props.html, "");
  });

  it("rejects a loop inside another loop", () => {
    const { doc, card } = withLoop();
    const inner = createWidgetTree(doc, "loop");
    const next = insertNode(doc, inner.node, card, 0, inner.extra);
    assert.ok(next === null || structuralProblem(next));
  });
});

describe("binding guardrails", () => {
  function check(edit: (d: BuilderDocument) => void, ctx = client, prepare?: (d: BuilderDocument) => void) {
    const prev = buildAureliaHome(images);
    prepare?.(prev);
    const next = structuredClone(prev);
    edit(next);
    return authorizeChanges(prev, diffDocuments(prev, next), ctx);
  }

  it("stops a client from binding or unbinding a widget", () => {
    assert.ok(check((d) => (d.nodes["hero-title"].bindings = { text: { source: "post", key: "title" } })).length);
    assert.ok(check((d) => delete d.nodes["hero-title"].bindings, client, (d) => (d.nodes["hero-title"].bindings = { text: { source: "post", key: "title" } })).length);
  });

  it("stops a client from overwriting a bound field", () => {
    const v = check((d) => (d.nodes["hero-title"].props.text = "Typed over"), client, (d) => (d.nodes["hero-title"].bindings = { text: { source: "post", key: "title" } }));
    assert.match(v[0]?.message ?? "", /dynamic/);
  });

  it("lets a designer bind widgets", () => {
    assert.deepEqual(check((d) => (d.nodes["hero-title"].bindings = { text: { source: "post", key: "title" } }), designer), []);
  });
});
