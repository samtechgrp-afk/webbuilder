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

describe("interactive widgets", () => {
  it("renders an exclusive accordion with native <details name>", () => {
    const out = html(withWidget("accordion").doc);
    assert.equal(out.match(/<details name="acc-[^"]+"/g)?.length, 3);
    assert.match(out, /<details name="acc-[^"]+" open=""><summary><h3>How long does a project take\?<\/h3>/);
    const multi = html(withWidget("accordion", { props: { mode: "multi", firstOpen: false } }).doc);
    assert.doesNotMatch(multi, /name="acc-|open=""/);
    // The canvas shows every panel open so they can be reviewed.
    assert.equal(html(withWidget("accordion").doc, true).match(/open=""/g)?.length, 3);
  });

  it("drives tabs with radio buttons (no script) and ships CSS for every position", () => {
    const out = html(withWidget("tabs").doc);
    assert.equal(out.match(/<input type="radio"[^>]*name="tabs-/g)?.length, 3);
    assert.match(out, /checked=""/);
    assert.equal(out.match(/data-tab-panel=""/g)?.length, 3);
  });

  it("renders carousel slides on a scroll-snap track and loads the enhancer", () => {
    const { doc } = withWidget("carousel", { props: { autoplay: true, interval: 4 } });
    const out = renderToStaticMarkup(createElement(SiteDocument, { doc }));
    assert.match(out, /data-autoplay="4000"/);
    assert.equal(out.match(/data-slide=""/g)?.length, 2);
    assert.match(out, /aria-label="Next slide"/);
    assert.match(out, /<a href="\/shop" data-slide-link="">Shop now<\/a>/);
  });

  it("renders testimonials, pricing tables, CTAs, flip boxes, progress bars and counters", () => {
    assert.match(html(withWidget("testimonial").doc), /<figure[^>]*data-w="testimonial"[^>]*><div data-stars="" role="img" aria-label="5 out of 5 stars"/);
    const pricing = html(withWidget("pricing", { props: { featured: true, ribbon: "Popular" } }).doc);
    assert.match(pricing, /data-featured=""/);
    assert.match(pricing, /<strong>\$49<\/strong><span>\/month<\/span>/);
    assert.match(pricing, /data-excluded=""><svg[^>]*data-icon="x"/);
    assert.match(pricing, /<span data-ribbon="">Popular<\/span>/);
    const cta = html(withWidget("cta").doc);
    assert.match(cta, /data-cta-button="primary">Get in touch<\/a>/);
    assert.doesNotMatch(cta, /secondary/, "an empty second button is hidden");
    assert.match(html(withWidget("flipbox").doc), /data-flip-back=""[^>]*><h3>Plan first<\/h3>/);
    assert.match(html(withWidget("progress").doc), /role="progressbar" aria-valuenow="85"[^>]*><span data-progress-fill="" style="width:85%"/);
    assert.match(html(withWidget("counter", { props: { value: 12500 } }).doc), /<span data-count="">12,500<\/span><span>\+<\/span>/);
  });

  it("renders a countdown that shows its end date without JavaScript", () => {
    assert.equal(html(withWidget("countdown").doc), '<div class="site-root"><section class="n-root" data-w="section"></section></div>');
    const out = html(withWidget("countdown", { props: { target: "2027-01-31T18:30" } }).doc);
    assert.match(out, /data-target="2027-01-31T18:30"/);
    assert.match(out, /Ends <time dateTime="2027-01-31T18:30">31 January 2027, 18:30<\/time>/);
    assert.equal(out.match(/data-cd-unit=/g)?.length, 4);
  });

  it("validates list, number and date content", () => {
    const panels = contentSchema(contentField("accordion", "items")!);
    assert.ok(panels.safeParse([{ title: "Q", body: "A" }]).success);
    assert.equal(panels.safeParse([]).success, false, "at least one panel");
    assert.deepEqual(panels.parse([{ title: "Q", body: "A", evil: "<script>" }]), [{ title: "Q", body: "A" }]);
    const slides = contentSchema(contentField("carousel", "items")!);
    assert.equal(slides.safeParse([{ link: { label: "x", href: "javascript:alert(1)" } }]).success, false);
    assert.ok(slides.safeParse([{ link: { label: "", href: "" } }]).success);
    assert.equal(contentSchema(contentField("progress", "value")!).safeParse(101).success, false);
    assert.ok(contentSchema(contentField("countdown", "target")!).safeParse("2027-01-31T18:30").success);
    assert.equal(contentSchema(contentField("countdown", "target")!).safeParse("tomorrow").success, false);
  });

  it("resolves slide images from the media library on save", async () => {
    const t = { db: { mediaAsset: { findUnique: async ({ where }: { where: { id: string } }) => (where.id === "a1" ? { id: "a1", url: "/uploads/s/a1.webp", mimeType: "image/webp", width: 800, height: 600, altText: "Lamp", variants: {} } : null) } } } as unknown as TenantContext;
    const { doc, id } = withWidget("carousel", { props: { items: [{ image: { assetId: "a1", src: "https://evil.example/x.png", alt: "" }, title: "A" }] } });
    await normaliseContent(t, doc, [{ nodeId: id, field: "items" }]);
    const img = (doc.nodes[id].props.items as { image: { src: string } }[])[0].image;
    assert.equal(img.src, "/uploads/s/a1.webp");
    const bad = withWidget("carousel", { props: { items: [{ image: { assetId: "nope", src: "", alt: "" } }] } });
    await assert.rejects(normaliseContent(t, bad.doc, [{ nodeId: bad.id, field: "items" }]));
  });

  it("translates list text by position but keeps the original's structure", () => {
    const { doc, id } = withWidget("pricing");
    const composed = composeDocument(doc, { type: "translation", version: 1, overrides: { [id]: { features: [{ text: "Pages illimitées", included: false }], plan: "Atelier" } } });
    const features = composed.nodes[id].props.features as { text: string; included: boolean }[];
    assert.equal(features.length, 4);
    assert.deepEqual(features[0], { text: "Pages illimitées", included: true });
    assert.equal(features[1].text, "Custom domain");
    assert.equal(composed.nodes[id].props.plan, "Atelier");
  });
});

describe("tilted grid hero", () => {
  const asset = { id: "a1", url: "/uploads/s/a1.webp", mimeType: "image/webp", width: 1600, height: 900, altText: "Dune", variants: {} };
  const t = { db: { mediaAsset: { findUnique: async ({ where }: { where: { id: string } }) => (where.id === "a1" ? asset : null) } } } as unknown as TenantContext;

  it("arrives with a headline and copy inside, like the reference design", () => {
    const { doc, id } = withWidget("tilted-grid-hero");
    const kids = doc.nodes[id].children ?? [];
    assert.equal(kids.length, 2);
    assert.equal(doc.nodes[kids[0]].type, "heading");
    assert.equal(doc.nodes[kids[0]].tag, "h1");
    assert.equal(doc.nodes[kids[1]].type, "text");
    assert.equal(structuralProblem(doc), null);
  });

  it("renders the band behind the child widgets, with placeholders until images are added", () => {
    const { doc } = withWidget("tilted-grid-hero");
    const out = html(doc);
    assert.match(out, /<section[^>]*data-w="tilted-grid-hero"/);
    assert.match(out, /data-tgh=""[^>]*style="container-type:size"/);
    assert.match(out, /aria-hidden="true"[^>]*class="pointer-events-none absolute inset-0/);
    assert.match(out, /@keyframes tgh-o-/);
    assert.match(out, /src="data:image\/svg\+xml/);
    assert.match(out, /data-tgh-content="" data-position="spread"><h1[^>]*>Every frame, brought into focus\.<\/h1>/);
  });

  it("shows its own images and passes the settings through", () => {
    const { doc } = withWidget("tilted-grid-hero", { props: { images: [{ assetId: "a1", src: "/uploads/s/a1.webp", alt: "Dune" }], aspect: "1 / 1", axis: 40 } });
    const out = html(doc);
    assert.match(out, /src="\/uploads\/s\/a1\.webp"/);
    assert.doesNotMatch(out, /data:image\/svg/);
    assert.match(out, /perspective-origin:50% 40%/);
    // Square tiles: width = 1 × tile height.
    assert.match(out, /width:calc\(1 \* min\(26cqh, 55cqw\)\)/);
  });

  it("lets clients swap images but keeps the motion settings with designers", () => {
    const { doc, id } = withWidget("tilted-grid-hero");
    const images = structuredClone(doc);
    images.nodes[id].props.images = [{ assetId: "a1", src: "/uploads/s/a1.webp", alt: "Dune" }];
    assert.equal(authorizeChanges(doc, diffDocuments(doc, images), client).length, 0);
    const speed = structuredClone(doc);
    speed.nodes[id].props.speed = 2;
    assert.equal(authorizeChanges(doc, diffDocuments(doc, speed), client).length, 1);
    assert.equal(authorizeChanges(doc, diffDocuments(doc, speed), designer).length, 0);
  });

  it("rejects out-of-range settings", () => {
    const def = WIDGETS["tilted-grid-hero"].settings!;
    assert.ok(settingProblem(def.find((s) => s.key === "curve")!, 90));
    assert.ok(settingProblem(def.find((s) => s.key === "aspect")!, "7 / 3"));
    assert.equal(settingProblem(def.find((s) => s.key === "speed")!, 2.5), null);
  });

  it("takes gallery URLs from the media library, never the browser", async () => {
    const { doc, id } = withWidget("tilted-grid-hero", { props: { images: [{ assetId: "a1", src: "https://evil.example/x.png", alt: "" }] } });
    await normaliseContent(t, doc, [{ nodeId: id, field: "images" }]);
    const [img] = doc.nodes[id].props.images as { src: string; alt: string }[];
    assert.equal(img.src, "/uploads/s/a1.webp");
    assert.equal(img.alt, "Dune");
    const bad = withWidget("tilted-grid-hero", { props: { images: [{ assetId: "nope", src: "", alt: "" }] } });
    await assert.rejects(normaliseContent(t, bad.doc, [{ nodeId: bad.id, field: "images" }]));
  });
});
