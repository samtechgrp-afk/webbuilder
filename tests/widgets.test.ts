import "./helpers/allow-server-only";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { contentSchema } from "../src/lib/builder/content";
import { ICON_NAMES } from "../src/lib/builder/icons";
import { embedUrl, mapEmbedUrl, parseVideoUrl } from "../src/lib/builder/media";
import { authorizeChanges, diffDocuments } from "../src/lib/builder/policy";
import { PRESETS } from "../src/lib/builder/presets";
import { SiteDocument } from "../src/lib/builder/render";
import { settingProblem, settingValue } from "../src/lib/builder/settings";
import { createWidgetTree, insertNode, structuralProblem } from "../src/lib/builder/tree";
import type { BuilderDocument, BuilderNode, WidgetType } from "../src/lib/builder/types";
import { WIDGET_CATEGORIES, WIDGETS, contentField } from "../src/lib/builder/widgets";
import { composeDocument, translatableNodes } from "../src/lib/i18n/translate";
import { SYSTEM_ROLES } from "../src/lib/rbac";
import { normaliseContent } from "../src/server/content-service";
import type { TenantContext } from "../src/lib/tenant";

const designer = { permissions: SYSTEM_ROLES.designer.permissions };
const client = { permissions: SYSTEM_ROLES.client_admin.permissions };

const empty = (): BuilderDocument => ({ version: 1, rootId: "root", nodes: { root: { id: "root", type: "section", props: {}, style: {}, children: [] } } });

function withWidget(key: WidgetType | string, patch: Partial<BuilderNode> = {}) {
  const doc = empty();
  const { node, extra } = createWidgetTree(doc, key);
  const next = insertNode(doc, { ...node, ...patch, props: { ...node.props, ...patch.props } }, "root", 0, extra)!;
  return { doc: next, id: node.id };
}

const html = (doc: BuilderDocument, editor = false) => renderToStaticMarkup(createElement(SiteDocument, { doc, editor })).replace(/<style>[\s\S]*?<\/style>/, "");

describe("widget registry", () => {
  for (const [type, def] of Object.entries(WIDGETS)) {
    it(`${type}: category, palette icon, valid defaults`, () => {
      assert.ok(def.category in WIDGET_CATEGORIES);
      assert.ok(ICON_NAMES.has(def.icon), `${def.icon} is in the icon set`);
      for (const s of def.settings ?? []) assert.equal(settingProblem(s, s.default), null, `${type}.${s.key} default`);
      const { doc } = withWidget(type);
      assert.equal(structuralProblem(doc), null);
    });
  }

  for (const [key, preset] of Object.entries(PRESETS)) {
    it(`preset ${key} builds a sound tree`, () => {
      assert.ok(ICON_NAMES.has(preset.icon));
      const { doc } = withWidget(key);
      assert.equal(structuralProblem(doc), null);
    });
  }
});

describe("widget settings", () => {
  it("rejects unknown options, out-of-range numbers, CSS injection and unknown icons", () => {
    const bad: [WidgetType, Record<string, unknown>][] = [
      ["divider", { shape: "spiral" }],
      ["divider", { thickness: 99 }],
      ["divider", { color: "red;background:url(https://x)" }],
      ["icon", { icon: "sparkles", hover: "spin" }],
      ["button", { icon: "not-an-icon" }],
      ["section", { bgVideo: { src: "/x.mp4" } }],
      ["video", { autoplay: "yes" }],
    ];
    for (const [type, props] of bad) {
      const { doc, id } = withWidget(type);
      doc.nodes[id].props = { ...doc.nodes[id].props, ...props };
      assert.ok(structuralProblem(doc), `${type} ${JSON.stringify(props)}`);
    }
  });

  it("falls back to defaults for unset or invalid values", () => {
    const defs = WIDGETS.button.settings;
    assert.equal(settingValue(defs, { props: {} }, "hover"), "lift");
    assert.equal(settingValue(defs, { props: { hover: "bogus" } }, "hover"), "lift");
    assert.equal(settingValue(defs, { props: { hover: "glow" } }, "hover"), "glow");
  });

  it("are design changes: clients can't change them", () => {
    const { doc, id } = withWidget("video");
    const next = structuredClone(doc);
    next.nodes[id].props.autoplay = true;
    const changes = diffDocuments(doc, next);
    assert.equal(changes[0]?.kind, "design");
    assert.equal(authorizeChanges(doc, changes, designer).length, 0);
    assert.equal(authorizeChanges(doc, changes, client).length, 1);
  });
});

describe("video and map embeds", () => {
  it("accepts YouTube, Vimeo and https video files only", () => {
    assert.deepEqual(parseVideoUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42"), { kind: "youtube", id: "dQw4w9WgXcQ", start: 42 });
    assert.deepEqual(parseVideoUrl("https://youtu.be/dQw4w9WgXcQ"), { kind: "youtube", id: "dQw4w9WgXcQ", start: undefined });
    assert.equal(parseVideoUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ")?.kind, "youtube");
    assert.deepEqual(parseVideoUrl("https://vimeo.com/76979871"), { kind: "vimeo", id: "76979871" });
    assert.equal(parseVideoUrl("https://cdn.example.com/a.mp4")?.kind, "file");
    for (const bad of ["http://youtu.be/dQw4w9WgXcQ", "https://evil.example/page", "javascript:alert(1)", "https://youtube.com/watch?v=short", "/etc/passwd"]) {
      assert.equal(parseVideoUrl(bad), null, bad);
    }
  });

  it("builds privacy-friendly embed URLs with playback options", () => {
    const yt = embedUrl({ kind: "youtube", id: "dQw4w9WgXcQ" }, { autoplay: true, loop: true });
    assert.match(yt, /^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?/);
    assert.match(yt, /autoplay=1/);
    assert.match(yt, /mute=1/);
    assert.match(yt, /playlist=dQw4w9WgXcQ/);
    assert.match(embedUrl({ kind: "vimeo", id: "1" }, {}), /dnt=1/);
    assert.equal(mapEmbedUrl("10 Downing St, London", 15, "satellite"), "https://maps.google.com/maps?q=10+Downing+St%2C+London&z=15&t=k&output=embed");
  });

  it("validates video and icon content", () => {
    const video = contentSchema(contentField("video", "video")!);
    assert.ok(video.safeParse({ assetId: null, src: "https://vimeo.com/76979871" }).success);
    assert.ok(video.safeParse({ assetId: null, src: "" }).success);
    assert.equal(video.safeParse({ assetId: null, src: "https://evil.example/x" }).success, false);
    const icon = contentSchema(contentField("icon", "icon")!);
    assert.ok(icon.safeParse("rocket").success);
    assert.equal(icon.safeParse("<svg>").success, false);
  });
});

describe("rendering the widget library", () => {
  it("renders each new widget server-side", () => {
    const cases: [WidgetType | string, RegExp][] = [
      ["spacer", /data-w="spacer"[^>]*aria-hidden="true"/],
      ["divider", /role="separator"[^>]*data-shape="line"/],
      ["prose", /<strong>memorable<\/strong>/],
      ["icon", /<svg[^>]*data-icon="sparkles"/],
      ["iconbox", /<h3>Fast to launch<\/h3>/],
      ["map", /<iframe src="https:\/\/maps\.google\.com\/maps\?q=Eiffel\+Tower%2C\+Paris&amp;z=14&amp;t=m&amp;output=embed"/],
    ];
    for (const [type, re] of cases) assert.match(html(withWidget(type).doc), re, String(type));
  });

  it("renders shape dividers, gradient headings, button icons and section backdrops", () => {
    assert.match(html(withWidget("divider", { props: { shape: "wave", flip: true } }).doc), /<svg viewBox="0 0 1200 120"[^>]*style="transform:scaleX\(-1\)"/);
    assert.match(html(withWidget("heading", { props: { gradient: true } }).doc), /data-gradient="" style="--wb-grad:linear-gradient\(90deg, var\(--color-primary\), var\(--color-accent\)\)"/);
    assert.match(html(withWidget("button", { props: { icon: "arrow-right", hover: "glow" } }).doc), /data-hover="glow">Learn more<svg/);
    const section = html(withWidget("section", { props: { bgVideo: { assetId: "v1", src: "/uploads/v.mp4" }, overlay: "#000", overlayOpacity: 40 } }).doc);
    assert.match(section, /data-backdrop=""><video data-bg-layer="" src="\/uploads\/v\.mp4" autoPlay="" muted="" loop="" playsInline=""/);
    assert.match(section, /data-overlay=""[^>]*style="background:#000;opacity:0.4"/);
  });

  it("renders videos as privacy-enhanced iframes or a native player", () => {
    assert.match(html(withWidget("video", { props: { video: { assetId: null, src: "https://youtu.be/dQw4w9WgXcQ" } } }).doc), /<iframe src="https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/);
    assert.match(html(withWidget("video", { props: { video: { assetId: "v1", src: "https://pub.r2.dev/v.mp4" }, loop: true } }).doc), /<video src="https:\/\/pub\.r2\.dev\/v\.mp4" controls="" loop=""/);
    assert.match(html(withWidget("video").doc), /data-w="video" data-empty=""/);
  });

  it("adds the lightbox link and ships the enhancer only when a widget needs it", () => {
    const image = { assetId: "a1", src: "/uploads/a.webp", alt: "Lamp" };
    const plain = html(withWidget("image", { props: { image } }).doc);
    assert.doesNotMatch(plain, /data-lightbox/);
    const lit = withWidget("image", { props: { image, lightbox: true } });
    assert.match(html(lit.doc), /<a href="\/uploads\/a\.webp" data-lightbox="[^"]+" aria-label="Open Lamp"><img/);
    // The editor canvas never runs it.
    assert.match(html(withWidget("gallery", { props: { images: [image], layout: "masonry", columns: 4 } }).doc), /data-layout="masonry" style="--wb-cols:4"/);
  });
});

describe("translations and the widget library", () => {
  it("translates rich text but keeps videos and icons shared", () => {
    const { doc: a, id: proseId } = withWidget("prose");
    const { node: box } = createWidgetTree(a, "iconbox");
    const doc = insertNode(a, box, "root", 1)!;
    const fields = translatableNodes(doc).flatMap((n) => n.fields.map((f) => `${n.type}.${f.key}`));
    assert.ok(fields.includes("prose.html"));
    assert.ok(fields.includes("iconbox.title"));
    assert.ok(!fields.includes("iconbox.icon"));
    const composed = composeDocument(doc, { type: "translation", version: 1, overrides: { [proseId]: { html: "<p>Bonjour</p>" }, [box.id]: { icon: "heart", title: "Rapide" } } });
    assert.equal(composed.nodes[proseId].props.html, "<p>Bonjour</p>");
    assert.equal(composed.nodes[box.id].props.title, "Rapide");
    assert.equal(composed.nodes[box.id].props.icon, "rocket");
  });
});

describe("saving widget content", () => {
  const tenant = (assets: Record<string, { url: string; mimeType: string }>) =>
    ({ db: { mediaAsset: { findUnique: async ({ where }: { where: { id: string } }) => assets[where.id] ?? null } } }) as unknown as TenantContext;

  it("sanitises rich text before it is stored", async () => {
    const { doc, id } = withWidget("prose", { props: { html: '<p onclick="x()">Hi <script>alert(1)</script><a href="javascript:alert(1)">link</a><img src=x onerror=alert(1)></p>' } });
    await normaliseContent(tenant({}), doc, [{ nodeId: id, field: "html" }]);
    assert.equal(doc.nodes[id].props.html, "<p>Hi <a>link</a></p>");
  });

  it("takes library video URLs from the media library, never the browser", async () => {
    const { doc, id } = withWidget("video", { props: { video: { assetId: "v1", src: "https://evil.example/x.mp4" } } });
    await normaliseContent(tenant({ v1: { url: "/uploads/s/v1.mp4", mimeType: "video/mp4" } }), doc, [{ nodeId: id, field: "video" }]);
    assert.deepEqual(doc.nodes[id].props.video, { assetId: "v1", src: "/uploads/s/v1.mp4" });
    const other = withWidget("video", { props: { video: { assetId: "img", src: "" } } });
    await assert.rejects(normaliseContent(tenant({ img: { url: "/uploads/a.webp", mimeType: "image/webp" } }), other.doc, [{ nodeId: other.id, field: "video" }]));
  });
});
