import "server-only";
import type { Prisma } from "@prisma/client";
import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/lib/db";
import { isBuilderDocument, type BuilderDocument } from "@/lib/builder/types";
import { PRODUCT_BASE, type CommerceData, type PublicProduct } from "@/lib/commerce/types";
import { readOptions, type VariantAttributes } from "@/lib/commerce/variants";
import { toImage } from "../cms/dynamic";
import { siteCacheTag } from "../public-site";
import { getStorefront } from "./store-service";

/** Widgets that read the catalog. */
export const COMMERCE_WIDGETS = new Set(["productgrid", "product", "cart"]);

const MAX_STORE_PRODUCTS = 100;

type ProductRow = Prisma.ProductGetPayload<{ include: { variants: true } }>;

/** Active products as the storefront sees them, with images resolved. */
async function toPublic(rows: ProductRow[]): Promise<PublicProduct[]> {
  const ids = [...new Set(rows.flatMap((p) => p.images))];
  const assets = ids.length ? await prisma.mediaAsset.findMany({ where: { id: { in: ids }, siteId: rows[0].siteId } }) : [];
  const byId = new Map(assets.map((a) => [a.id, toImage(a)]));
  return rows.map((p) => {
    const variants = p.variants
      .sort((a, b) => a.position - b.position)
      .map((v) => ({
        id: v.id,
        title: v.title,
        price: v.price ?? p.price,
        attributes: (v.attributes ?? {}) as VariantAttributes,
        stock: p.trackInventory ? Math.max(0, v.inventory) : null,
        available: !p.trackInventory || v.inventory > 0,
      }));
    const stock = p.trackInventory ? (variants.length ? variants.reduce((n, v) => n + (v.stock ?? 0), 0) : Math.max(0, p.inventory)) : null;
    return {
      id: p.id,
      slug: p.slug,
      title: p.title,
      description: p.description,
      price: p.price,
      compareAtPrice: p.compareAtPrice,
      images: p.images.map((id) => byId.get(id)).filter((x) => !!x),
      options: readOptions(p.options),
      variants,
      stock,
      available: variants.length ? variants.some((v) => v.available) : stock === null || stock > 0,
      path: `/${PRODUCT_BASE}/${p.slug}`,
      createdAt: p.createdAt.toISOString(),
    };
  });
}

/** Public, cached per site: every active product (capped). Webhooks and saves expire it. */
export async function getStoreProducts(siteId: string): Promise<PublicProduct[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(siteCacheTag(siteId));
  const rows = await prisma.product.findMany({ where: { siteId, status: "ACTIVE" }, orderBy: { createdAt: "desc" }, take: MAX_STORE_PRODUCTS, include: { variants: true } });
  return rows.length ? toPublic(rows) : [];
}

export async function getStoreProduct(siteId: string, slug: string): Promise<PublicProduct | null> {
  "use cache";
  cacheLife("hours");
  cacheTag(siteCacheTag(siteId));
  const row = await prisma.product.findFirst({ where: { siteId, slug, status: "ACTIVE" }, include: { variants: true } });
  return row ? (await toPublic([row]))[0] : null;
}

/** Uncached active products, for the editor canvas (it should show this minute's catalog). */
export async function previewProducts(siteId: string): Promise<PublicProduct[]> {
  const rows = await prisma.product.findMany({ where: { siteId, status: "ACTIVE" }, orderBy: { createdAt: "desc" }, take: MAX_STORE_PRODUCTS, include: { variants: true } });
  return rows.length ? toPublic(rows) : [];
}

export const usesCommerce = (doc: BuilderDocument) => Object.values(doc.nodes).some((n) => COMMERCE_WIDGETS.has(n.type));

/**
 * The commerce data a page renders with, or undefined when it has no
 * commerce widgets. `current` is the product a product page is about.
 */
export async function loadCommerceData(
  site: { id: string; subdomain: string },
  doc: BuilderDocument,
  linkBase: string,
  opts: { current?: PublicProduct | null } = {},
): Promise<CommerceData | undefined> {
  if (!usesCommerce(doc) && !opts.current) return undefined;
  const [store, products] = await Promise.all([getStorefront(site.id), getStoreProducts(site.id)]);
  return { siteKey: site.subdomain, currency: store.currency, checkout: store.checkout, products, current: opts.current ?? null, linkBase };
}

/** The canvas's commerce data: the live catalog, and a sample "current product" on the product page template. */
export async function editorCommerce(site: { id: string; subdomain: string }, linkBase: string, postId: string): Promise<CommerceData> {
  const [store, products] = await Promise.all([getStorefront(site.id), previewProducts(site.id)]);
  return { siteKey: site.subdomain, currency: store.currency, checkout: store.checkout, products, current: store.productTemplateId === postId ? (products[0] ?? null) : null, linkBase };
}

/** What /products/<slug> renders when the store has no product page template. */
export const FALLBACK_PRODUCT_DOCUMENT: BuilderDocument = {
  version: 1,
  rootId: "root",
  nodes: {
    root: { id: "root", type: "section", tag: "main", props: {}, style: { desktop: { display: "flex", flexDirection: "column", gap: "var(--space-lg)", padding: "var(--space-xl) 2rem", maxWidth: "1200px", margin: "0 auto" }, mobile: { padding: "2rem 1.25rem" } }, children: ["cart", "product"] },
    cart: { id: "cart", type: "cart", props: { label: "Cart" }, style: { desktop: { display: "flex", justifyContent: "flex-end" } } },
    product: { id: "product", type: "product", props: { productId: null, buttonLabel: "Add to cart" }, style: { desktop: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "var(--space-lg)" }, mobile: { gridTemplateColumns: "minmax(0, 1fr)" } } },
  },
};

/** A live product page: the product plus the published template that lays it out. */
export async function getProductPage(site: { id: string }, slug: string) {
  "use cache";
  cacheLife("hours");
  cacheTag(siteCacheTag(site.id));
  const product = await getStoreProduct(site.id, slug);
  if (!product) return null;
  const { productTemplateId } = await getStorefront(site.id);
  const template = productTemplateId
    ? await prisma.post.findFirst({ where: { id: productTemplateId, siteId: site.id, postType: { key: "template" }, publishedRevisionId: { not: null }, status: { not: "TRASHED" } }, select: { publishedRevision: { select: { document: true } } } })
    : null;
  const doc = template?.publishedRevision?.document;
  return { product, document: isBuilderDocument(doc) ? doc : FALLBACK_PRODUCT_DOCUMENT, custom: isBuilderDocument(doc) };
}
