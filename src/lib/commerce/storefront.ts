import type { ProductGridProps, PublicProduct } from "./types";
import { MAX_GRID_PRODUCTS } from "./types";

const SORTS: Record<ProductGridProps["sort"], (a: PublicProduct, b: PublicProduct) => number> = {
  newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
  "price-asc": (a, b) => a.price - b.price || a.title.localeCompare(b.title),
  "price-desc": (a, b) => b.price - a.price || a.title.localeCompare(b.title),
  title: (a, b) => a.title.localeCompare(b.title),
};

/** The products a grid shows, in order. Pure, so the server render and the visitor's re-sort agree. */
export function gridProducts(products: PublicProduct[], props: Pick<ProductGridProps, "limit" | "sort" | "inStockOnly">): PublicProduct[] {
  const limit = Math.min(Math.max(1, Math.floor(props.limit) || 1), MAX_GRID_PRODUCTS);
  return products
    .filter((p) => !props.inStockOnly || p.available)
    .sort(SORTS[props.sort] ?? SORTS.newest)
    .slice(0, limit);
}

export function isGridProps(v: unknown): v is ProductGridProps {
  if (!v || typeof v !== "object") return false;
  const p = v as Partial<ProductGridProps>;
  return (
    Number.isInteger(p.limit) && p.limit! >= 1 && p.limit! <= MAX_GRID_PRODUCTS &&
    typeof p.sort === "string" && p.sort in SORTS &&
    typeof p.inStockOnly === "boolean" && typeof p.showSort === "boolean" &&
    typeof p.buttonLabel === "string" && p.buttonLabel.length <= 40
  );
}

/** Lowest price across a product's variants, for "From $12" on cards. */
export function fromPrice(p: PublicProduct) {
  return p.variants.length ? Math.min(...p.variants.map((v) => v.price)) : p.price;
}
