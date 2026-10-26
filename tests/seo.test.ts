import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { absoluteUrl, applyTemplate, canonicalPointsElsewhere, resolveSeo, seoIssues } from "../src/lib/seo/meta";
import { siteSeoSchema } from "../src/lib/seo/settings";
import { robotsTxt, sitemapXml } from "../src/lib/seo/sitemap";

const base = "https://aurelia.example.com";
const site = { name: "Aurelia", seo: {} };

describe("resolving SEO", () => {
  it("applies the title template, with the site name as default", () => {
    assert.equal(applyTemplate(undefined, "Studio", "Aurelia"), "Studio · Aurelia");
    assert.equal(applyTemplate("%s | {site} Interiors", "Studio", "Aurelia"), "Studio | Aurelia Interiors");
    assert.equal(applyTemplate("no placeholder", "Studio", "Aurelia"), "Studio · Aurelia");
  });

  it("prefers the entry's own title and description, then excerpt, then site default", () => {
    const own = resolveSeo({ title: "Studio", path: "/studio", seo: { seoTitle: "Our studio in Boston", seoDescription: "Hi" } }, site, base);
    assert.equal(own.title, "Our studio in Boston");
    assert.equal(own.description, "Hi");
    assert.ok(own.customTitle);
    const fallback = resolveSeo({ title: "Studio", path: "/studio", excerpt: "From the excerpt" }, { name: "Aurelia", seo: { defaultDescription: "Default" } }, base);
    assert.equal(fallback.title, "Studio · Aurelia");
    assert.equal(fallback.description, "From the excerpt");
    assert.equal(resolveSeo({ title: "Studio", path: "/studio" }, { name: "Aurelia", seo: { defaultDescription: "Default" } }, base).description, "Default");
  });

  it("uses the home title on the home page and builds absolute canonicals", () => {
    const home = resolveSeo({ title: "Home", path: "/", isHome: true }, { name: "Aurelia", seo: { homeTitle: "Aurelia Interiors · Boston" } }, base);
    assert.equal(home.title, "Aurelia Interiors · Boston");
    assert.equal(home.canonical, "https://aurelia.example.com/");
    assert.equal(absoluteUrl("http://localhost:3000/sites/aurelia/", "/shop/lamp"), "http://localhost:3000/sites/aurelia/shop/lamp");
  });

  it("is not indexable when noindex, excluded or the whole site is discouraged", () => {
    assert.equal(resolveSeo({ title: "a", path: "/a", seo: { noIndex: true } }, site, base).index, false);
    assert.equal(resolveSeo({ title: "a", path: "/a", excluded: true }, site, base).index, false);
    assert.equal(resolveSeo({ title: "a", path: "/a" }, { name: "x", seo: { discourageIndexing: true } }, base).index, false);
    assert.equal(resolveSeo({ title: "a", path: "/a" }, site, base).index, true);
  });

  it("spots a canonical that points elsewhere", () => {
    const r = resolveSeo({ title: "a", path: "/a", seo: { canonicalUrl: "https://medium.com/@aurelia/a" } }, site, base);
    assert.ok(canonicalPointsElsewhere(r, base, "/a"));
    assert.ok(!canonicalPointsElsewhere(resolveSeo({ title: "a", path: "/a" }, site, base), base, "/a"));
  });
});

describe("SEO audit", () => {
  const counts = (titles: string[]) => {
    const m = new Map<string, number>();
    for (const t of titles) m.set(t.toLowerCase(), (m.get(t.toLowerCase()) ?? 0) + 1);
    return m;
  };

  it("flags missing, short and long descriptions, long and duplicate titles", () => {
    const long = resolveSeo({ title: "x".repeat(70), path: "/a" }, site, base);
    const codes = seoIssues(long, { hasImage: false, titleCounts: counts([long.title, long.title]) }).map((i) => i.code);
    assert.deepEqual(codes, ["title-long", "duplicate-title", "description-missing", "no-image"]);
    const short = resolveSeo({ title: "a", path: "/a", seo: { seoDescription: "Too short" } }, site, base);
    assert.ok(seoIssues(short, { hasImage: true, titleCounts: counts([short.title]) }).some((i) => i.code === "description-short"));
    const good = resolveSeo({ title: "Studio", path: "/a", seo: { seoDescription: "A calm, considered interior architecture studio working across New England homes." } }, site, base);
    assert.deepEqual(seoIssues(good, { hasImage: true, titleCounts: counts([good.title]) }), []);
  });
});

describe("sitemap and robots", () => {
  it("writes a valid, escaped urlset", () => {
    const xml = sitemapXml([{ loc: "https://a.test/?q=1&b=<x>", lastmod: new Date("2026-10-25T00:00:00Z"), priority: 1 }]);
    assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>/);
    assert.ok(xml.includes("<loc>https://a.test/?q=1&amp;b=&lt;x&gt;</loc>"));
    assert.ok(xml.includes("<lastmod>2026-10-25T00:00:00.000Z</lastmod><priority>1.0</priority>"));
    assert.ok(sitemapXml([]).includes("</urlset>"));
  });

  it("points crawlers at the sitemap, or disallows everything", () => {
    const open = robotsTxt({ sitemapUrl: "https://a.test/sitemap.xml", disallowAll: false });
    assert.ok(open.includes("Allow: /") && open.includes("Disallow: /admin") && open.includes("Sitemap: https://a.test/sitemap.xml"));
    const closed = robotsTxt({ sitemapUrl: "x", disallowAll: true });
    assert.equal(closed, "User-agent: *\nDisallow: /\n");
  });
});

describe("site SEO settings", () => {
  const valid = { titleTemplate: "%s · Aurelia", homeTitle: "", defaultDescription: "", defaultOgImageId: null, twitterHandle: "aurelia", googleVerification: "abc-123_X", bingVerification: "", discourageIndexing: false, excludedPostTypeIds: [] };
  it("normalises the handle and accepts verification codes", () => {
    const r = siteSeoSchema.parse(valid);
    assert.equal(r.twitterHandle, "@aurelia");
  });
  it("rejects a template without %s and markup in verification codes", () => {
    assert.equal(siteSeoSchema.safeParse({ ...valid, titleTemplate: "Aurelia" }).success, false);
    assert.equal(siteSeoSchema.safeParse({ ...valid, googleVerification: '"><script>' }).success, false);
  });
});
