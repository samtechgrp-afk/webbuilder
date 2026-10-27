import { z } from "zod";
import { optionsSchema } from "@/lib/commerce/variants";
import { safeCssValue } from "@/lib/design/css-values";
import type { Blueprint, SectionSpec } from "./types";

/**
 * Strict schema for blueprint JSON, plus the cross-reference checks a schema
 * can't express (image keys, post types, fields, products and internal links
 * must all exist). The registry runs both when it loads, so a broken
 * blueprint fails the build and the unit tests instead of a customer's site.
 */

const KEY = /^[a-z][a-z0-9-]{1,39}$/;
const FIELD_KEY = /^[a-z][a-z0-9_]{0,39}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const str = (max: number) => z.string().trim().min(1).max(max);
const css = z.string().max(300).refine((v) => safeCssValue(v) !== null, "Not a safe CSS value");
const cssMap = z.record(z.string().regex(/^[a-z][a-z0-9-]{0,39}$/), css);
const link = z.object({ label: str(60), href: z.string().max(300).regex(/^(\/(?!\/)[\w\-/#?=&.]*|https:\/\/\S+|mailto:\S+|tel:[+\d\s-]+)$/, "Use a site path, https, mailto or tel link") }).strict();
const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

const tokens = z
  .object({
    preset: z.string().max(40).optional(),
    colors: cssMap.and(z.object({
      background: css, "surface-low": css, "surface-mid": css, "surface-high": css, primary: css, "on-primary": css,
      accent: css, heading: css, text: css, muted: css, border: css,
    })),
    fonts: cssMap.and(z.object({ heading: css, body: css, display: css, mono: css })),
    fontSizes: cssMap.optional(),
    typeScale: z.object({ minBase: z.number().min(0.75).max(1.5), maxBase: z.number().min(0.75).max(1.75), minRatio: z.number().min(1).max(1.8), maxRatio: z.number().min(1).max(1.8), minWidth: z.number().int().min(240).max(800), maxWidth: z.number().int().min(800).max(2400) }).strict(),
    lineHeights: cssMap.and(z.object({ tight: css, snug: css, body: css })),
    letterSpacing: cssMap.and(z.object({ tight: css, snug: css, wide: css })),
    spaceUnit: z.number().int().min(2).max(16).optional(),
    spacing: cssMap.optional(),
    radii: cssMap.and(z.object({ sm: css, md: css, lg: css, pill: css, button: css, card: css })),
    shadows: cssMap.and(z.object({ sm: css, md: css, lg: css })),
    blur: cssMap.optional(),
    glows: cssMap.optional(),
    ambient: cssMap.optional(),
  })
  .strict();

const base = { tone: z.enum(["base", "alt", "inverse", "primary"]).optional(), eyebrow: str(60).optional(), title: str(160).optional(), text: str(600).optional() };
const titled = { ...base, title: str(160) };

const section = z.discriminatedUnion("kind", [
  z.object({ ...titled, kind: z.literal("hero"), variant: z.enum(["centered", "split", "banner", "minimal"]), actions: z.array(link).max(2).optional(), image: z.string().optional(), note: str(160).optional() }).strict(),
  z.object({ ...base, kind: z.literal("logos"), items: z.array(str(30)).min(3).max(8) }).strict(),
  z.object({ ...titled, kind: z.literal("features"), columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).optional(), items: z.array(z.object({ icon: str(4).optional(), title: str(80), text: str(300) }).strict()).min(2).max(12) }).strict(),
  z.object({ ...titled, kind: z.literal("split"), text: str(600), image: z.string(), bullets: z.array(str(120)).max(6).optional(), reverse: z.boolean().optional(), action: link.optional() }).strict(),
  z.object({ ...base, kind: z.literal("stats"), items: z.array(z.object({ value: str(16), label: str(60) }).strict()).min(2).max(4) }).strict(),
  z.object({ ...titled, kind: z.literal("steps"), items: z.array(z.object({ title: str(80), text: str(300) }).strict()).min(2).max(6) }).strict(),
  z.object({
    ...titled, kind: z.literal("pricing"),
    tiers: z.array(z.object({ name: str(40), price: str(20), period: str(20).optional(), description: str(160), features: z.array(str(80)).min(1).max(8), action: link, featured: z.boolean().optional() }).strict()).min(1).max(4),
  }).strict(),
  z.object({ ...base, kind: z.literal("testimonials"), items: z.array(z.object({ quote: str(400), name: str(60), role: str(80) }).strict()).min(1).max(6) }).strict(),
  z.object({ ...titled, kind: z.literal("cta"), actions: z.array(link).min(1).max(2) }).strict(),
  z.object({ ...titled, kind: z.literal("faq"), items: z.array(z.object({ q: str(160), a: str(500) }).strict()).min(2).max(10) }).strict(),
  z.object({ ...base, kind: z.literal("gallery"), images: z.array(z.string()).min(2).max(12), columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).optional() }).strict(),
  z.object({ ...titled, kind: z.literal("products"), limit: z.number().int().min(1).max(24), sort: z.enum(["newest", "price-asc", "price-desc", "title"]).optional(), showSort: z.boolean().optional(), columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).optional(), buttonLabel: str(40).optional() }).strict(),
  z.object({
    ...titled, kind: z.literal("loop"), postType: z.string().regex(KEY), limit: z.number().int().min(1).max(24),
    columns: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(), card: z.enum(["media", "person", "row", "menu"]),
    fields: z.array(z.string().regex(FIELD_KEY)).max(3).optional(), linkLabel: str(40).optional(), action: link.optional(),
  }).strict(),
  z.object({ ...titled, kind: z.literal("list"), columns: z.union([z.literal(1), z.literal(2)]).optional(), items: z.array(z.object({ title: str(80), meta: str(80).optional(), text: str(300).optional(), price: str(20).optional() }).strict()).min(1).max(16) }).strict(),
  z.object({ ...titled, kind: z.literal("prose"), paragraphs: z.array(str(1200)).min(1).max(12) }).strict(),
  z.object({ ...titled, kind: z.literal("contact"), items: z.array(z.object({ label: str(40), value: str(160), href: link.shape.href.optional() }).strict()).min(1).max(6), action: link.optional() }).strict(),
  z.object({ ...titled, kind: z.literal("code"), code: z.string().min(1).max(1200), bullets: z.array(str(120)).max(6).optional() }).strict(),
  z.object({ ...base, kind: z.literal("product"), product: z.string().regex(SLUG), buttonLabel: str(40).optional() }).strict(),
]);

const fieldKinds = ["TEXT", "TEXTAREA", "NUMBER", "PRICE", "URL", "EMAIL", "DATE", "SELECT", "BOOLEAN", "IMAGE"] as const;

export const blueprintSchema = z
  .object({
    key: z.string().regex(KEY),
    name: str(80),
    sector: z.enum(["saas", "ecommerce", "agency", "portfolio", "health", "hospitality"]),
    description: str(200),
    highlights: z.array(str(40)).min(2).max(6),
    site: z.object({ name: str(60), tagline: str(140), logoText: str(30), seo: z.object({ titleTemplate: str(80).refine((v) => v.includes("%s")), description: str(170) }).strict() }).strict(),
    tokens,
    look: z.object({ headings: z.enum(["normal", "uppercase"]), density: z.enum(["compact", "regular", "airy"]), cards: z.enum(["flat", "bordered", "elevated"]), headerBorder: z.boolean() }).strict(),
    header: z.object({ logo: str(40), nav: z.array(link).max(6), action: link.optional() }).strict(),
    footer: z.object({ text: str(200), columns: z.array(z.object({ title: str(40), links: z.array(link).min(1).max(6) }).strict()).max(4), legal: str(160) }).strict(),
    images: z.array(z.object({
      key: z.string().regex(KEY), alt: str(120), motif: z.enum(["aurora", "interface", "arch", "object", "portrait", "landscape", "plate", "skyline", "pattern", "device"]),
      width: z.number().int().min(200).max(2400), height: z.number().int().min(200).max(2400), palette: z.tuple([hex, hex, hex, hex]).optional(),
    }).strict()).max(24),
    postTypes: z.array(z.object({
      key: z.string().regex(KEY), singular: str(40), plural: str(40), prefix: z.string().regex(SLUG), icon: str(4), description: str(200),
      fields: z.array(z.object({ key: z.string().regex(FIELD_KEY), label: str(60), type: z.enum(fieldKinds), required: z.boolean().optional(), options: z.array(str(60)).min(2).max(20).optional() }).strict()).max(12),
      taxonomy: z.object({ key: z.string().regex(/^[a-z][a-z0-9_]{1,39}$/), label: str(40), terms: z.array(str(40)).min(1).max(12) }).strict().optional(),
    }).strict()).max(4),
    entries: z.array(z.object({
      type: z.string().regex(KEY), title: str(120), slug: z.string().regex(SLUG), excerpt: str(300), image: z.string().optional(),
      body: z.array(str(1500)).max(8), fields: z.record(z.string().regex(FIELD_KEY), z.union([z.string().max(500), z.number(), z.boolean()])), terms: z.array(str(40)).max(6).optional(),
    }).strict()).max(40),
    products: z.array(z.object({
      title: str(120), slug: z.string().regex(SLUG), description: str(1000), images: z.array(z.string()).min(1).max(6),
      price: z.number().min(0).max(1_000_000), compareAt: z.number().min(0).max(1_000_000).optional(), sku: str(40), inventory: z.number().int().min(0).max(100_000),
      digital: z.boolean().optional(), options: optionsSchema.optional(), valuePrices: z.record(z.string(), z.number().min(0).max(1_000_000)).optional(),
    }).strict()).max(24),
    store: z.object({ currency: z.string().regex(/^[A-Z]{3}$/), shippingCountries: z.array(z.string().regex(/^[A-Z]{2}$/)).max(40) }).strict().optional(),
    pages: z.array(z.object({ title: str(80), slug: z.string().regex(SLUG), seo: z.object({ title: str(70), description: str(170) }).strict(), sections: z.array(section).min(1).max(16) }).strict()).min(1).max(8),
  })
  .strict();

/** Ensures the schema and the TypeScript interfaces describe the same shape. */
export type ParsedBlueprint = z.infer<typeof blueprintSchema>;
const _sameShape = (b: ParsedBlueprint): Blueprint => b;
void _sameShape;

/** Images a section shows. */
function sectionImages(s: SectionSpec): string[] {
  if (s.kind === "gallery") return s.images;
  if ((s.kind === "hero" || s.kind === "split") && s.image) return [s.image];
  return [];
}

function sectionLinks(s: SectionSpec): string[] {
  const links: string[] = [];
  if ("actions" in s && s.actions) links.push(...s.actions.map((a) => a.href));
  if ("action" in s && s.action) links.push(s.action.href);
  if (s.kind === "pricing") links.push(...s.tiers.map((t) => t.action.href));
  if (s.kind === "contact") links.push(...s.items.flatMap((i) => (i.href ? [i.href] : [])));
  return links;
}

/** Every reference inside a parsed blueprint, checked. Returns readable problems (empty when sound). */
export function blueprintProblems(bp: Blueprint): string[] {
  const problems: string[] = [];
  const images = new Set(bp.images.map((i) => i.key));
  const unique = (label: string, values: string[]) => {
    const seen = new Set<string>();
    for (const v of values) {
      if (seen.has(v)) problems.push(`Duplicate ${label} "${v}"`);
      seen.add(v);
    }
  };
  unique("image", bp.images.map((i) => i.key));
  unique("page slug", bp.pages.map((p) => p.slug));
  unique("post type", bp.postTypes.map((p) => p.key));
  unique("product slug", bp.products.map((p) => p.slug));
  const image = (where: string, key: string | undefined) => {
    if (key !== undefined && !images.has(key)) problems.push(`${where}: unknown image "${key}"`);
  };

  if (bp.pages[0]?.slug !== "home") problems.push("The first page must be the home page (slug \"home\")");
  const reserved = new Set(["products", "journal", ...bp.postTypes.map((p) => p.prefix)]);
  for (const p of bp.pages) if (p.slug !== "home" && reserved.has(p.slug)) problems.push(`Page "${p.slug}" clashes with a route prefix`);
  for (const pt of bp.postTypes) if (["page", "post", "template", "product"].includes(pt.key)) problems.push(`Post type key "${pt.key}" is reserved`);
  unique("route prefix", bp.postTypes.map((p) => p.prefix));
  // Bindings look fields up by key across the whole site, so keys can't repeat between post types.
  unique("field key", bp.postTypes.flatMap((p) => p.fields.map((f) => f.key)));
  unique("taxonomy", bp.postTypes.flatMap((p) => (p.taxonomy ? [p.taxonomy.key] : [])));

  // Internal links must land on a page, a post type archive's entries, a product or an anchor.
  const paths = new Set(["/", ...bp.pages.filter((p) => p.slug !== "home").map((p) => `/${p.slug}`)]);
  for (const pt of bp.postTypes) paths.add(`/${pt.prefix}`);
  for (const e of bp.entries) {
    const pt = bp.postTypes.find((p) => p.key === e.type);
    if (pt) paths.add(`/${pt.prefix}/${e.slug}`);
  }
  for (const p of bp.products) paths.add(`/products/${p.slug}`);
  const checkLink = (where: string, href: string) => {
    if (!href.startsWith("/")) return;
    const path = href.split(/[?#]/)[0];
    if (!paths.has(path)) problems.push(`${where}: link "${href}" goes nowhere`);
  };
  for (const l of [...bp.header.nav, ...(bp.header.action ? [bp.header.action] : [])]) checkLink("Header", l.href);
  for (const c of bp.footer.columns) for (const l of c.links) checkLink("Footer", l.href);

  const fieldsOf = (type: string) => bp.postTypes.find((p) => p.key === type)?.fields ?? [];
  for (const pt of bp.postTypes) {
    for (const f of pt.fields) if (f.type === "SELECT" && !f.options) problems.push(`${pt.key}.${f.key}: a select needs options`);
  }
  unique("entry", bp.entries.map((e) => `${e.type}/${e.slug}`));
  for (const e of bp.entries) {
    const pt = bp.postTypes.find((p) => p.key === e.type);
    if (!pt) {
      problems.push(`Entry "${e.slug}": unknown post type "${e.type}"`);
      continue;
    }
    image(`Entry "${e.slug}"`, e.image);
    for (const [key, value] of Object.entries(e.fields)) {
      const f = pt.fields.find((x) => x.key === key);
      if (!f) problems.push(`Entry "${e.slug}": unknown field "${key}"`);
      else if (f.type === "IMAGE") image(`Entry "${e.slug}".${key}`, String(value));
      else if ((f.type === "PRICE" || f.type === "NUMBER") && typeof value !== "number") problems.push(`Entry "${e.slug}".${key} must be a number`);
      else if (f.type === "SELECT" && !f.options?.includes(String(value))) problems.push(`Entry "${e.slug}".${key}: "${value}" isn't one of the options`);
      else if (f.type === "DATE" && !/^\d{4}-\d{2}-\d{2}$/.test(String(value))) problems.push(`Entry "${e.slug}".${key} must be YYYY-MM-DD`);
    }
    for (const f of pt.fields) if (f.required && e.fields[f.key] === undefined) problems.push(`Entry "${e.slug}": "${f.key}" is required`);
    for (const t of e.terms ?? []) if (!pt.taxonomy?.terms.includes(t)) problems.push(`Entry "${e.slug}": unknown term "${t}"`);
  }

  for (const p of bp.products) {
    for (const img of p.images) image(`Product "${p.slug}"`, img);
    const values = new Set((p.options ?? []).flatMap((o) => o.values));
    for (const v of Object.keys(p.valuePrices ?? {})) if (!values.has(v)) problems.push(`Product "${p.slug}": price for unknown option value "${v}"`);
    if (p.compareAt !== undefined && p.compareAt <= p.price) problems.push(`Product "${p.slug}": compare-at price must be higher than the price`);
  }
  if (bp.products.length && !bp.store) problems.push("A blueprint with products needs a store");

  for (const page of bp.pages) {
    page.sections.forEach((s, i) => {
      const where = `Page "${page.slug}" section ${i + 1} (${s.kind})`;
      for (const img of sectionImages(s)) image(where, img);
      for (const href of sectionLinks(s)) checkLink(where, href);
      if (s.kind === "hero" && (s.variant === "split" || s.variant === "banner") && !s.image) problems.push(`${where}: this hero needs an image`);
      if (s.kind === "loop") {
        const pt = bp.postTypes.find((p) => p.key === s.postType);
        if (!pt) problems.push(`${where}: unknown post type "${s.postType}"`);
        for (const f of s.fields ?? []) if (!fieldsOf(s.postType).some((x) => x.key === f)) problems.push(`${where}: unknown field "${f}"`);
        if (s.card === "menu" && !fieldsOf(s.postType).some((f) => f.type === "PRICE")) problems.push(`${where}: a menu card needs a price field`);
        if (!bp.entries.some((e) => e.type === s.postType)) problems.push(`${where}: "${s.postType}" has no entries to show`);
      }
      if ((s.kind === "products" || s.kind === "product") && !bp.products.length) problems.push(`${where}: the blueprint has no products`);
      if (s.kind === "product" && !bp.products.some((p) => p.slug === s.product)) problems.push(`${where}: unknown product "${s.product}"`);
    });
  }
  return problems;
}

/** Parses and checks one blueprint, throwing a readable error. */
export function parseBlueprint(raw: unknown, source = "blueprint"): Blueprint {
  const parsed = blueprintSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(`${source}: ${issue.path.join(".")}: ${issue.message}`);
  }
  const bp = parsed.data as Blueprint;
  const problems = blueprintProblems(bp);
  if (problems.length) throw new Error(`${source}: ${problems.slice(0, 5).join("; ")}`);
  return bp;
}
