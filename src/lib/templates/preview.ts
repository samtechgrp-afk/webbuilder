import type { DynamicData, DynamicFieldValue, DynamicPost } from "@/lib/cms/binding";
import { valueToText } from "@/lib/cms/fields";
import type { BuilderDocument, ImageValue, LoopQuery } from "@/lib/builder/types";
import { PRODUCT_BASE, type CommerceData, type PublicProduct } from "@/lib/commerce/types";
import { artworkSvg, blueprintPalette } from "./artwork";
import type { CompileContext } from "./compile";
import { blueprintCurrency, bodyHtml, fieldConfig, storedFieldValue, toMinor, variantRows } from "./content";
import type { Blueprint } from "./types";

/**
 * Everything the gallery preview needs to render a blueprint without a site:
 * images as inline SVG, stand-in ids, loop grid items and a read-only
 * catalog built straight from the JSON. Same compiler, same renderer as a
 * real site; only the data source differs.
 */

const previewPostTypeId = (key: string) => `pt-${key}`;
const previewProductId = (slug: string) => `pr-${slug}`;

export function previewImages(bp: Blueprint): Record<string, ImageValue> {
  const palette = blueprintPalette(bp);
  return Object.fromEntries(
    bp.images.map((spec) => [spec.key, { assetId: null, src: `data:image/svg+xml;utf8,${encodeURIComponent(artworkSvg(spec, palette))}`, alt: spec.alt, width: spec.width, height: spec.height }]),
  );
}

export function previewContext(bp: Blueprint, images = previewImages(bp)): CompileContext {
  return {
    siteName: bp.site.name,
    images,
    postTypeIds: Object.fromEntries(bp.postTypes.map((p) => [p.key, previewPostTypeId(p.key)])),
    productIds: Object.fromEntries(bp.products.map((p) => [p.slug, previewProductId(p.slug)])),
  };
}

export function entryPosts(bp: Blueprint, type: string, images: Record<string, ImageValue>): DynamicPost[] {
  const pt = bp.postTypes.find((p) => p.key === type);
  if (!pt) return [];
  const currency = blueprintCurrency(bp);
  return bp.entries
    .filter((e) => e.type === type)
    .map((e, i) => {
      const fields: Record<string, DynamicFieldValue> = {};
      for (const f of pt.fields) {
        const raw = e.fields[f.key];
        const value = raw === undefined ? null : storedFieldValue(f, raw, currency, (k) => k);
        const def = { type: f.type, config: fieldConfig(f, currency) };
        const base: DynamicFieldValue = { type: f.type, label: f.label, text: f.type === "IMAGE" ? "" : valueToText(def, value) };
        if (value !== null && f.type === "PRICE") base.price = { ...(value as { amount: number; currency: string }), compareAt: null };
        if (value !== null && f.type === "IMAGE") base.image = images[String(value)] ?? null;
        if (value !== null && (f.type === "URL" || f.type === "EMAIL")) base.url = f.type === "EMAIL" ? `mailto:${value}` : String(value);
        fields[f.key] = base;
      }
      return {
        id: `${type}-${i}`,
        title: e.title.replaceAll("{{site}}", bp.site.name),
        slug: e.slug,
        url: `/${pt.prefix}/${e.slug}`,
        excerpt: e.excerpt.replaceAll("{{site}}", bp.site.name),
        date: null,
        authorName: "",
        featuredImage: e.image ? (images[e.image] ?? null) : null,
        content: bodyHtml(e.body, bp.site.name),
        fields,
      };
    });
}

/** Loop grid items and site identity for one compiled page. */
export function previewDynamic(bp: Blueprint, doc: BuilderDocument, images: Record<string, ImageValue>): DynamicData {
  const loops: Record<string, DynamicPost[]> = {};
  for (const node of Object.values(doc.nodes)) {
    if (node.type !== "loop") continue;
    const q = node.props.query as LoopQuery;
    const key = bp.postTypes.find((p) => previewPostTypeId(p.key) === q.postTypeId)?.key;
    loops[node.id] = key ? entryPosts(bp, key, images).slice(q.offset ?? 0, (q.offset ?? 0) + q.limit) : [];
  }
  return { site: { name: bp.site.name, tagline: bp.site.tagline, url: "/", logo: null }, post: null, loops };
}

/** The blueprint's products as a catalog with checkout off. */
export function previewCommerce(bp: Blueprint, images: Record<string, ImageValue>, linkBase: string, current: string | null = null): CommerceData | undefined {
  if (!bp.products.length) return undefined;
  const currency = blueprintCurrency(bp);
  const now = Date.UTC(2026, 9, 1);
  const products: PublicProduct[] = bp.products.map((p, i) => {
    const rows = variantRows(p, currency);
    const tracked = !p.digital;
    const variants = rows.map((v, j) => ({ id: `${previewProductId(p.slug)}-v${j}`, title: v.title, price: v.price ?? toMinor(p.price, currency), attributes: v.attributes, stock: tracked ? v.inventory : null, available: !tracked || v.inventory > 0 }));
    const stock = tracked ? (variants.length ? variants.reduce((n, v) => n + (v.stock ?? 0), 0) : p.inventory) : null;
    return {
      id: previewProductId(p.slug),
      slug: p.slug,
      title: p.title,
      description: p.description,
      price: toMinor(p.price, currency),
      compareAtPrice: p.compareAt !== undefined ? toMinor(p.compareAt, currency) : null,
      images: p.images.map((k) => images[k]).filter((x) => !!x),
      options: p.options ?? [],
      variants,
      stock,
      available: variants.length ? variants.some((v) => v.available) : stock === null || stock > 0,
      path: `/${PRODUCT_BASE}/${p.slug}`,
      createdAt: new Date(now - i * 60_000).toISOString(),
    };
  });
  return { siteKey: `template-${bp.key}`, currency, checkout: false, products, current: current ? (products.find((p) => p.slug === current) ?? null) : null, linkBase };
}
