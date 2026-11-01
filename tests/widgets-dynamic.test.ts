import "./helpers/allow-server-only";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BRAND_ICONS } from "../src/lib/builder/brand-icons";
import { contentSchema } from "../src/lib/builder/content";
import { parseAudioUrl } from "../src/lib/builder/media";
import { PRESETS } from "../src/lib/builder/presets";
import { SiteDocument, type PageContext } from "../src/lib/builder/render";
import { settingProblem, type SettingDef } from "../src/lib/builder/settings";
import { buildCss } from "../src/lib/builder/styles";
import { createWidgetTree, insertNode, structuralProblem } from "../src/lib/builder/tree";
import type { BuilderDocument, BuilderNode, WidgetType } from "../src/lib/builder/types";
import { WIDGETS, contentField } from "../src/lib/builder/widgets";

const empty = (): BuilderDocument => ({ version: 1, rootId: "root", nodes: { root: { id: "root", type: "section", props: {}, style: {}, children: [] } } });

function withWidget(key: WidgetType, props: Record<string, unknown> = {}) {
  const doc = empty();
  const { node, extra } = createWidgetTree(doc, key);
  const next = insertNode(doc, { ...node, props: { ...node.props, ...props } } as BuilderNode, "root", 0, extra)!;
  return { doc: next, id: node.id };
}

const render = (doc: BuilderDocument, opts: { editor?: boolean; linkBase?: string; page?: PageContext; formAction?: string } = {}) =>
  renderToStaticMarkup(createElement(SiteDocument, { doc, ...opts })).replace(/<style>[\s\S]*?<\/style>/, "");

const page: PageContext = { url: "https://aurelia.example/services", title: "Services & fees", path: "/services", crumbs: [{ label: "Services & fees", href: "/services" }] };

describe("navigation menu", () => {
  it("nests dropdown items under the item above and marks the current page", () => {
    const { doc } = withWidget("nav");
    const out = render(doc, { page });
    assert.match(out, /<nav [^>]*aria-label="Main"[^>]*data-drawer="mobile"/);
    assert.match(out, /<input type="checkbox" id="nav-[^"]+-toggle" data-nav-toggle="" aria-label="Menu"/);
    assert.match(out, /<li data-has-sub=""><a href="\/services" aria-current="page">Services<\/a><ul data-nav-sub=""><li><a href="\/services#interiors">Interiors<\/a><\/li>/);
    assert.match(out, /<a href="\/about">About<\/a>/);
    assert.doesNotMatch(out, /href="\/about" aria-current/);
  });

  it("prefixes links with the link base (language prefix / preview path)", () => {
    const { doc } = withWidget("nav");
    const out = render(doc, { linkBase: "/sites/aurelia", page: { ...page, path: "/" } });
    assert.match(out, /<a href="\/sites\/aurelia" aria-current="page">Home<\/a>/);
    assert.match(out, /<a href="\/sites\/aurelia\/contact">Contact<\/a>/);
  });

  it("generates the drawer rules for the chosen breakpoint only", () => {
    const { doc } = withWidget("nav");
    const css = buildCss(doc, {});
    assert.match(css, /\[data-drawer=mobile\]|data-drawer="mobile"/);
    assert.match(css, /max-width:\s*767px/);
  });

  it("needs the site script (Esc closes the drawer, link clicks close it)", () => {
    const { doc } = withWidget("nav");
    const html = renderToStaticMarkup(createElement(SiteDocument, { doc }));
    assert.match(html, /data-nav-toggle/);
  });
});

describe("breadcrumbs", () => {
  it("renders Home, the trail and the current page from the page context", () => {
    const { doc } = withWidget("breadcrumbs");
    const crumbs = [{ label: "Journal", href: "/journal" }, { label: "Light & space", href: "/journal/light" }];
    const out = render(doc, { page: { ...page, path: "/journal/light", crumbs } });
    assert.match(out, /<nav [^>]*aria-label="Breadcrumb"[^>]*><ol><li><a href="\/">Home<\/a><\/li><li><a href="\/journal">Journal<\/a><\/li><li><span aria-current="page">Light &amp; space<\/span><\/li><\/ol>/);
  });

  it("hides the current page when asked, and shows a sample on the canvas", () => {
    const { doc } = withWidget("breadcrumbs", { showCurrent: false });
    const out = render(doc, { page });
    assert.doesNotMatch(out, /aria-current/);
    assert.match(render(withWidget("breadcrumbs").doc, { editor: true }), /This page/);
    assert.doesNotMatch(render(withWidget("breadcrumbs").doc), /Breadcrumb/);
  });
});

describe("search bar", () => {
  it("is a plain GET form to the site's search page", () => {
    const { doc } = withWidget("search");
    const out = render(doc, { linkBase: "/fr" });
    const form = out.match(/<form [^>]*>/)![0];
    assert.ok(form.includes('action="/fr/search"'), form);
    assert.ok(form.includes('role="search"'), form);
    assert.match(out, /<input[^>]*type="search"[^>]*name="q"|<input[^>]*name="q"[^>]*type="search"/);
  });
});

describe("social links", () => {
  it("links to profiles with brand icons and accessible names", () => {
    const { doc } = withWidget("social");
    const out = render(doc);
    assert.match(out, /<a href="https:\/\/instagram.com\/" aria-label="Instagram" title="Instagram" target="_blank" rel="me noopener noreferrer" data-network="instagram"/);
    assert.match(out, /data-network="linkedin"[^>]*><svg viewBox="0 0 24 24"[^>]*fill-rule="evenodd"|data-network="linkedin"[^>]*><svg[^>]*fillRule/i);
  });

  it("builds share links for the current page", () => {
    const { doc } = withWidget("social", { mode: "share", networks: "minimal" });
    const out = render(doc, { page });
    const u = encodeURIComponent(page.url);
    const t = encodeURIComponent(page.title);
    assert.ok(out.includes(`href="https://x.com/intent/post?url=${u}&amp;text=${t}"`), out);
    assert.ok(out.includes(`href="https://www.linkedin.com/sharing/share-offsite/?url=${u}"`));
    assert.ok(out.includes(`href="mailto:?subject=${t}&amp;body=${u}"`));
    assert.doesNotMatch(out, /facebook/);
  });

  it("offers every brand as a network choice, plus email, phone and website", () => {
    const field = contentField("social", "items");
    const choices = field?.kind === "items" ? field.itemFields?.find((f) => f.key === "network") : undefined;
    const values = choices && "options" in choices ? (choices.options ?? []).map((o) => o.value) : [];
    for (const k of Object.keys(BRAND_ICONS)) assert.ok(values.includes(k), k);
    for (const k of ["email", "phone", "website"]) assert.ok(values.includes(k), k);
  });

  it("rejects unsafe profile links", () => {
    const field = contentField("social", "items")!;
    assert.equal(contentSchema(field).safeParse([{ network: "x", link: { label: "", href: "javascript:alert(1)" } }]).success, false);
    assert.equal(contentSchema(field).safeParse([{ network: "x", link: { label: "", href: "https://x.com/aurelia" } }]).success, true);
  });
});

describe("audio player", () => {
  it("accepts uploads and https audio files only", () => {
    assert.equal(parseAudioUrl("/uploads/site/a.mp3"), "/uploads/site/a.mp3");
    assert.equal(parseAudioUrl("https://cdn.example/ep1.m4a"), "https://cdn.example/ep1.m4a");
    assert.equal(parseAudioUrl("http://cdn.example/ep1.mp3"), null);
    assert.equal(parseAudioUrl("https://cdn.example/ep1.exe"), null);
    assert.equal(parseAudioUrl("javascript:alert(1)"), null);
  });

  it("renders the native player with title, artist and download control", () => {
    const { doc } = withWidget("audio", { audio: { assetId: null, src: "https://cdn.example/ep1.mp3" }, download: false });
    const out = render(doc);
    assert.match(out, /<strong>Episode 1: Light and space<\/strong><span>The Aurelia podcast<\/span>/);
    assert.match(out, /<audio controls="" preload="metadata" src="https:\/\/cdn.example\/ep1.mp3" controlsList="nodownload" aria-label="Episode 1: Light and space">/);
  });

  it("renders nothing live without a file, a placeholder on the canvas", () => {
    const { doc } = withWidget("audio");
    assert.doesNotMatch(render(doc), /<audio/);
    assert.match(render(doc, { editor: true }), /Audio player \(pick a file/);
  });
});

describe("embed code", () => {
  const def = (WIDGETS.embed.settings ?? []).find((d) => d.key === "code") as SettingDef;

  it("shows a single https iframe directly", () => {
    const { doc } = withWidget("embed", { code: '<iframe src="https://cal.example/aurelia?embed=1&amp;x=2" width="100%"></iframe>' });
    const out = render(doc);
    assert.match(out, /<iframe src="https:\/\/cal.example\/aurelia\?embed=1&amp;x=2" title="Embedded content" loading="lazy"/);
    assert.doesNotMatch(out, /srcDoc|sandbox/);
  });

  it("runs anything else in a sandbox without same-origin access", () => {
    const { doc } = withWidget("embed", { code: '<div id="w"></div><script src="https://widgets.example/w.js"></script>' });
    const out = render(doc);
    const frame = out.match(/<iframe [^>]*>/)![0];
    assert.match(frame, /srcDoc="[^"]*&lt;script src=&quot;https:\/\/widgets.example\/w.js&quot;&gt;/);
    assert.match(frame, /sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation"/);
    assert.doesNotMatch(frame, /allow-same-origin/);
    assert.doesNotMatch(out.replace(/srcDoc="[^"]*"/, ""), /<script/);
  });

  it("sandboxes http iframes and iframes with extra markup", () => {
    for (const code of ['<iframe src="http://insecure.example"></iframe>', '<iframe src="https://a.example"></iframe><script>x()</script>']) {
      const out = render(withWidget("embed", { code }).doc);
      assert.match(out, /sandbox=/, code);
    }
  });

  it("validates the code setting: multiline allowed, length and control characters refused", () => {
    assert.equal(settingProblem(def, "<div>\n\t<p>hi</p>\r\n</div>"), null);
    assert.ok(settingProblem(def, "x".repeat(20001)));
    assert.ok(settingProblem(def, "a\u0000b"));
    assert.ok(settingProblem(def, 42));
  });
});

describe("dynamic presets", () => {
  it("ships site logo, site title, post title, post content, featured image and a post grid", () => {
    const ids = Object.keys(PRESETS);
    for (const id of ["preset:site-logo", "preset:site-title", "preset:post-title", "preset:post-content", "preset:featured-image", "preset:post-grid"]) assert.ok(ids.includes(id), id);
  });
});

describe("JSON export example (docs/examples/hero-pricing-contact.json)", () => {
  const example = JSON.parse(readFileSync(new URL("../docs/examples/hero-pricing-contact.json", import.meta.url), "utf8")) as BuilderDocument;

  it("is a valid page document whose content passes the editor's checks", () => {
    assert.equal(structuralProblem(example), null);
    for (const node of Object.values(example.nodes)) {
      for (const field of WIDGETS[node.type].contentFields) {
        if (node.props[field.key] === undefined) continue;
        const parsed = contentSchema(field).safeParse(node.props[field.key]);
        assert.ok(parsed.success, `${node.type}.${field.key}: ${parsed.success ? "" : parsed.error.issues[0]?.message}`);
      }
    }
  });

  it("renders the hero, three plans and the contact form", () => {
    const out = render(example, { formAction: "/api/v1/sites/demo/forms" });
    assert.match(out, /<h1[^>]*>Websites your team can actually update<\/h1>/);
    for (const plan of ["Starter", "Studio", "Agency"]) assert.ok(out.includes(plan), plan);
    assert.match(out, /Most popular/);
    assert.match(out, /<form [^>]*action="\/api\/v1\/sites\/demo\/forms"/);
  });
});
