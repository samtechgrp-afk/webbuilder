import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BuilderDocument } from "../src/lib/builder/types";
import type { FieldDef } from "../src/lib/cms/fields";
import {
  entryLocale,
  groupAlternates,
  linkHeader,
  localeBase,
  localeHref,
  localeInputSchema,
  localeLinkBase,
  localePath,
  matchAcceptLanguage,
  splitLocalePath,
  storedLocale,
  suggestPrefix,
  withXDefault,
  type SiteLocaleInfo,
} from "../src/lib/i18n/locales";
import { composeDocument, emptyTranslation, isTranslatableField, isTranslationDocument, mergeEntryFields, translatableNodes } from "../src/lib/i18n/translate";
import { sitemapXml } from "../src/lib/seo/sitemap";

const en: SiteLocaleInfo = { code: "en-US", label: "English", prefix: "en", isDefault: true, currency: "USD", domain: null };
const fr: SiteLocaleInfo = { code: "fr-FR", label: "Français", prefix: "fr", isDefault: false, currency: "EUR", domain: null };
const de: SiteLocaleInfo = { code: "de-DE", label: "Deutsch", prefix: "de", isDefault: false, currency: "EUR", domain: "aurelia.de" };
const locales = [en, fr, de];

describe("locale routing", () => {
  it("splits a language prefix off the path; anything else is the default language", () => {
    assert.deepEqual(splitLocalePath(["fr", "shop", "lampe"], locales), { locale: fr, rest: ["shop", "lampe"], prefixed: true });
    assert.deepEqual(splitLocalePath(["FR"], locales), { locale: fr, rest: [], prefixed: true });
    assert.deepEqual(splitLocalePath(["shop"], locales), { locale: en, rest: ["shop"], prefixed: false });
    // The default language never has a prefix: /en/about is a page called "en".
    assert.deepEqual(splitLocalePath(["en", "about"], locales), { locale: en, rest: ["en", "about"], prefixed: false });
    assert.deepEqual(splitLocalePath(undefined, locales), { locale: en, rest: [], prefixed: false });
    assert.deepEqual(splitLocalePath(["about"], []), { locale: null, rest: ["about"], prefixed: false });
  });

  it("treats every path on a language's own domain as that language", () => {
    assert.deepEqual(splitLocalePath(["fr", "x"], locales, "de-DE"), { locale: de, rest: ["fr", "x"], prefixed: false });
  });

  it("builds paths, links and link bases per language", () => {
    assert.equal(localePath(en, "/about"), "/about");
    assert.equal(localePath(fr, "/"), "/fr");
    assert.equal(localePath(fr, "/shop/lampe"), "/fr/shop/lampe");
    assert.equal(localeHref(fr, "/about", { siteBase: "/sites/aurelia" }), "/sites/aurelia/fr/about");
    assert.equal(localeHref(en, "/", { siteBase: "/sites/aurelia" }), "/sites/aurelia");
    assert.equal(localeHref(en, "/", { siteBase: "" }), "/");
    assert.equal(localeHref(de, "/about", { siteBase: "" }), "https://aurelia.de/about");
    assert.equal(localeHref(de, "/about", { siteBase: "", hostLocale: "de-DE" }), "/about");
    assert.equal(localeHref(fr, "/about", { siteBase: "", hostLocale: "de-DE", mainOrigin: "https://aurelia.com" }), "https://aurelia.com/fr/about");
    assert.equal(localeLinkBase("/sites/aurelia", fr), "/sites/aurelia/fr");
    assert.equal(localeLinkBase("", en), "");
    assert.equal(localeLinkBase("", de, "de-DE"), "");
    assert.equal(localeBase("https://aurelia.com/", fr), "https://aurelia.com/fr");
    assert.equal(localeBase("https://aurelia.com", de), "https://aurelia.de");
  });

  it("stores the default language as an empty locale so existing entries keep their URLs", () => {
    assert.equal(storedLocale("en-US", locales), "");
    assert.equal(storedLocale("fr-FR", locales), "fr-FR");
    assert.equal(storedLocale(null, locales), "");
    assert.equal(entryLocale("", locales), "en-US");
    assert.equal(entryLocale("fr-FR", locales), "fr-FR");
  });

  it("validates language settings", () => {
    assert.ok(localeInputSchema.safeParse({ code: "pt-BR", label: "Português", prefix: "PT-BR", currency: "brl", domain: "" }).success);
    assert.equal(localeInputSchema.parse({ code: "pt-BR", label: "x", prefix: "PT-BR", currency: "brl", domain: "" }).domain, null);
    assert.ok(!localeInputSchema.safeParse({ code: "french", label: "x", prefix: "fr", currency: "EUR" }).success);
    assert.ok(!localeInputSchema.safeParse({ code: "fr-FR", label: "x", prefix: "fr/x", currency: "EUR" }).success);
    assert.ok(!localeInputSchema.safeParse({ code: "fr-FR", label: "x", prefix: "fr", currency: "EUR", domain: "https://x.fr" }).success);
    assert.equal(suggestPrefix("fr-FR"), "fr");
    assert.equal(suggestPrefix("pt-BR", ["pt"]), "pt-br");
  });
});

describe("Accept-Language", () => {
  it("honours q-values and prefers exact tags over language-only matches", () => {
    assert.equal(matchAcceptLanguage("fr-CA,fr;q=0.9,en;q=0.8", locales)?.code, "fr-FR");
    assert.equal(matchAcceptLanguage("en-GB;q=0.5, de-DE;q=0.9", locales)?.code, "de-DE");
    assert.equal(matchAcceptLanguage("es-ES, it", locales), null);
    assert.equal(matchAcceptLanguage("fr;q=0, en", locales)?.code, "en-US");
    assert.equal(matchAcceptLanguage("*", locales), null);
    assert.equal(matchAcceptLanguage(null, locales), null);
  });
});

describe("hreflang", () => {
  it("adds x-default for the default-language version", () => {
    const list = withXDefault([
      { hreflang: "en-US", href: "https://a.com/", isDefault: true },
      { hreflang: "fr-FR", href: "https://a.com/fr/" },
    ]);
    assert.deepEqual(list.at(-1), { hreflang: "x-default", href: "https://a.com/" });
    assert.equal(withXDefault([{ hreflang: "en-US", href: "https://a.com/", isDefault: true }]).length, 1);
  });

  it("turns a translation group into absolute alternates, default first", () => {
    const alts = groupAlternates(
      [
        { localeCode: "de-DE", path: "/shop/lampe" },
        { localeCode: "fr-FR", path: "/shop/lampe-albatre" },
        { localeCode: "en-US", path: "/shop/alabaster-lamp" },
      ],
      locales,
      "https://aurelia.com",
    );
    assert.deepEqual(alts, [
      { hreflang: "en-US", href: "https://aurelia.com/shop/alabaster-lamp" },
      { hreflang: "fr-FR", href: "https://aurelia.com/fr/shop/lampe-albatre" },
      { hreflang: "de-DE", href: "https://aurelia.de/shop/lampe" },
      { hreflang: "x-default", href: "https://aurelia.com/shop/alabaster-lamp" },
    ]);
    assert.equal(linkHeader(alts.slice(0, 1)), '<https://aurelia.com/shop/alabaster-lamp>; rel="alternate"; hreflang="en-US"');
    assert.equal(groupAlternates([{ localeCode: "it-IT", path: "/" }], locales, "https://a.com").length, 0);
  });

  it("writes xhtml:link alternates into the sitemap", () => {
    const xml = sitemapXml([{ loc: "https://a.com/fr/", alternates: [{ hreflang: "en-US", href: "https://a.com/" }, { hreflang: "fr-FR", href: "https://a.com/fr/" }] }]);
    assert.ok(xml.includes('xmlns:xhtml="http://www.w3.org/1999/xhtml"'));
    assert.ok(xml.includes('<xhtml:link rel="alternate" hreflang="fr-FR" href="https://a.com/fr/"/>'));
    assert.ok(!sitemapXml([{ loc: "https://a.com/" }]).includes("xmlns:xhtml"));
  });
});

const doc: BuilderDocument = {
  version: 1,
  rootId: "root",
  nodes: {
    root: { id: "root", type: "section", props: {}, style: { desktop: { padding: "2rem" } }, children: ["title", "cta", "bound"] },
    title: { id: "title", type: "heading", props: { text: "Hello" }, style: { desktop: { fontSize: "3rem" } } },
    cta: { id: "cta", type: "button", props: { link: { label: "Go", href: "/go" } }, style: {} },
    bound: { id: "bound", type: "text", props: { text: "fallback" }, style: {}, bindings: { text: { source: "post", key: "title" } } },
  },
};

describe("layout structure immunity", () => {
  it("lays a translation's text over the original's layout and styles", () => {
    const out = composeDocument(doc, { ...emptyTranslation(), overrides: { title: { text: "Bonjour" }, cta: { link: { label: "Allez", href: "/fr/go" } } } });
    assert.equal(out.nodes.title.props.text, "Bonjour");
    assert.deepEqual(out.nodes.cta.props.link, { label: "Allez", href: "/fr/go" });
    assert.deepEqual(out.nodes.title.style, doc.nodes.title.style);
    assert.deepEqual(out.nodes.root.children, doc.nodes.root.children);
    assert.equal(doc.nodes.title.props.text, "Hello", "the original is untouched");
  });

  it("ignores anything that isn't content: unknown nodes, style keys, bound fields and empty values", () => {
    const out = composeDocument(doc, {
      type: "translation",
      version: 1,
      overrides: { ghost: { text: "x" }, title: { style: "red", priority: true, text: "" }, bound: { text: "Static" }, root: { children: ["title"] } },
    });
    assert.deepEqual(out, { ...doc, nodes: { ...doc.nodes } });
    assert.equal(composeDocument(doc, { type: "page" }), doc);
    assert.ok(isTranslationDocument(emptyTranslation()));
    assert.ok(!isTranslationDocument(doc));
  });

  it("lists translatable fields in reading order, without bound ones", () => {
    assert.deepEqual(
      translatableNodes(doc).map((n) => [n.id, n.fields.map((f) => f.key)]),
      [
        ["title", ["text"]],
        ["cta", ["link"]],
      ],
    );
  });

  it("translates text and media fields of entries and keeps shared facts from the original", () => {
    const defs = new Map<string, Pick<FieldDef, "type">>([
      ["material", { type: "TEXT" }],
      ["price", { type: "PRICE" }],
      ["photo", { type: "IMAGE" }],
      ["related", { type: "RELATION" }],
    ]);
    const merged = mergeEntryFields(defs, { material: "Oak", price: { amount: 10, currency: "USD" }, photo: "a1", related: ["p1"] }, { material: "Chêne", price: { amount: 1, currency: "EUR" }, photo: "", related: ["p2"] });
    assert.deepEqual(merged, { material: "Chêne", price: { amount: 10, currency: "USD" }, photo: "a1", related: ["p1"] });
    assert.ok(isTranslatableField({ type: "RICH_TEXT" }));
    assert.ok(!isTranslatableField({ type: "NUMBER" }));
  });
});
