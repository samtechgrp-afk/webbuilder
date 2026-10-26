import type { DesignTokens } from "@/lib/design/tokens";

/**
 * Starter site blueprints. A blueprint is plain JSON (src/lib/templates/
 * blueprints/*.json) describing a whole site: identity, design tokens, the
 * header and footer, pages made of sections, custom post types with sample
 * entries, artwork and, for shops, products. `compileBlueprint` expands it
 * into ordinary builder documents, which the gallery preview renders and the
 * seeder stores, so a new site looks exactly like its preview.
 *
 * Every string a visitor sees may contain `{{site}}`, replaced by the name
 * the new site is given (the blueprint's own `site.name` in previews).
 */

export const SECTORS = {
  saas: "SaaS & Tech",
  ecommerce: "E-Commerce",
  agency: "Agency & Services",
  portfolio: "Portfolio",
  health: "Education & Health",
  hospitality: "Hospitality & Events",
} as const;
export type Sector = keyof typeof SECTORS;

export interface Blueprint {
  /** Stable id, also the JSON file name ("devtools-api"). */
  key: string;
  name: string;
  sector: Sector;
  /** One sentence for the gallery card. */
  description: string;
  /** Short features shown in the preview ("Pricing table", "Shop"). */
  highlights: string[];
  site: BlueprintSite;
  /** A complete token set: every core colour, the fonts, type scale, radii and shadows sections use. */
  tokens: BlueprintTokens;
  look: Look;
  header: HeaderSpec;
  footer: FooterSpec;
  /** Generated artwork, referenced by key from pages, entries and products. */
  images: ImageSpec[];
  postTypes: PostTypeSpec[];
  entries: EntrySpec[];
  /** Products with options; a blueprint with products gets a store, a cart and a product page template. */
  products: ProductSpec[];
  store?: StoreSpec;
  /** The first page must be the home page (slug "home"). */
  pages: PageSpec[];
}

export interface BlueprintSite {
  /** Placeholder brand used in previews and replaced by the new site's name. */
  name: string;
  tagline: string;
  /** Short label for the admin portal's logo tile. */
  logoText: string;
  seo: { titleTemplate: string; description: string };
}

export type BlueprintTokens = DesignTokens & {
  colors: Record<CoreColor, string> & Record<string, string>;
  fonts: { heading: string; body: string; display: string; mono: string } & Record<string, string>;
  radii: { sm: string; md: string; lg: string; pill: string; button: string; card: string } & Record<string, string>;
  shadows: { sm: string; md: string; lg: string } & Record<string, string>;
};

export type CoreColor =
  | "background" | "surface-low" | "surface-mid" | "surface-high" | "primary" | "on-primary"
  | "accent" | "heading" | "text" | "muted" | "border";

/** Site-wide choices the section library applies on top of the tokens. */
export interface Look {
  headings: "normal" | "uppercase";
  /** Vertical rhythm between sections. */
  density: "compact" | "regular" | "airy";
  cards: "flat" | "bordered" | "elevated";
  /** Hairline under the header. */
  headerBorder: boolean;
}

export interface Link {
  label: string;
  href: string;
}

export interface HeaderSpec {
  logo: string;
  nav: Link[];
  action?: Link;
}

export interface FooterSpec {
  text: string;
  columns: { title: string; links: Link[] }[];
  legal: string;
}

export type Motif = "aurora" | "interface" | "arch" | "object" | "portrait" | "landscape" | "plate" | "skyline" | "pattern" | "device";

export interface ImageSpec {
  key: string;
  /** Becomes the file name, and from it the alt text ("Linen shirt in sand" → linen-shirt-in-sand.png). */
  alt: string;
  motif: Motif;
  width: number;
  height: number;
  /** Background, mid, shape, detail. Defaults to the blueprint's surface, accent and primary colours. */
  palette?: [string, string, string, string];
}

export type FieldKind = "TEXT" | "TEXTAREA" | "NUMBER" | "PRICE" | "URL" | "EMAIL" | "DATE" | "SELECT" | "BOOLEAN" | "IMAGE";

export interface FieldSpec {
  key: string;
  label: string;
  type: FieldKind;
  required?: boolean;
  /** SELECT choices. */
  options?: string[];
}

export interface PostTypeSpec {
  key: string;
  singular: string;
  plural: string;
  /** URL prefix for entries ("work" → /work/<slug>). */
  prefix: string;
  icon: string;
  description: string;
  fields: FieldSpec[];
  taxonomy?: { key: string; label: string; terms: string[] };
}

/** Field values: PRICE is a number in major units; IMAGE is an image key; DATE is YYYY-MM-DD. */
export type EntryFieldValue = string | number | boolean;

export interface EntrySpec {
  type: string;
  title: string;
  slug: string;
  excerpt: string;
  image?: string;
  /** Paragraphs of the entry body. */
  body: string[];
  fields: Record<string, EntryFieldValue>;
  terms?: string[];
}

export interface ProductSpec {
  title: string;
  slug: string;
  description: string;
  images: string[];
  /** Major units (48 → $48.00). */
  price: number;
  compareAt?: number;
  sku: string;
  /** Stock per variant (or of the product when it has no options). */
  inventory: number;
  digital?: boolean;
  options?: { name: string; values: string[] }[];
  /** Price for variants carrying one of these option values. */
  valuePrices?: Record<string, number>;
}

export interface StoreSpec {
  currency: string;
  shippingCountries: string[];
}

export interface PageSpec {
  title: string;
  slug: string;
  seo: { title: string; description: string };
  sections: SectionSpec[];
}

/** Background of a band: the canvas, a quiet surface, the inverse of the canvas or the brand colour. */
export type Tone = "base" | "alt" | "inverse" | "primary";

interface SectionBase {
  tone?: Tone;
  eyebrow?: string;
  title?: string;
  text?: string;
}

export type SectionSpec =
  | (SectionBase & { kind: "hero"; variant: "centered" | "split" | "banner" | "minimal"; title: string; actions?: Link[]; image?: string; note?: string })
  | (SectionBase & { kind: "logos"; items: string[] })
  | (SectionBase & { kind: "features"; title: string; columns?: 2 | 3 | 4; items: { icon?: string; title: string; text: string }[] })
  | (SectionBase & { kind: "split"; title: string; text: string; image: string; bullets?: string[]; reverse?: boolean; action?: Link })
  | (SectionBase & { kind: "stats"; items: { value: string; label: string }[] })
  | (SectionBase & { kind: "steps"; title: string; items: { title: string; text: string }[] })
  | (SectionBase & { kind: "pricing"; title: string; tiers: PricingTier[] })
  | (SectionBase & { kind: "testimonials"; items: { quote: string; name: string; role: string }[] })
  | (SectionBase & { kind: "cta"; title: string; actions: Link[] })
  | (SectionBase & { kind: "faq"; title: string; items: { q: string; a: string }[] })
  | (SectionBase & { kind: "gallery"; images: string[]; columns?: 2 | 3 | 4 })
  | (SectionBase & { kind: "products"; title: string; limit: number; sort?: "newest" | "price-asc" | "price-desc" | "title"; showSort?: boolean; columns?: 2 | 3 | 4; buttonLabel?: string })
  | (SectionBase & { kind: "loop"; title: string; postType: string; limit: number; columns?: 1 | 2 | 3 | 4; card: LoopCard; fields?: string[]; linkLabel?: string; action?: Link })
  | (SectionBase & { kind: "list"; title: string; columns?: 1 | 2; items: { title: string; meta?: string; text?: string; price?: string }[] })
  | (SectionBase & { kind: "prose"; title: string; paragraphs: string[] })
  | (SectionBase & { kind: "contact"; title: string; items: { label: string; value: string; href?: string }[]; action?: Link })
  | (SectionBase & { kind: "code"; title: string; code: string; bullets?: string[] })
  | (SectionBase & { kind: "product"; product: string; buttonLabel?: string });

export type SectionKind = SectionSpec["kind"];

/** How each loop grid entry is drawn: a picture card, a person, a row with meta, or a menu line with a price. */
export type LoopCard = "media" | "person" | "row" | "menu";

export interface PricingTier {
  name: string;
  price: string;
  period?: string;
  description: string;
  features: string[];
  action: Link;
  featured?: boolean;
}
