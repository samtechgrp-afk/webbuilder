import "./helpers/allow-server-only";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { contentSchema } from "../src/lib/builder/content";
import { authorizeChanges, diffDocuments } from "../src/lib/builder/policy";
import { anchorSlug, parseShortcodes, shapePoints, soundcloudEmbedUrl } from "../src/lib/builder/render-catalog";
import { SiteDocument } from "../src/lib/builder/render";
import { settingProblem } from "../src/lib/builder/settings";
import { createWidgetTree, insertNode, structuralProblem } from "../src/lib/builder/tree";
import type { BuilderDocument, BuilderNode, WidgetType } from "../src/lib/builder/types";
import { WIDGET_CATEGORIES, WIDGETS, BINDABLE } from "../src/lib/builder/widgets";
import { CATALOG_WIDGETS } from "../src/lib/builder/widgets-catalog";
import { SYSTEM_ROLES } from "../src/lib/rbac";

const designer = { permissions: SYSTEM_ROLES.designer.permissions };
const client = { permissions: SYSTEM_ROLES.client_admin.permissions };

const empty = (): BuilderDocument => ({ version: 1, rootId: "root", nodes: { root: { id: "root", type: "section", props: {}, style: {}, children: [] } } });

function withWidget(key: WidgetType | string, patch: Partial<BuilderNode> = {}) {
  const doc = empty();
  const { node, extra } = createWidgetTree(doc, key);
  const next = insertNode(doc, { ...node, ...patch, props: { ...node.props, ...patch.props } }, "root", 0, extra)!;
  return { doc: next, id: node.id };
}

const html = (doc: BuilderDocument, opts: { editor?: boolean; page?: { url: string; title: string; path: string; crumbs: []; now?: string } } = {}) =>
  renderToStaticMarkup(createElement(SiteDocument, { doc, editor: opts.editor, page: opts.page })).replace(/<style>[\s\S]*?<\/style>/, "");

/** The 47 widgets of the master catalog, by category, mapped to their registry types. */
const CATALOG: Record<string, WidgetType[]> = {
  "Layout & structure": ["frame", "container", "grid", "divider", "spacer", "anchor", "sidebar", "linkinbio"],
  "Shapes & vectors": ["rectangle", "ellipse", "polygon", "star", "line"],
  "Basic content": ["heading", "prose", "button", "icon", "textpath", "readmore", "detaillist", "tags", "buttongroup"],
  "Media & embeds": ["image", "video", "gallery", "carousel", "soundcloud", "map", "herocarousel", "herobanner", "imagebanner"],
  "Composite cards": ["projectgrid", "imagebox", "iconbox", "iconlist", "testimonial", "profilecard"],
  "Interactive & UI": ["rating", "counter", "tabs", "accordion", "social", "progress", "alert"],
  "Custom code": ["shortcode", "embed", "codesnippet"],
};

describe("master catalog", () => {
  it("covers all 47 widgets, each registered, bindable-listed and in its category", () => {
    const all = Object.values(CATALOG).flat();
    assert.equal(all.length, 47);
    assert.equal(new Set(all).size, 47);
    const catKey = Object.fromEntries(Object.entries(WIDGET_CATEGORIES).map(([k, v]) => [v, k]));
    for (const [label, types] of Object.entries(CATALOG)) {
      for (const t of types) {
        assert.ok(WIDGETS[t], `${t} is registered`);
        assert.ok(Array.isArray(BINDABLE[t]), `${t} has a bindable list`);
        assert.equal(WIDGETS[t].category, catKey[label], `${t} sits in ${label}`);
      }
    }
  });

  for (const type of Object.keys(CATALOG_WIDGETS) as WidgetType[]) {
    it(`${type}: valid defaults that render on the canvas and the live site`, () => {
      const def = WIDGETS[type];
      for (const s of def.settings ?? []) assert.equal(settingProblem(s, s.default), null, `${type}.${s.key} default`);
      for (const f of def.contentFields) {
        const v = def.defaults.props[f.key];
        if (v !== undefined) assert.ok(contentSchema(f).safeParse(v).success, `${type}.${f.key} default content is valid`);
      }
      const { doc } = withWidget(type);
      assert.equal(structuralProblem(doc), null);
      assert.match(html(doc, { editor: true }), new RegExp(`data-w="${type}"`));
      html(doc);
    });
  }
});

describe("catalog widget rendering", () => {
  it("frames stack layers and clip, grids arrive with three cells, sidebars stick", () => {
    assert.match(html(withWidget("frame", { props: { arrange: "stack" } }).doc), /data-w="frame" data-arrange="stack" data-clip=""/);
    const grid = withWidget("grid");
    assert.equal(grid.doc.nodes[grid.id].children?.length, 3);
    assert.match(html(withWidget("sidebar").doc), /<aside[^>]*data-sticky="" style="--wb-top:24px"/);
  });

  it("menu anchors get a safe id and a scroll margin", () => {
    assert.equal(anchorSlug("Our Services!"), "our-services");
    assert.equal(anchorSlug("\"><script>"), "script");
    assert.match(html(withWidget("anchor", { props: { anchorId: "Contact us" } }).doc), /id="contact-us" style="scroll-margin-top:80px"/);
  });

  it("draws polygons and stars from settings", () => {
    assert.equal(shapePoints("polygon", 4), "50,0 100,50 50,100 0,50");
    assert.equal(shapePoints("star", 5, 50).split(" ").length, 10);
    assert.match(html(withWidget("star").doc), /<polygon points="50,0 [^"]+" fill="var\(--color-primary, var\(--color-accent, #6366f1\)\)"/);
    assert.match(html(withWidget("rectangle", { props: { strokeWidth: 3, stroke: "#111" } }).doc), /border:3px solid #111;border-radius:12px/);
    assert.match(html(withWidget("line", { props: { start: "circle" } }).doc), /<circle[^>]*>.*data-line-bar.*<path d="M0,0 L10,5/);
  });

  it("puts text on an SVG path and makes read more work without JavaScript", () => {
    assert.match(html(withWidget("textpath").doc), /<textPath href="#tp-[^"]+" startOffset="50%">Made with care/);
    const rm = html(withWidget("readmore").doc);
    assert.match(rm, /<input type="checkbox" id="rm-[^"]+" data-rm-toggle=""/);
    assert.match(rm, /--wb-lines:3/);
  });

  it("renders detail lists, tag chips and button groups", () => {
    assert.match(html(withWidget("detaillist").doc), /<dl><div data-dl-row=""><dt><svg[^>]*data-icon="briefcase"[^>]*>.*<\/svg>Client<\/dt><dd>Northwind Studio<\/dd>/);
    assert.match(html(withWidget("tags", { props: { items: [{ label: "Web", link: { label: "", href: "/tags/web" } }, { label: "Print" }] } }).doc), /<a href="\/tags\/web" data-tag="">Web<\/a>.*<span data-tag="">Print<\/span>/);
    assert.match(html(withWidget("buttongroup").doc), /<a href="\/contact" data-look="solid">Get started<svg.*<a href="\/work" data-look="outline">See our work<\/a>/);
  });

  it("embeds SoundCloud addresses only", () => {
    const url = soundcloudEmbedUrl("https://soundcloud.com/forss/flickermood?si=1", { color: "#ff5500", autoplay: false, visual: true, comments: true });
    assert.equal(url, "https://w.soundcloud.com/player/?url=https%3A%2F%2Fsoundcloud.com%2Fforss%2Fflickermood&color=%23ff5500&auto_play=false&visual=true&show_comments=true&hide_related=true&show_teaser=false");
    assert.equal(soundcloudEmbedUrl("https://evil.example/forss", { color: "", autoplay: false, visual: false, comments: false }), null);
    assert.equal(soundcloudEmbedUrl("javascript:alert(1)", { color: "", autoplay: false, visual: false, comments: false }), null);
    assert.match(soundcloudEmbedUrl("https://soundcloud.com/a/b", { color: "red;x", autoplay: false, visual: false, comments: false })!, /color=%23ff5500/);
    assert.match(html(withWidget("soundcloud").doc), /<iframe src="https:\/\/w\.soundcloud\.com\/player\/\?url=/);
    assert.equal(html(withWidget("soundcloud", { props: { url: "https://example.com/x" } }).doc).includes("iframe"), false);
  });

  it("hero carousels reuse the carousel track and load the enhancer; hero banners lead with an h1", () => {
    const hc = renderToStaticMarkup(createElement(SiteDocument, { doc: withWidget("herocarousel").doc }));
    assert.match(hc, /data-w="herocarousel"[^>]*data-autoplay="6000" data-loop=""/);
    assert.match(hc, /<div data-track="" tabindex="0">/);
    assert.match(hc, /<h2>Spaces that feel like home<\/h2>/);
    const hb = html(withWidget("herobanner").doc);
    assert.match(hb, /<h1>Websites that win you work<\/h1>/);
    assert.match(hb, /<a href="\/process" data-look="outline">Our process<\/a>/);
    assert.match(html(withWidget("imagebanner").doc), /data-position="bottom-left" data-zoom="".*<a href="\/shop" data-stretch="">Shop the edit<\/a>/);
  });

  it("filters project grids by category with radio buttons (no script)", () => {
    const out = html(withWidget("projectgrid").doc);
    assert.match(out, /<input type="radio" data-pg-filter="0" name="pg-[^"]+" checked=""\/><span>All<\/span>/);
    assert.match(out, /data-pg-filter="3"[^>]*\/><span>Print<\/span>/);
    assert.match(out, /<li data-pg-item="" data-cat="2"><a href="\/work\/field-notes"/);
    assert.equal(html(withWidget("projectgrid", { props: { filter: false } }).doc).includes("data-pg-filters"), false);
  });

  it("renders image boxes, icon lists and profile cards", () => {
    assert.match(html(withWidget("imagebox").doc), /<h3>Considered design<\/h3><p>.*<a href="\/services" data-ibx-link="">Learn more<svg/);
    assert.match(html(withWidget("iconlist").doc), /<li><span data-il-icon=""><svg[^>]*data-icon="check"/);
    const pc = html(withWidget("profilecard").doc);
    assert.match(pc, /<h3>Sam Taylor<\/h3><p data-pc-role="">Creative director<\/p>/);
    assert.match(pc, /<a href="https:\/\/linkedin\.com\/" aria-label="LinkedIn"[^>]*rel="me noopener noreferrer"/);
  });

  it("alerts pick an icon per tone and close without JavaScript", () => {
    const out = html(withWidget("alert", { props: { tone: "warning", dismissible: true } }).doc);
    assert.match(out, /role="note" data-tone="warning"/);
    assert.match(out, /data-icon="triangle-alert"/);
    assert.match(out, /<input type="checkbox" id="al-[^"]+" data-alert-dismiss="" hidden=""\/>/);
    assert.equal(html(withWidget("alert", { props: { dismissible: true } }).doc, { editor: true }).includes("data-alert-dismiss"), false);
  });

  it("expands shortcodes and drops unknown ones on the live site", () => {
    assert.deepEqual(parseShortcodes('Hi [year] [button label="Go" url="/x"]!'), [
      { text: "Hi " },
      { code: "year", attrs: {}, raw: "[year]" },
      { text: " " },
      { code: "button", attrs: { label: "Go", url: "/x" }, raw: '[button label="Go" url="/x"]' },
      { text: "!" },
    ]);
    const page = { url: "https://a.example/", title: "Home", path: "/", crumbs: [] as [], now: "2031-05-02T10:00:00.000Z" };
    const live = html(withWidget("shortcode", { props: { code: '© [year] [page_title] [nope] [link label="Up" url="javascript:alert(1)"] [button label="Book" url="/book"]' } }).doc, { page });
    assert.match(live, /© 2031 Home {3}<a href="\/book" data-sc="button">Book<\/a>/);
    assert.equal(live.includes("javascript"), false);
    assert.match(html(withWidget("shortcode", { props: { code: "[nope]" } }).doc, { editor: true }), /<mark data-sc-unknown=""[^>]*>\[nope\]<\/mark>/);
  });

  it("code snippets escape the code, number lines and only show copy once enhanced", () => {
    const out = renderToStaticMarkup(createElement(SiteDocument, { doc: withWidget("codesnippet", { props: { code: '<script>alert("x")</script>\nline 2', filename: "app.html" } }).doc }));
    assert.match(out, /<span data-ln="">&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;\n<\/span><span data-ln="">line 2<\/span>/);
    assert.match(out, /<span>app\.html<\/span><button type="button" data-copy=""/);
    assert.match(out, /\[data-w="codesnippet"\]:not\(\[data-ready\]\) \[data-copy\]\{visibility:hidden\}/);
  });
});

describe("catalog widget guardrails", () => {
  it("rejects bad settings", () => {
    const bad: [WidgetType, string, unknown][] = [
      ["polygon", "sides", 2],
      ["star", "points", 99],
      ["rectangle", "fill", "red;background:url(https://x)"],
      ["line", "end", "rocket"],
      ["codesnippet", "language", "brainfuck"],
      ["herocarousel", "headingTag", "div"],
    ];
    for (const [type, key, v] of bad) {
      const def = WIDGETS[type].settings!.find((s) => s.key === key)!;
      assert.notEqual(settingProblem(def, v), null, `${type}.${key}=${String(v)}`);
    }
  });

  it("lets clients edit catalog content but keeps settings with designers", () => {
    const { doc, id } = withWidget("herobanner");
    const edited = structuredClone(doc);
    edited.nodes[id].props.title = "A new headline";
    assert.equal(authorizeChanges(doc, diffDocuments(doc, edited), client).length, 0);
    const styled = structuredClone(doc);
    styled.nodes[id].props.overlay = "rgba(255,0,0,.5)";
    assert.equal(authorizeChanges(doc, diffDocuments(doc, styled), client).length, 1);
    assert.equal(authorizeChanges(doc, diffDocuments(doc, styled), designer).length, 0);
  });

  it("validates list content of the new widgets", () => {
    const tags = WIDGETS.tags.contentFields[0];
    assert.equal(contentSchema(tags).safeParse([{ label: "ok", link: { label: "", href: "javascript:alert(1)" } }]).success, false);
    const group = WIDGETS.buttongroup.contentFields[0];
    assert.equal(contentSchema(group).safeParse([{ link: { label: "Go", href: "/" }, look: "rainbow" }]).success, false);
    assert.equal(contentSchema(group).safeParse(Array.from({ length: 7 }, () => ({ link: { label: "Go", href: "/" } }))).success, false);
  });

  it("leaves documents without catalog widgets byte-identical apart from the shared stylesheet", () => {
    const { doc } = withWidget("heading");
    assert.equal(html(doc), html(structuredClone(doc)));
    assert.match(html(doc), /^<div class="site-root"><section class="n-root" data-w="section"><h2 class="n-[^"]+" data-w="heading">A considered headline<\/h2><\/section><\/div>$/);
  });
});
