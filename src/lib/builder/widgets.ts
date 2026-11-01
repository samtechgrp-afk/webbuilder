import type { BindKind } from "@/lib/cms/fields";
import type { CartProps, ProductDetailsProps, ProductGridProps } from "@/lib/commerce/types";
import type { SettingDef } from "./settings";
import type { LoopQuery, ResponsiveStyle, SemanticTag, StyleKey, WidgetType } from "./types";

/**
 * What a client is allowed to edit inside each widget. The editor UI and the
 * server-side guard both read this registry, so they can never disagree.
 */
export type ContentFieldKind =
  | "text" | "multiline" | "image" | "link" | "price" | "gallery"
  /** Formatted text (WYSIWYG). Sanitised to an allowlist on the server before it is stored. */
  | "html"
  /** A media library video or a YouTube / Vimeo / https address. */
  | "video"
  /** A Lucide icon name from the curated set. */
  | "icon";

export interface ContentField {
  key: string;
  label: string;
  kind: ContentFieldKind;
  maxLength?: number;
}

/** Content kinds that are the same in every language (a translation can't override them). */
export const SHARED_CONTENT_KINDS: ReadonlySet<ContentFieldKind> = new Set<ContentFieldKind>(["video", "icon"]);

/** Groups of the designer's widget palette, in display order. */
export const WIDGET_CATEGORIES = {
  layout: "Structure & layout",
  basic: "Basic content",
  interactive: "Advanced & interactive",
  forms: "Forms & lead capture",
  dynamic: "Dynamic & theme",
  social: "Social & media",
  commerce: "Shop",
} as const;

export type WidgetCategory = keyof typeof WIDGET_CATEGORIES;

export interface WidgetDefinition {
  label: string;
  category: WidgetCategory;
  /** Lucide icon name (kebab case) for the palette and layers. */
  icon: string;
  /** Extra words the palette search matches ("hr", "line" for a divider). */
  keywords?: string;
  isContainer: boolean;
  defaultTag: SemanticTag;
  allowedTags: SemanticTag[];
  contentFields: ContentField[];
  /** One-line hint shown in the designer's widget palette. */
  hint: string;
  /** Designer options (see settings.ts). Unset settings render with their default. */
  settings?: SettingDef[];
  /** What a freshly dropped widget looks like. Values lean on design tokens. */
  defaults: { props: Record<string, unknown>; style: ResponsiveStyle };
}

const COLOR = (key: string, label: string, o: { help?: string; default?: string; when?: SettingDef["when"] } = {}): SettingDef => ({ key, label, kind: "color", default: o.default ?? "", help: o.help, when: o.when });
const HOVER: SettingDef = {
  key: "hover",
  label: "Hover effect",
  kind: "select",
  default: "none",
  options: [
    { value: "none", label: "None" },
    { value: "lift", label: "Lift" },
    { value: "grow", label: "Grow" },
    { value: "glow", label: "Glow" },
  ],
};

/** Background video and colour overlay, shared by sections and containers. */
const BACKDROP: SettingDef[] = [
  { key: "bgVideo", label: "Background video", kind: "media", accept: "video", default: null, help: "Plays muted and looped behind the content. MP4 or WebM from the media library." },
  COLOR("overlay", "Overlay colour", { help: "Tints a background image or video so text stays readable." }),
  { key: "overlayOpacity", label: "Overlay opacity", kind: "number", min: 0, max: 100, step: 5, unit: "%", default: 50 },
];

export const WIDGETS: Record<WidgetType, WidgetDefinition> = {
  section: {
    label: "Section",
    category: "layout",
    icon: "rows-3",
    keywords: "band hero row",
    isContainer: true,
    defaultTag: "section",
    allowedTags: ["section", "header", "main", "footer", "article", "aside", "nav"],
    contentFields: [],
    hint: "Full-width band with its own padding",
    settings: BACKDROP,
    defaults: { props: {}, style: { desktop: { display: "flex", flexDirection: "column", gap: "var(--space-md)", padding: "var(--space-xl) 2rem" }, mobile: { padding: "4rem 1.25rem" } } },
  },
  container: {
    label: "Container",
    category: "layout",
    icon: "box",
    keywords: "flex grid box wrapper",
    isContainer: true,
    defaultTag: "div",
    allowedTags: ["div", "main", "article", "aside", "nav"],
    contentFields: [],
    hint: "Flexbox or Grid box for arranging items",
    settings: BACKDROP,
    defaults: { props: {}, style: { desktop: { display: "flex", flexDirection: "column", gap: "var(--space-md)" } } },
  },
  heading: {
    label: "Heading",
    category: "basic",
    icon: "heading",
    keywords: "title h1 h2",
    isContainer: false,
    defaultTag: "h2",
    allowedTags: ["h1", "h2", "h3", "h4", "h5", "h6"],
    contentFields: [{ key: "text", label: "Heading", kind: "text", maxLength: 200 }],
    hint: "Title, h1 to h6",
    settings: [
      { key: "gradient", label: "Gradient text", kind: "toggle", default: false },
      COLOR("gradientFrom", "Gradient start", { default: "var(--color-primary)", when: { key: "gradient", is: [true] } }),
      COLOR("gradientTo", "Gradient end", { default: "var(--color-accent)", when: { key: "gradient", is: [true] } }),
      { key: "gradientAngle", label: "Gradient angle", kind: "number", min: 0, max: 360, step: 15, unit: "°", default: 90, when: { key: "gradient", is: [true] } },
    ],
    defaults: { props: { text: "A considered headline" }, style: { desktop: { fontFamily: "var(--font-display)", fontSize: "var(--text-h2)", lineHeight: "1.1" } } },
  },
  text: {
    label: "Text",
    category: "basic",
    icon: "pilcrow",
    keywords: "paragraph copy",
    isContainer: false,
    defaultTag: "p",
    allowedTags: ["p", "span", "div"],
    contentFields: [{ key: "text", label: "Text", kind: "multiline", maxLength: 4000 }],
    hint: "Paragraph of body copy",
    defaults: { props: { text: "Write a short, clear paragraph here." }, style: { desktop: { lineHeight: "1.6", color: "var(--color-muted)" } } },
  },
  image: {
    label: "Image",
    category: "basic",
    icon: "image",
    keywords: "picture photo",
    isContainer: false,
    defaultTag: "div",
    allowedTags: ["div"],
    contentFields: [{ key: "image", label: "Image", kind: "image" }],
    hint: "Picture from the media library",
    settings: [
      { key: "lightbox", label: "Open larger on click", kind: "toggle", default: false, help: "Shows the full image in a lightbox." },
      { key: "caption", label: "Show alt text as caption", kind: "toggle", default: false },
    ],
    defaults: { props: { image: { assetId: null, src: "", alt: "" } }, style: { desktop: { aspectRatio: "4 / 3", borderRadius: "var(--radius-md)", objectFit: "cover" } } },
  },
  button: {
    label: "Button",
    category: "basic",
    icon: "mouse-pointer-click",
    keywords: "link cta",
    isContainer: false,
    defaultTag: "span",
    allowedTags: ["span"],
    contentFields: [{ key: "link", label: "Button", kind: "link", maxLength: 80 }],
    hint: "Link styled as a button",
    settings: [
      {
        key: "variant",
        label: "Variant",
        kind: "select",
        default: "custom",
        options: [
          { value: "custom", label: "Custom (Style tab)" },
          { value: "solid", label: "Solid" },
          { value: "outline", label: "Outline" },
          { value: "ghost", label: "Ghost" },
        ],
        help: "Picking a variant restyles the button; fine-tune it in the Style tab.",
      },
      { ...HOVER, default: "lift" },
      { key: "icon", label: "Icon", kind: "icon", default: "" },
      { key: "iconPosition", label: "Icon position", kind: "select", default: "after", options: [{ value: "before", label: "Before the label" }, { value: "after", label: "After the label" }] },
    ],
    defaults: { props: { link: { label: "Learn more", href: "/contact" } }, style: { desktop: { padding: ".9rem 1.5rem", borderRadius: "var(--radius-pill)", background: "var(--color-deep)", color: "var(--color-inverse)", fontWeight: "500" } } },
  },
  gallery: {
    label: "Gallery",
    category: "interactive",
    icon: "layout-grid",
    keywords: "photos masonry lightbox",
    isContainer: false,
    defaultTag: "div",
    allowedTags: ["div"],
    contentFields: [{ key: "images", label: "Images", kind: "gallery" }],
    hint: "Grid of pictures, or a gallery field",
    settings: [
      { key: "layout", label: "Layout", kind: "select", default: "grid", options: [{ value: "grid", label: "Grid (square tiles)" }, { value: "masonry", label: "Masonry (natural heights)" }] },
      { key: "columns", label: "Masonry columns", kind: "number", min: 1, max: 6, default: 3, when: { key: "layout", is: ["masonry"] } },
      { key: "lightbox", label: "Open larger on click", kind: "toggle", default: false },
    ],
    defaults: { props: { images: [] }, style: { desktop: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "var(--space-sm)" }, mobile: { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" } } },
  },
  richtext: {
    label: "Post content",
    category: "dynamic",
    icon: "file-text",
    keywords: "post content body entry",
    isContainer: false,
    defaultTag: "div",
    allowedTags: ["div", "article"],
    contentFields: [],
    hint: "An entry's body or a rich text field",
    defaults: { props: {}, style: { desktop: { lineHeight: "1.7", maxWidth: "68ch" } } },
  },
  loop: {
    label: "Loop grid",
    category: "dynamic",
    icon: "repeat",
    keywords: "post grid loop query blog",
    isContainer: true,
    defaultTag: "div",
    allowedTags: ["div", "section"],
    contentFields: [],
    hint: "Repeats a card for each entry of a post type",
    defaults: {
      props: { query: { postTypeId: null, limit: 6, orderBy: "date", order: "desc", termId: null, offset: 0 } satisfies LoopQuery },
      style: { desktop: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "var(--space-md)" }, tablet: { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }, mobile: { gridTemplateColumns: "minmax(0, 1fr)" } },
    },
  },
  price: {
    label: "Price",
    category: "commerce",
    icon: "tag",
    keywords: "cost amount",
    isContainer: false,
    defaultTag: "p",
    allowedTags: ["p", "span"],
    contentFields: [{ key: "price", label: "Price", kind: "price" }],
    hint: "Formatted price clients can update",
    defaults: { props: { price: { amount: 100, currency: "USD", compareAt: null } }, style: { desktop: { fontFamily: "var(--font-display)", fontSize: "2rem" } } },
  },
  langswitch: {
    label: "Language switcher",
    category: "dynamic",
    icon: "languages",
    keywords: "translation i18n",
    isContainer: false,
    defaultTag: "nav",
    allowedTags: ["nav", "div"],
    contentFields: [],
    hint: "Links to this page in the site's other languages",
    defaults: { props: { display: "label", variant: "inline" } satisfies LanguageSwitcherProps, style: { desktop: { display: "flex", gap: "var(--space-sm)", fontSize: "0.9rem" } } },
  },
  productgrid: {
    label: "Product grid",
    category: "commerce",
    icon: "store",
    keywords: "shop products",
    isContainer: false,
    defaultTag: "div",
    allowedTags: ["div", "section"],
    contentFields: [],
    hint: "Cards for the shop's products with Add to cart",
    defaults: {
      props: { limit: 6, sort: "newest", inStockOnly: false, showSort: false, buttonLabel: "Add to cart" } satisfies ProductGridProps,
      style: { desktop: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "var(--space-md)" }, tablet: { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }, mobile: { gridTemplateColumns: "minmax(0, 1fr)" } },
    },
  },
  product: {
    label: "Product details",
    category: "commerce",
    icon: "package",
    keywords: "shop product",
    isContainer: false,
    defaultTag: "div",
    allowedTags: ["div", "section", "article"],
    contentFields: [],
    hint: "Gallery, price, variant pickers and Add to cart",
    defaults: {
      props: { productId: null, buttonLabel: "Add to cart" } satisfies ProductDetailsProps,
      style: { desktop: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "var(--space-lg)" }, mobile: { gridTemplateColumns: "minmax(0, 1fr)" } },
    },
  },
  cart: {
    label: "Cart",
    category: "commerce",
    icon: "shopping-cart",
    keywords: "basket checkout",
    isContainer: false,
    defaultTag: "div",
    allowedTags: ["div", "nav"],
    contentFields: [],
    hint: "Cart button with a slide-out drawer and checkout",
    defaults: { props: { label: "Cart" } satisfies CartProps, style: { desktop: { fontSize: "0.9rem" } } },
  },

  // ── Structure & layout ────────────────────────────────────────────────────
  spacer: {
    label: "Spacer",
    category: "layout",
    icon: "move-vertical",
    keywords: "gap space whitespace",
    isContainer: false,
    defaultTag: "div",
    allowedTags: ["div"],
    contentFields: [],
    hint: "Empty space with an adjustable height",
    defaults: { props: {}, style: { desktop: { height: "var(--space-lg, 4rem)" }, mobile: { height: "var(--space-md, 2rem)" } } },
  },
  divider: {
    label: "Divider",
    category: "layout",
    icon: "separator-horizontal",
    keywords: "hr line rule separator wave shape",
    isContainer: false,
    defaultTag: "div",
    allowedTags: ["div"],
    contentFields: [],
    hint: "Line or SVG shape between sections",
    settings: [
      {
        key: "shape",
        label: "Shape",
        kind: "select",
        default: "line",
        options: [
          { value: "line", label: "Line" },
          { value: "wave", label: "Wave" },
          { value: "curve", label: "Curve" },
          { value: "tilt", label: "Tilt" },
          { value: "triangle", label: "Triangle" },
          { value: "zigzag", label: "Zigzag" },
          { value: "mountains", label: "Mountains" },
        ],
      },
      { key: "lineStyle", label: "Line style", kind: "select", default: "solid", options: ["solid", "dashed", "dotted", "double"].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) })), when: { key: "shape", is: ["line"] } },
      { key: "thickness", label: "Thickness", kind: "number", min: 1, max: 24, unit: "px", default: 1, when: { key: "shape", is: ["line"] } },
      { key: "length", label: "Length", kind: "number", min: 5, max: 100, step: 5, unit: "%", default: 100, when: { key: "shape", is: ["line"] } },
      { key: "align", label: "Align", kind: "select", default: "center", options: [{ value: "left", label: "Left" }, { value: "center", label: "Centre" }, { value: "right", label: "Right" }], when: { key: "shape", is: ["line"] } },
      { key: "shapeHeight", label: "Shape height", kind: "number", min: 10, max: 300, step: 5, unit: "px", default: 80, when: { key: "shape", is: ["wave", "curve", "tilt", "triangle", "zigzag", "mountains"] } },
      { key: "flip", label: "Flip horizontally", kind: "toggle", default: false, when: { key: "shape", is: ["wave", "curve", "tilt", "triangle", "zigzag", "mountains"] } },
      { key: "invert", label: "Upside down", kind: "toggle", default: false, when: { key: "shape", is: ["wave", "curve", "tilt", "triangle", "zigzag", "mountains"] } },
      COLOR("color", "Colour", { help: "Empty uses the border colour (lines) or the text colour (shapes)." }),
    ],
    defaults: { props: { shape: "line" }, style: { desktop: { padding: "var(--space-sm, 1rem) 0" } } },
  },

  // ── Basic content ─────────────────────────────────────────────────────────
  prose: {
    label: "Rich text",
    category: "basic",
    icon: "text-cursor-input",
    keywords: "wysiwyg paragraph formatted editor drop cap",
    isContainer: false,
    defaultTag: "div",
    allowedTags: ["div", "article"],
    contentFields: [{ key: "html", label: "Text", kind: "html", maxLength: 20000 }],
    hint: "Formatted text: headings, bold, lists, links",
    settings: [
      { key: "dropCap", label: "Drop cap", kind: "toggle", default: false, help: "Enlarges the first letter." },
      { key: "columns", label: "Columns", kind: "number", min: 1, max: 3, default: 1, help: "Flows long text into newspaper columns (one column on mobile)." },
    ],
    defaults: { props: { html: "<p>Write something <strong>memorable</strong>. Use the toolbar for headings, lists and links.</p>" }, style: { desktop: { lineHeight: "1.7", maxWidth: "68ch" } } },
  },
  video: {
    label: "Video",
    category: "basic",
    icon: "clapperboard",
    keywords: "youtube vimeo mp4 movie embed",
    isContainer: false,
    defaultTag: "div",
    allowedTags: ["div"],
    contentFields: [{ key: "video", label: "Video", kind: "video" }],
    hint: "Uploaded video, YouTube or Vimeo",
    settings: [
      { key: "autoplay", label: "Autoplay (muted)", kind: "toggle", default: false, help: "Browsers only autoplay muted videos, so autoplay also mutes." },
      { key: "loop", label: "Loop", kind: "toggle", default: false },
      { key: "controls", label: "Show controls", kind: "toggle", default: true },
      { key: "muted", label: "Start muted", kind: "toggle", default: false },
    ],
    defaults: { props: { video: { assetId: null, src: "" } }, style: { desktop: { aspectRatio: "16 / 9", borderRadius: "var(--radius-md)" } } },
  },
  icon: {
    label: "Icon",
    category: "basic",
    icon: "smile",
    keywords: "lucide symbol glyph",
    isContainer: false,
    defaultTag: "div",
    allowedTags: ["div", "span"],
    contentFields: [{ key: "icon", label: "Icon", kind: "icon" }],
    hint: "A single Lucide icon",
    settings: [
      { key: "size", label: "Size", kind: "number", min: 12, max: 256, unit: "px", default: 40 },
      { key: "strokeWidth", label: "Line weight", kind: "number", min: 0.5, max: 3, step: 0.25, default: 1.75 },
      {
        key: "shape",
        label: "Backdrop",
        kind: "select",
        default: "none",
        options: [
          { value: "none", label: "None" },
          { value: "circle", label: "Circle" },
          { value: "square", label: "Rounded square" },
        ],
      },
      COLOR("backdrop", "Backdrop colour", { when: { key: "shape", is: ["circle", "square"] } }),
      HOVER,
    ],
    defaults: { props: { icon: "sparkles" }, style: { desktop: { color: "var(--color-primary)" } } },
  },
  iconbox: {
    label: "Icon box",
    category: "basic",
    icon: "square-dashed-bottom",
    keywords: "feature card service benefit",
    isContainer: false,
    defaultTag: "div",
    allowedTags: ["div", "article"],
    contentFields: [
      { key: "icon", label: "Icon", kind: "icon" },
      { key: "title", label: "Title", kind: "text", maxLength: 120 },
      { key: "text", label: "Text", kind: "multiline", maxLength: 600 },
    ],
    hint: "Icon with a title and short description",
    settings: [
      { key: "layout", label: "Icon position", kind: "select", default: "top", options: [{ value: "top", label: "Above the text" }, { value: "left", label: "Beside the text" }] },
      { key: "iconSize", label: "Icon size", kind: "number", min: 16, max: 128, unit: "px", default: 32 },
      COLOR("iconColor", "Icon colour"),
      { key: "titleTag", label: "Title tag", kind: "select", default: "h3", options: ["h2", "h3", "h4", "h5", "h6", "p"].map((v) => ({ value: v, label: v.toUpperCase() })) },
      { ...HOVER, default: "lift" },
    ],
    defaults: {
      props: { icon: "rocket", title: "Fast to launch", text: "A short sentence about this benefit and why it matters to your visitors." },
      style: { desktop: { padding: "var(--space-md, 2rem)", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border, rgba(0,0,0,.1))", gap: "var(--space-sm, 1rem)" } },
    },
  },
  map: {
    label: "Google Map",
    category: "basic",
    icon: "map-pin",
    keywords: "location address directions google maps",
    isContainer: false,
    defaultTag: "div",
    allowedTags: ["div"],
    contentFields: [{ key: "address", label: "Address or place", kind: "text", maxLength: 200 }],
    hint: "Embedded map of an address",
    settings: [
      { key: "zoom", label: "Zoom", kind: "number", min: 1, max: 20, default: 14 },
      { key: "mapType", label: "Map type", kind: "select", default: "roadmap", options: [{ value: "roadmap", label: "Map" }, { value: "satellite", label: "Satellite" }] },
      {
        key: "tone",
        label: "Tone",
        kind: "select",
        default: "color",
        options: [
          { value: "color", label: "Full colour" },
          { value: "muted", label: "Muted" },
          { value: "grayscale", label: "Greyscale" },
          { value: "dark", label: "Dark" },
        ],
        help: "Tints the map to sit quietly in your design.",
      },
      { key: "pin", label: "Pin overlay", kind: "icon", default: "", help: "Optional icon drawn over the centre in your brand colour." },
      COLOR("pinColor", "Pin colour"),
    ],
    defaults: { props: { address: "Eiffel Tower, Paris" }, style: { desktop: { aspectRatio: "16 / 9", borderRadius: "var(--radius-md)" }, mobile: { aspectRatio: "4 / 3" } } },
  },
};

/** How the language switcher shows its links. */
export interface LanguageSwitcherProps {
  /** Language names ("Français") or short codes ("FR"). */
  display: "label" | "code";
  /** A row of links, or a compact dropdown that works without JavaScript. */
  variant: "inline" | "dropdown";
}

/** A widget property that can show dynamic data instead of a typed-in value. */
export interface BindTarget {
  key: string;
  label: string;
  accepts: BindKind;
}

export const BACKGROUND_TARGET = "style.backgroundImage";

export const BINDABLE: Record<WidgetType, BindTarget[]> = {
  section: [{ key: BACKGROUND_TARGET, label: "Background image", accepts: "image" }],
  container: [{ key: BACKGROUND_TARGET, label: "Background image", accepts: "image" }],
  loop: [],
  heading: [{ key: "text", label: "Text", accepts: "text" }],
  text: [{ key: "text", label: "Text", accepts: "text" }],
  image: [{ key: "image", label: "Image", accepts: "image" }],
  button: [
    { key: "link.label", label: "Label", accepts: "text" },
    { key: "link.href", label: "Link", accepts: "url" },
  ],
  price: [{ key: "price", label: "Price", accepts: "price" }],
  gallery: [{ key: "images", label: "Images", accepts: "gallery" }],
  richtext: [{ key: "html", label: "Content", accepts: "html" }],
  langswitch: [],
  productgrid: [],
  product: [],
  cart: [],
  spacer: [],
  divider: [],
  prose: [],
  video: [],
  icon: [],
  iconbox: [
    { key: "title", label: "Title", accepts: "text" },
    { key: "text", label: "Text", accepts: "text" },
  ],
  map: [{ key: "address", label: "Address", accepts: "text" }],
};

/** The content field a binding target belongs to ("link.href" → "link"). */
export const targetField = (target: string) => target.split(".")[0];

export function contentField(type: WidgetType, key: string): ContentField | undefined {
  return WIDGETS[type].contentFields.find((f) => f.key === key);
}

/** Spacing and structure. Guarded by the `layout` lock. */
export const LAYOUT_STYLE_KEYS: ReadonlySet<StyleKey> = new Set<StyleKey>([
  "display", "flexDirection", "flexWrap", "justifyContent", "alignItems", "gap",
  "gridTemplateColumns", "gridColumn", "padding", "margin", "width", "maxWidth",
  "minHeight", "aspectRatio", "objectFit", "order", "flex", "alignSelf", "height",
]);

/**
 * The few look-and-feel properties a client may touch on a style-unlocked
 * node. Everything else (fonts, borders, shadows, raw sizes) stays with the
 * designer even when the lock is off, so the brand system can't drift.
 */
export const CLIENT_STYLE_KEYS: ReadonlySet<StyleKey> = new Set<StyleKey>([
  "color", "background", "textAlign",
]);

/** Layout properties a client may adjust on a layout-unlocked node. */
export const CLIENT_LAYOUT_KEYS: ReadonlySet<StyleKey> = new Set<StyleKey>([
  "justifyContent", "alignItems", "gap",
]);
