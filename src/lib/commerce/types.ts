import type { ImageValue } from "@/lib/builder/types";
import type { ProductOption, VariantAttributes } from "./variants";

/** What the storefront widgets know about a product. Only ACTIVE products, prices in minor units. */
export interface PublicProduct {
  id: string;
  slug: string;
  title: string;
  description: string;
  price: number;
  compareAtPrice: number | null;
  images: ImageValue[];
  options: ProductOption[];
  variants: PublicVariant[];
  /** Units left; null when stock isn't tracked. Summed over variants. */
  stock: number | null;
  available: boolean;
  /** Site path, without the language prefix or site base ("/products/linen-cushion"). */
  path: string;
  createdAt: string;
}

export interface PublicVariant {
  id: string;
  title: string;
  price: number;
  attributes: VariantAttributes;
  stock: number | null;
  available: boolean;
}

/** Everything the commerce widgets on one page need. */
export interface CommerceData {
  /** The site's subdomain: the checkout API path and the cart's storage key. */
  siteKey: string;
  currency: string;
  /** Checkout is on (enabled and a Stripe key is set). */
  checkout: boolean;
  products: PublicProduct[];
  /** The product a product page shows ("current product" widgets). */
  current?: PublicProduct | null;
  /** Prefix for product links: site base + language prefix. */
  linkBase: string;
}

export interface ProductGridProps {
  limit: number;
  sort: "newest" | "price-asc" | "price-desc" | "title";
  /** Hide sold-out products. */
  inStockOnly: boolean;
  /** Let visitors re-sort the grid. */
  showSort: boolean;
  buttonLabel: string;
}

export interface ProductDetailsProps {
  /** A fixed product, or null for the product the page is about. */
  productId: string | null;
  buttonLabel: string;
}

export interface CartProps {
  label: string;
}

export const MAX_GRID_PRODUCTS = 24;

export const PRODUCT_BASE = "products";
