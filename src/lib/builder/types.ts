/**
 * The builder document: a flat, normalised node tree. Flat maps keep Zustand
 * updates cheap (replace one node, not a deep path) and make server-side
 * diffing straightforward.
 */

export type Breakpoint = "desktop" | "laptop" | "tablet" | "mobile";

/** Desktop is the base; each smaller breakpoint cascades on top of the ones above it. */
export const BREAKPOINTS: Record<
  Breakpoint,
  { label: string; maxWidth: number | null; previewWidth: number }
> = {
  desktop: { label: "Desktop", maxWidth: null, previewWidth: 1440 },
  laptop: { label: "Laptop", maxWidth: 1280, previewWidth: 1180 },
  tablet: { label: "Tablet", maxWidth: 1024, previewWidth: 820 },
  mobile: { label: "Mobile", maxWidth: 767, previewWidth: 390 },
};

export const BREAKPOINT_ORDER: Breakpoint[] = ["desktop", "laptop", "tablet", "mobile"];

/** CSS properties the builder understands. Values may reference design tokens, e.g. `var(--color-primary)`. */
export interface StyleProps {
  display?: "flex" | "grid" | "block" | "inline-flex" | "none";
  flexDirection?: "row" | "column" | "row-reverse" | "column-reverse";
  flexWrap?: "wrap" | "nowrap";
  justifyContent?: string;
  alignItems?: string;
  gap?: string;
  gridTemplateColumns?: string;
  gridColumn?: string;
  padding?: string;
  margin?: string;
  width?: string;
  maxWidth?: string;
  minHeight?: string;
  aspectRatio?: string;
  objectFit?: "cover" | "contain";
  background?: string;
  color?: string;
  fontFamily?: string;
  fontSize?: string;
  fontWeight?: string;
  lineHeight?: string;
  letterSpacing?: string;
  textAlign?: "left" | "center" | "right";
  textTransform?: "none" | "uppercase";
  border?: string;
  borderRadius?: string;
  boxShadow?: string;
  backdropFilter?: string;
  opacity?: string;
}

export type StyleKey = keyof StyleProps;
export type ResponsiveStyle = Partial<Record<Breakpoint, StyleProps>>;

export type WidgetType =
  | "section" | "container" | "heading" | "text" | "image" | "button" | "price"
  | "gallery" | "richtext" | "loop" | "langswitch" | "productgrid" | "product" | "cart";

export type SemanticTag =
  | "section" | "header" | "main" | "footer" | "article" | "aside" | "nav" | "div"
  | "h1" | "h2" | "h3" | "h4" | "p" | "span";

/**
 * Designer-controlled guardrails. Locks cascade: a locked section locks every
 * descendant, so a designer can protect a whole hero with one toggle. Setting
 * a key to `false` re-opens it for one subtree inside a locked parent (e.g.
 * page order locked, but a testimonials row the client may reorder). Unset
 * means "inherit".
 *
 * - layout:  structure and spacing (reorder, add/remove, padding, gap, grid…)
 * - style:   look (colours, type, borders, shadows)
 * - content: the text, images, links and prices inside
 */
export interface LockSettings {
  layout?: boolean;
  style?: boolean;
  content?: boolean;
}

export interface ImageValue {
  assetId: string | null;
  src: string;
  alt: string;
  width?: number;
  height?: number;
  /** Responsive WebP variants ("…-640.webp 640w, …"). Filled from the media library, never from the browser. */
  srcSet?: string;
}

export interface LinkValue {
  label: string;
  href: string;
  newTab?: boolean;
}

export interface PriceValue {
  amount: number;
  /** ISO 4217. Chosen by the designer; clients change the amount only. */
  currency: string;
  compareAt?: number | null;
}

/**
 * Where a dynamic value comes from (Elementor's "dynamic tags").
 *  - post:  the current entry (the page itself, the entry a single template
 *           renders, or the item inside a loop grid). Keys in POST_SOURCES.
 *  - field: a custom field of the current entry, by field key.
 *  - site:  site identity. Keys in SITE_SOURCES.
 */
export interface Binding {
  source: "post" | "field" | "site";
  key: string;
  /** Shown when the source is empty. */
  fallback?: string;
}

/**
 * Loop grid query. Ids are checked against the site on save; `limit` is
 * capped so one widget can't ask for the whole database.
 */
export interface LoopQuery {
  postTypeId: string | null;
  limit: number;
  orderBy: "date" | "title" | "menu";
  order: "asc" | "desc";
  termId?: string | null;
  offset?: number;
}

export interface BuilderNode {
  id: string;
  type: WidgetType;
  /** Friendly label shown in the editor ("Hero", "Pricing card"). */
  name?: string;
  tag?: SemanticTag;
  props: Record<string, unknown>;
  style: ResponsiveStyle;
  locks?: LockSettings;
  children?: string[];
  /** Dynamic data per bindable target (see BINDABLE in widgets.ts). Designer-only. */
  bindings?: Record<string, Binding>;
}

export interface BuilderDocument {
  version: 1;
  rootId: string;
  nodes: Record<string, BuilderNode>;
}

export function isBuilderDocument(value: unknown): value is BuilderDocument {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<BuilderDocument>;
  return v.version === 1 && typeof v.rootId === "string" && !!v.nodes && !!v.nodes[v.rootId];
}
