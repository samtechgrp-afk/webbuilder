import { BRAND_ICONS } from "./brand-icons";
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
  /** A media library audio file or an https audio address (same shape as video). */
  | "audio"
  /** A Lucide icon name from the curated set. */
  | "icon"
  /** A number within min..max (a percentage, a counter's target, a star rating). */
  | "number"
  /** A local date and time, "2026-12-31T23:59" (countdowns). */
  | "datetime"
  /** A repeatable list of small records (accordion panels, tabs, slides, plan features). */
  | "items";

/** One field of an `items` record. */
export interface ItemField {
  key: string;
  label: string;
  kind: "text" | "multiline" | "link" | "image" | "number" | "icon" | "toggle" | "lines" | "choice";
  maxLength?: number;
  min?: number;
  max?: number;
  /** choice: the allowed values (the first is the default). Values aren't translated. */
  options?: { value: string; label: string }[];
  /** Only show this field in the inspector when another field of the record has one of these values. */
  when?: { key: string; is: string[] };
}

/** Networks a Social links profile can point at: brand icons plus email, phone and website. */
export const SOCIAL_NETWORKS = [
  ...Object.entries(BRAND_ICONS)
    .map(([value, b]) => ({ value, label: b.label }))
    .sort((a, b) => a.label.localeCompare(b.label)),
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "website", label: "Website" },
];

/** Field types a Contact form offers. Values are stored; labels are what the inspector shows. */
export const FORM_FIELD_TYPES = [
  { value: "text", label: "Short text" },
  { value: "email", label: "Email" },
  { value: "tel", label: "Phone" },
  { value: "textarea", label: "Long text" },
  { value: "select", label: "Dropdown" },
  { value: "radio", label: "Single choice" },
  { value: "checkbox", label: "Checkbox (yes / no)" },
  { value: "number", label: "Number" },
  { value: "url", label: "Website address" },
  { value: "date", label: "Date" },
  { value: "rating", label: "Star rating (1 to 5)" },
  { value: "file", label: "File upload" },
];

export interface ContentField {
  key: string;
  label: string;
  kind: ContentFieldKind;
  maxLength?: number;
  /** link: an empty address means "no button" instead of being an error. */
  optionalLink?: boolean;
  /** number: bounds. */
  min?: number;
  max?: number;
  step?: number;
  /** items: the record's fields, list bounds, and what one record is called ("Panel"). */
  itemFields?: ItemField[];
  minItems?: number;
  maxItems?: number;
  itemLabel?: string;
  /**
   * gallery: how the inspector edits the list. "image-gallery" shows a
   * thumbnail strip with a button that opens the gallery manager (bulk
   * upload, reorder, alt text) instead of the inline list.
   */
  ui?: "image-gallery";
}

/** Content kinds that are the same in every language (a translation can't override them). */
export const SHARED_CONTENT_KINDS: ReadonlySet<ContentFieldKind> = new Set<ContentFieldKind>(["video", "audio", "icon", "number", "datetime"]);

/** Item field kinds a translation overrides; the rest come from the original. */
export const TRANSLATABLE_ITEM_KINDS: ReadonlySet<ItemField["kind"]> = new Set<ItemField["kind"]>(["text", "multiline", "link", "lines"]);

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

  // ── Advanced & interactive ────────────────────────────────────────────────
  accordion: {
    label: "Accordion",
    category: "interactive",
    icon: "list-collapse",
    keywords: "faq collapse toggle questions",
    isContainer: false,
    defaultTag: "div",
    allowedTags: ["div", "section"],
    contentFields: [
      {
        key: "items",
        label: "Panels",
        kind: "items",
        itemLabel: "Panel",
        minItems: 1,
        maxItems: 30,
        itemFields: [
          { key: "title", label: "Question / title", kind: "text", maxLength: 200 },
          { key: "body", label: "Answer / content", kind: "multiline", maxLength: 3000 },
        ],
      },
    ],
    hint: "Collapsible panels, ideal for FAQs",
    settings: [
      { key: "mode", label: "Open panels", kind: "select", default: "single", options: [{ value: "single", label: "One at a time" }, { value: "multi", label: "Several at once" }] },
      { key: "firstOpen", label: "First panel starts open", kind: "toggle", default: true },
      { key: "marker", label: "Marker", kind: "select", default: "chevron", options: [{ value: "chevron", label: "Chevron" }, { value: "plus", label: "Plus / minus" }] },
      { key: "titleTag", label: "Title tag", kind: "select", default: "h3", options: ["h2", "h3", "h4", "h5", "h6", "p"].map((v) => ({ value: v, label: v.toUpperCase() })), help: "Keeps the page outline right for screen readers and search." },
    ],
    defaults: {
      props: {
        items: [
          { title: "How long does a project take?", body: "Most projects take six to ten weeks from the first conversation to launch." },
          { title: "Can I update the site myself?", body: "Yes. You can change text, images and prices on the page, inside the guardrails your designer sets." },
          { title: "Do you offer support?", body: "Every plan includes email support and a monthly check-in." },
        ],
      },
      style: { desktop: { display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: "760px" } },
    },
  },
  tabs: {
    label: "Tabs",
    category: "interactive",
    icon: "panels-top-left",
    keywords: "tabbed panels switch",
    isContainer: false,
    defaultTag: "div",
    allowedTags: ["div", "section"],
    contentFields: [
      {
        key: "items",
        label: "Tabs",
        kind: "items",
        itemLabel: "Tab",
        minItems: 1,
        maxItems: 12,
        itemFields: [
          { key: "label", label: "Tab label", kind: "text", maxLength: 60 },
          { key: "title", label: "Panel title", kind: "text", maxLength: 160 },
          { key: "body", label: "Panel text", kind: "multiline", maxLength: 3000 },
        ],
      },
    ],
    hint: "Horizontal or vertical tabbed panels",
    settings: [
      { key: "orientation", label: "Orientation", kind: "select", default: "horizontal", options: [{ value: "horizontal", label: "Tabs on top" }, { value: "vertical", label: "Tabs on the side" }] },
      { key: "look", label: "Tab style", kind: "select", default: "underline", options: [{ value: "underline", label: "Underline" }, { value: "pills", label: "Pills" }, { value: "boxed", label: "Boxed" }] },
    ],
    defaults: {
      props: {
        items: [
          { label: "Design", title: "Design that fits your brand", body: "We start from your goals and your audience, then shape every page around them." },
          { label: "Build", title: "Built to be fast", body: "Pages are rendered on the server and ship almost no JavaScript." },
          { label: "Launch", title: "Launch with confidence", body: "We test on every screen size and hand over a site you can update yourself." },
        ],
      },
      style: { desktop: { maxWidth: "900px" } },
    },
  },
  carousel: {
    label: "Carousel",
    category: "interactive",
    icon: "gallery-horizontal",
    keywords: "slider slideshow hero banner swipe",
    isContainer: false,
    defaultTag: "div",
    allowedTags: ["div", "section"],
    contentFields: [
      {
        key: "items",
        label: "Slides",
        kind: "items",
        itemLabel: "Slide",
        minItems: 1,
        maxItems: 20,
        itemFields: [
          { key: "image", label: "Image", kind: "image" },
          { key: "title", label: "Title", kind: "text", maxLength: 160 },
          { key: "text", label: "Text", kind: "multiline", maxLength: 600 },
          { key: "link", label: "Button", kind: "link", maxLength: 80 },
        ],
      },
    ],
    hint: "Swipeable slides with arrows and dots",
    settings: [
      { key: "perView", label: "Slides visible", kind: "number", min: 1, max: 4, default: 1, help: "On phones one slide shows at a time." },
      { key: "aspect", label: "Slide shape", kind: "select", default: "16 / 7", options: [{ value: "16 / 7", label: "Wide banner" }, { value: "16 / 9", label: "Widescreen" }, { value: "4 / 3", label: "Classic" }, { value: "1 / 1", label: "Square" }, { value: "3 / 4", label: "Portrait" }] },
      { key: "textPosition", label: "Text", kind: "select", default: "overlay", options: [{ value: "overlay", label: "Over the image" }, { value: "below", label: "Below the image" }] },
      { key: "arrows", label: "Arrows", kind: "toggle", default: true },
      { key: "dots", label: "Pagination dots", kind: "toggle", default: true },
      { key: "autoplay", label: "Autoplay", kind: "toggle", default: false, help: "Pauses while hovered or focused, and for visitors who prefer reduced motion." },
      { key: "interval", label: "Seconds per slide", kind: "number", min: 2, max: 20, default: 5, when: { key: "autoplay", is: [true] } },
      { key: "loop", label: "Loop back to the start", kind: "toggle", default: true },
    ],
    defaults: {
      props: {
        items: [
          { image: { assetId: null, src: "", alt: "" }, title: "Spring collection", text: "New pieces, made to last.", link: { label: "Shop now", href: "/shop" } },
          { image: { assetId: null, src: "", alt: "" }, title: "Designed in-house", text: "Every detail considered.", link: { label: "Our studio", href: "/about" } },
        ],
      },
      style: { desktop: { borderRadius: "var(--radius-md)" } },
    },
  },
  testimonial: {
    label: "Testimonial",
    category: "interactive",
    icon: "quote",
    keywords: "review quote customer rating stars",
    isContainer: false,
    defaultTag: "figure",
    allowedTags: ["figure", "div", "article"],
    contentFields: [
      { key: "quote", label: "Quote", kind: "multiline", maxLength: 1000 },
      { key: "name", label: "Name", kind: "text", maxLength: 80 },
      { key: "role", label: "Role or company", kind: "text", maxLength: 120 },
      { key: "avatar", label: "Photo", kind: "image" },
      { key: "rating", label: "Stars", kind: "number", min: 0, max: 5, step: 1 },
    ],
    hint: "Customer quote with photo and star rating",
    settings: [
      { key: "layout", label: "Layout", kind: "select", default: "card", options: [{ value: "card", label: "Card" }, { value: "centered", label: "Centred" }, { value: "minimal", label: "Minimal" }] },
      { key: "showRating", label: "Show stars", kind: "toggle", default: true },
      COLOR("starColor", "Star colour", { default: "#f5a524" }),
    ],
    defaults: {
      props: { quote: "They understood exactly what we wanted and delivered it ahead of schedule.", name: "Jordan Lee", role: "Founder, Northwind", avatar: { assetId: null, src: "", alt: "" }, rating: 5 },
      style: { desktop: { padding: "var(--space-md, 2rem)", borderRadius: "var(--radius-md)", background: "var(--color-surface, rgba(0,0,0,.03))" } },
    },
  },
  pricing: {
    label: "Pricing table",
    category: "interactive",
    icon: "badge-dollar-sign",
    keywords: "plan tier price package subscription ribbon",
    isContainer: false,
    defaultTag: "div",
    allowedTags: ["div", "article"],
    contentFields: [
      { key: "plan", label: "Plan name", kind: "text", maxLength: 60 },
      { key: "price", label: "Price", kind: "price" },
      { key: "period", label: "Billing period", kind: "text", maxLength: 30 },
      { key: "description", label: "Description", kind: "multiline", maxLength: 300 },
      {
        key: "features",
        label: "Features",
        kind: "items",
        itemLabel: "Feature",
        maxItems: 20,
        itemFields: [
          { key: "text", label: "Feature", kind: "text", maxLength: 120 },
          { key: "included", label: "Included", kind: "toggle" },
        ],
      },
      { key: "link", label: "Button", kind: "link", maxLength: 80 },
      { key: "ribbon", label: "Ribbon", kind: "text", maxLength: 30 },
    ],
    hint: "Plan, price, feature checklist and button",
    settings: [
      { key: "featured", label: "Highlight this plan", kind: "toggle", default: false },
      COLOR("accent", "Accent colour", { default: "var(--color-primary)" }),
    ],
    defaults: {
      props: {
        plan: "Studio",
        price: { amount: 49, currency: "USD", compareAt: null },
        period: "/month",
        description: "For growing teams that want a site they can update themselves.",
        features: [
          { text: "Unlimited pages", included: true },
          { text: "Custom domain", included: true },
          { text: "Online shop", included: true },
          { text: "Priority support", included: false },
        ],
        link: { label: "Start free trial", href: "/signup" },
        ribbon: "",
      },
      style: { desktop: { padding: "var(--space-lg, 2.5rem)", borderRadius: "var(--radius-lg, 16px)", border: "1px solid var(--color-border, rgba(0,0,0,.1))", background: "var(--color-surface, #fff)" } },
    },
  },
  countdown: {
    label: "Countdown",
    category: "interactive",
    icon: "timer",
    keywords: "timer launch deadline sale clock",
    isContainer: false,
    defaultTag: "div",
    allowedTags: ["div"],
    contentFields: [
      { key: "target", label: "Counts down to", kind: "datetime" },
      { key: "doneText", label: "Message when it ends", kind: "text", maxLength: 160 },
    ],
    hint: "Live countdown to a date and time",
    settings: [
      { key: "timezone", label: "Time zone", kind: "select", default: "local", options: [{ value: "local", label: "Each visitor's own time" }, { value: "UTC", label: "UTC" }], help: "Visitor time suits webinars; UTC means one moment worldwide." },
      { key: "units", label: "Show", kind: "select", default: "dhms", options: [{ value: "dhms", label: "Days, hours, minutes, seconds" }, { value: "dhm", label: "Days, hours, minutes" }, { value: "hms", label: "Hours, minutes, seconds" }] },
      { key: "onDone", label: "When it ends", kind: "select", default: "message", options: [{ value: "message", label: "Show the message" }, { value: "hide", label: "Hide the countdown" }, { value: "zero", label: "Stay at zero" }] },
      { key: "look", label: "Style", kind: "select", default: "boxes", options: [{ value: "boxes", label: "Boxes" }, { value: "plain", label: "Plain numbers" }] },
    ],
    defaults: { props: { target: "", doneText: "We're live!" }, style: { desktop: { gap: "var(--space-sm, 1rem)" } } },
  },
  flipbox: {
    label: "Flip box",
    category: "interactive",
    icon: "flip-horizontal-2",
    keywords: "card 3d hover flip reveal",
    isContainer: false,
    defaultTag: "div",
    allowedTags: ["div", "article"],
    contentFields: [
      { key: "icon", label: "Front icon", kind: "icon" },
      { key: "title", label: "Front title", kind: "text", maxLength: 120 },
      { key: "text", label: "Front text", kind: "multiline", maxLength: 400 },
      { key: "backTitle", label: "Back title", kind: "text", maxLength: 120 },
      { key: "backText", label: "Back text", kind: "multiline", maxLength: 600 },
      { key: "link", label: "Back button", kind: "link", maxLength: 80, optionalLink: true },
    ],
    hint: "Two-sided card that flips on hover or tap",
    settings: [
      { key: "direction", label: "Flip", kind: "select", default: "horizontal", options: [{ value: "horizontal", label: "Left to right" }, { value: "vertical", label: "Bottom to top" }] },
      COLOR("frontBg", "Front background", { default: "var(--color-surface, #f4f4f5)" }),
      COLOR("backBg", "Back background", { default: "var(--color-deep, #18181b)" }),
      COLOR("backColor", "Back text colour", { default: "var(--color-inverse, #fff)" }),
    ],
    defaults: {
      props: { icon: "lightbulb", title: "Strategy", text: "Hover to see how we work.", backTitle: "Plan first", backText: "We map your goals, audience and content before a single pixel is drawn.", link: { label: "Learn more", href: "/services" } },
      style: { desktop: { minHeight: "280px", borderRadius: "var(--radius-md)" } },
    },
  },
  cta: {
    label: "Call to action",
    category: "interactive",
    icon: "megaphone",
    keywords: "banner cta promo signup",
    isContainer: false,
    defaultTag: "section",
    allowedTags: ["section", "div", "aside"],
    contentFields: [
      { key: "image", label: "Background image", kind: "image" },
      { key: "title", label: "Title", kind: "text", maxLength: 160 },
      { key: "text", label: "Description", kind: "multiline", maxLength: 600 },
      { key: "link", label: "Button", kind: "link", maxLength: 80 },
      { key: "link2", label: "Second button", kind: "link", maxLength: 80, optionalLink: true },
    ],
    hint: "Banner with image, bold title and buttons",
    settings: [
      { key: "layout", label: "Layout", kind: "select", default: "overlay", options: [{ value: "overlay", label: "Text over the image" }, { value: "split", label: "Image beside the text" }, { value: "plain", label: "No image" }] },
      { key: "align", label: "Align", kind: "select", default: "center", options: [{ value: "left", label: "Left" }, { value: "center", label: "Centre" }] },
      COLOR("overlay", "Overlay colour", { default: "rgba(0,0,0,.45)", when: { key: "layout", is: ["overlay"] } }),
    ],
    defaults: {
      props: { image: { assetId: null, src: "", alt: "" }, title: "Ready to start your project?", text: "Tell us about it and we'll reply within one working day.", link: { label: "Get in touch", href: "/contact" }, link2: { label: "", href: "" } },
      style: { desktop: { padding: "var(--space-xl, 5rem) var(--space-lg, 3rem)", borderRadius: "var(--radius-lg, 16px)", background: "var(--color-deep, #18181b)", color: "var(--color-inverse, #fff)" }, mobile: { padding: "3rem 1.5rem" } },
    },
  },
  progress: {
    label: "Progress bar",
    category: "interactive",
    icon: "chart-bar",
    keywords: "skill meter percentage bar",
    isContainer: false,
    defaultTag: "div",
    allowedTags: ["div"],
    contentFields: [
      { key: "label", label: "Label", kind: "text", maxLength: 80 },
      { key: "value", label: "Percent", kind: "number", min: 0, max: 100, step: 1 },
    ],
    hint: "Animated percentage meter",
    settings: [
      { key: "showValue", label: "Show the percentage", kind: "toggle", default: true },
      { key: "thickness", label: "Thickness", kind: "number", min: 2, max: 40, unit: "px", default: 10 },
      COLOR("barColor", "Bar colour", { default: "var(--color-primary)" }),
      COLOR("trackColor", "Track colour"),
      { key: "animate", label: "Fill when scrolled into view", kind: "toggle", default: true },
    ],
    defaults: { props: { label: "Brand strategy", value: 85 }, style: { desktop: {} } },
  },
  counter: {
    label: "Counter",
    category: "interactive",
    icon: "hash",
    keywords: "number stat count up statistic",
    isContainer: false,
    defaultTag: "div",
    allowedTags: ["div"],
    contentFields: [
      { key: "value", label: "Number", kind: "number", min: -1_000_000_000, max: 1_000_000_000, step: 1 },
      { key: "prefix", label: "Before the number", kind: "text", maxLength: 10 },
      { key: "suffix", label: "After the number", kind: "text", maxLength: 10 },
      { key: "label", label: "Label", kind: "text", maxLength: 120 },
    ],
    hint: "Number that counts up into view",
    settings: [
      { key: "duration", label: "Count duration", kind: "number", min: 0, max: 10, step: 0.5, unit: "s", default: 2, help: "0 shows the number straight away." },
      { key: "separator", label: "Thousands separator", kind: "toggle", default: true },
      { key: "decimals", label: "Decimals", kind: "number", min: 0, max: 3, default: 0 },
    ],
    defaults: { props: { value: 250, prefix: "", suffix: "+", label: "Projects delivered" }, style: { desktop: { textAlign: "center" } } },
  },

  // ── Forms & lead capture ──────────────────────────────────────────────────
  form: {
    label: "Contact form",
    category: "forms",
    icon: "send",
    keywords: "contact enquiry message form email upload file submission lead",
    isContainer: false,
    defaultTag: "div",
    allowedTags: ["div", "section", "aside"],
    contentFields: [
      {
        key: "fields",
        label: "Fields",
        kind: "items",
        itemLabel: "Field",
        minItems: 1,
        maxItems: 20,
        itemFields: [
          { key: "label", label: "Label", kind: "text", maxLength: 120 },
          { key: "type", label: "Type", kind: "choice", options: FORM_FIELD_TYPES },
          { key: "placeholder", label: "Placeholder", kind: "text", maxLength: 120, when: { key: "type", is: ["text", "email", "tel", "number", "url", "textarea"] } },
          { key: "options", label: "Choices", kind: "lines", maxLength: 120, when: { key: "type", is: ["select", "radio"] } },
          { key: "required", label: "Required", kind: "toggle" },
          { key: "width", label: "Width", kind: "choice", options: [{ value: "full", label: "Full width" }, { value: "half", label: "Half width" }] },
        ],
      },
      { key: "submitLabel", label: "Button text", kind: "text", maxLength: 60 },
      { key: "successMessage", label: "Thank-you message", kind: "multiline", maxLength: 300 },
    ],
    hint: "Text, email, choices and file upload; messages land in Forms and your inbox",
    settings: [
      { key: "formName", label: "Form name", kind: "text", maxLength: 60, default: "Contact form", help: "How submissions are labelled in Forms and in notification emails." },
      { key: "notify", label: "Email each submission", kind: "toggle", default: true },
      { key: "recipients", label: "Send to", kind: "text", maxLength: 300, default: "", placeholder: "hello@example.com, team@example.com", help: "Up to 5 addresses, comma separated. Empty sends to everyone who can read form submissions.", when: { key: "notify", is: [true] } },
      { key: "labels", label: "Labels", kind: "select", default: "above", options: [{ value: "above", label: "Above the field" }, { value: "hidden", label: "Hidden (placeholder only)" }] },
      { key: "buttonWidth", label: "Button width", kind: "select", default: "auto", options: [{ value: "auto", label: "Fit text" }, { value: "full", label: "Full width" }] },
      COLOR("accent", "Accent colour", { default: "var(--color-primary)" }),
    ],
    defaults: {
      props: {
        fields: [
          { label: "Name", type: "text", placeholder: "Your name", required: true, width: "half" },
          { label: "Email", type: "email", placeholder: "you@example.com", required: true, width: "half" },
          { label: "Topic", type: "select", options: ["New project", "Question", "Something else"], required: false, width: "full" },
          { label: "Message", type: "textarea", placeholder: "How can we help?", required: true, width: "full" },
        ],
        submitLabel: "Send message",
        successMessage: "Thanks! We got your message and will reply soon.",
      },
      style: { desktop: { maxWidth: "640px" } },
    },
  },
  newsletter: {
    label: "Newsletter sign-up",
    category: "forms",
    icon: "mail",
    keywords: "subscribe email list mailing signup lead capture",
    isContainer: false,
    defaultTag: "div",
    allowedTags: ["div", "section", "aside"],
    contentFields: [
      { key: "title", label: "Title", kind: "text", maxLength: 120 },
      { key: "text", label: "Text", kind: "multiline", maxLength: 300 },
      { key: "placeholder", label: "Email placeholder", kind: "text", maxLength: 80 },
      { key: "buttonLabel", label: "Button text", kind: "text", maxLength: 40 },
      { key: "consent", label: "Consent note", kind: "multiline", maxLength: 300 },
      { key: "successMessage", label: "Thank-you message", kind: "multiline", maxLength: 300 },
    ],
    hint: "Collects email addresses into Forms → Subscribers",
    settings: [
      { key: "formName", label: "List name", kind: "text", maxLength: 60, default: "Newsletter", help: "Shown as the source of each subscriber." },
      { key: "askName", label: "Ask for a name", kind: "toggle", default: false },
      { key: "layout", label: "Layout", kind: "select", default: "inline", options: [{ value: "inline", label: "Field and button in a row" }, { value: "stacked", label: "Stacked" }] },
      { key: "notify", label: "Email me about new subscribers", kind: "toggle", default: false },
      COLOR("accent", "Accent colour", { default: "var(--color-primary)" }),
    ],
    defaults: {
      props: {
        title: "Stay in the loop",
        text: "One email a month with new work and ideas. No spam.",
        placeholder: "you@example.com",
        buttonLabel: "Subscribe",
        consent: "",
        successMessage: "You're subscribed. Thanks for joining!",
      },
      style: { desktop: { maxWidth: "560px" } },
    },
  },
  rating: {
    label: "Star rating",
    category: "forms",
    icon: "star",
    keywords: "stars review score rating reviews",
    isContainer: false,
    defaultTag: "div",
    allowedTags: ["div", "p", "span"],
    contentFields: [
      { key: "value", label: "Rating", kind: "number", min: 0, max: 10, step: 0.1 },
      { key: "label", label: "Label", kind: "text", maxLength: 120 },
    ],
    hint: "Shows a score as stars, with partial stars",
    settings: [
      { key: "max", label: "Out of", kind: "number", min: 3, max: 10, default: 5 },
      { key: "size", label: "Star size", kind: "number", min: 12, max: 64, unit: "px", default: 20 },
      COLOR("color", "Star colour", { default: "#f59e0b" }),
      { key: "showValue", label: "Show the number", kind: "toggle", default: true },
    ],
    defaults: { props: { value: 4.8, label: "from 120 reviews" }, style: {} },
  },

  // ── Navigation, site and social ───────────────────────────────────────────
  nav: {
    label: "Navigation menu",
    category: "dynamic",
    icon: "menu",
    keywords: "menu nav header links hamburger drawer mobile dropdown submenu",
    isContainer: false,
    defaultTag: "nav",
    allowedTags: ["nav"],
    contentFields: [
      {
        key: "items",
        label: "Menu items",
        kind: "items",
        itemLabel: "Item",
        minItems: 1,
        maxItems: 30,
        itemFields: [
          { key: "link", label: "Link", kind: "link" },
          { key: "level", label: "Level", kind: "choice", options: [{ value: "top", label: "Top level" }, { value: "sub", label: "Under the item above (dropdown)" }] },
        ],
      },
      { key: "label", label: "Menu name (for screen readers)", kind: "text", maxLength: 60 },
    ],
    hint: "Links with dropdowns; becomes a hamburger drawer on small screens",
    settings: [
      { key: "align", label: "Alignment", kind: "select", default: "end", options: [{ value: "start", label: "Left" }, { value: "center", label: "Centre" }, { value: "end", label: "Right" }] },
      { key: "drawer", label: "Hamburger menu", kind: "select", default: "mobile", options: [{ value: "mobile", label: "On phones" }, { value: "tablet", label: "On tablets and phones" }, { value: "always", label: "Always" }, { value: "never", label: "Never (links wrap)" }] },
      { key: "side", label: "Drawer opens from", kind: "select", default: "right", options: [{ value: "right", label: "Right" }, { value: "left", label: "Left" }, { value: "top", label: "Top (drops down)" }] },
      { key: "look", label: "Link style", kind: "select", default: "plain", options: [{ value: "plain", label: "Plain" }, { value: "underline", label: "Underline the current page" }, { value: "pill", label: "Pill on the current page" }] },
      { key: "gap", label: "Space between links", kind: "number", min: 0, max: 64, unit: "px", default: 24 },
      COLOR("accent", "Highlight colour", { default: "var(--color-primary)" }),
      COLOR("drawerBg", "Drawer background", { default: "" }),
    ],
    defaults: {
      props: {
        label: "Main",
        items: [
          { link: { label: "Home", href: "/" }, level: "top" },
          { link: { label: "About", href: "/about" }, level: "top" },
          { link: { label: "Services", href: "/services" }, level: "top" },
          { link: { label: "Interiors", href: "/services#interiors" }, level: "sub" },
          { link: { label: "Renovation", href: "/services#renovation" }, level: "sub" },
          { link: { label: "Contact", href: "/contact" }, level: "top" },
        ],
      },
      style: {},
    },
  },
  breadcrumbs: {
    label: "Breadcrumbs",
    category: "dynamic",
    icon: "chevron-right",
    keywords: "trail path location navigation crumbs",
    isContainer: false,
    defaultTag: "nav",
    allowedTags: ["nav"],
    contentFields: [{ key: "homeLabel", label: "Home label", kind: "text", maxLength: 40 }],
    hint: "Home › section › current page, filled in on every page",
    settings: [
      { key: "separator", label: "Separator", kind: "select", default: "chevron", options: [{ value: "chevron", label: "›" }, { value: "slash", label: "/" }, { value: "dot", label: "·" }, { value: "arrow", label: "→" }] },
      { key: "showCurrent", label: "Show the current page", kind: "toggle", default: true },
    ],
    defaults: { props: { homeLabel: "Home" }, style: { desktop: { fontSize: "0.9rem" } } },
  },
  search: {
    label: "Search bar",
    category: "dynamic",
    icon: "search",
    keywords: "find query lookup site search",
    isContainer: false,
    defaultTag: "div",
    allowedTags: ["div"],
    contentFields: [
      { key: "placeholder", label: "Placeholder", kind: "text", maxLength: 80 },
      { key: "buttonLabel", label: "Button text", kind: "text", maxLength: 30 },
    ],
    hint: "Searches the site's published pages and posts",
    settings: [
      { key: "button", label: "Button", kind: "select", default: "icon", options: [{ value: "icon", label: "Magnifier icon" }, { value: "text", label: "Text" }, { value: "none", label: "None (press Enter)" }] },
      { key: "shape", label: "Shape", kind: "select", default: "pill", options: [{ value: "pill", label: "Rounded" }, { value: "square", label: "Square" }] },
    ],
    defaults: { props: { placeholder: "Search…", buttonLabel: "Search" }, style: { desktop: { maxWidth: "420px" } } },
  },
  social: {
    label: "Social links",
    category: "social",
    icon: "share-2",
    keywords: "social icons follow share facebook instagram x twitter linkedin youtube tiktok whatsapp",
    isContainer: false,
    defaultTag: "div",
    allowedTags: ["div", "nav"],
    contentFields: [
      {
        key: "items",
        label: "Profiles",
        kind: "items",
        itemLabel: "Profile",
        maxItems: 20,
        itemFields: [
          { key: "network", label: "Network", kind: "choice", options: SOCIAL_NETWORKS },
          { key: "link", label: "Address", kind: "link" },
        ],
      },
    ],
    hint: "Follow links to your profiles, or share buttons for the page",
    settings: [
      { key: "mode", label: "Buttons", kind: "select", default: "follow", options: [{ value: "follow", label: "Follow: link to my profiles" }, { value: "share", label: "Share: share this page" }] },
      { key: "networks", label: "Share on", kind: "select", default: "popular", options: [{ value: "popular", label: "Facebook, X, LinkedIn, WhatsApp, email" }, { value: "all", label: "All share networks" }, { value: "minimal", label: "X, LinkedIn, email" }], when: { key: "mode", is: ["share"] } },
      { key: "labels", label: "Show names", kind: "toggle", default: false },
      { key: "shape", label: "Shape", kind: "select", default: "circle", options: [{ value: "plain", label: "Icon only" }, { value: "circle", label: "Circle" }, { value: "rounded", label: "Rounded square" }] },
      { key: "colors", label: "Colours", kind: "select", default: "brand", options: [{ value: "brand", label: "Brand colours" }, { value: "mono", label: "Text colour" }] },
      { key: "size", label: "Icon size", kind: "number", min: 12, max: 48, unit: "px", default: 18 },
    ],
    defaults: {
      props: {
        items: [
          { network: "instagram", link: { label: "", href: "https://instagram.com/" } },
          { network: "facebook", link: { label: "", href: "https://facebook.com/" } },
          { network: "linkedin", link: { label: "", href: "https://linkedin.com/" } },
        ],
      },
      style: {},
    },
  },
  audio: {
    label: "Audio player",
    category: "social",
    icon: "headphones",
    keywords: "music podcast mp3 sound player episode",
    isContainer: false,
    defaultTag: "figure",
    allowedTags: ["figure", "div"],
    contentFields: [
      { key: "audio", label: "Audio", kind: "audio" },
      { key: "title", label: "Title", kind: "text", maxLength: 120 },
      { key: "artist", label: "Artist or show", kind: "text", maxLength: 120 },
      { key: "cover", label: "Cover image", kind: "image" },
    ],
    hint: "Plays an MP3, M4A, OGG or WAV with the browser's own controls",
    settings: [
      { key: "loop", label: "Loop", kind: "toggle", default: false },
      { key: "download", label: "Allow download", kind: "toggle", default: true },
      { key: "look", label: "Look", kind: "select", default: "card", options: [{ value: "card", label: "Card with cover" }, { value: "minimal", label: "Player only" }] },
    ],
    defaults: { props: { audio: { assetId: null, src: "" }, title: "Episode 1: Light and space", artist: "The Aurelia podcast", cover: { assetId: null, src: "", alt: "" } }, style: {} },
  },
  embed: {
    label: "Embed code",
    category: "social",
    icon: "code",
    keywords: "html iframe widget script third party calendly typeform",
    isContainer: false,
    defaultTag: "div",
    allowedTags: ["div"],
    contentFields: [],
    hint: "Third-party HTML in a sandboxed frame (booking, forms, maps)",
    settings: [
      { key: "code", label: "Code", kind: "code", maxLength: 20000, default: "", placeholder: "<iframe src=\"https://…\"></iframe>", help: "Runs in a sealed-off frame: it can't read your site, its cookies or its visitors' sessions." },
      { key: "title", label: "Title (for screen readers)", kind: "text", maxLength: 80, default: "Embedded content" },
      { key: "height", label: "Height", kind: "number", min: 60, max: 1600, step: 10, unit: "px", default: 400 },
    ],
    defaults: { props: {}, style: {} },
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
  "tilted-grid-hero": {
    label: "Tilted grid hero",
    category: "interactive",
    icon: "film",
    keywords: "hero banner 3d curved cylinder marquee images showcase premium motion",
    isContainer: true,
    defaultTag: "section",
    allowedTags: ["section", "header", "div"],
    contentFields: [{ key: "images", label: "Images", kind: "gallery", ui: "image-gallery" }],
    hint: "Images curve round a 3D band behind your headline",
    settings: [
      { key: "speed", label: "Seconds per tile", kind: "number", min: 1, max: 20, step: 0.5, unit: "s", default: 4, help: "How long the row takes to move on by one image. Lower is faster." },
      { key: "tileHeight", label: "Tile height", kind: "number", min: 10, max: 60, step: 1, unit: "%", default: 26, help: "Share of the hero's height." },
      {
        key: "aspect",
        label: "Tile shape",
        kind: "select",
        default: "16 / 9",
        options: [
          { value: "16 / 9", label: "Widescreen (16:9)" },
          { value: "21 / 9", label: "Cinema (21:9)" },
          { value: "3 / 2", label: "Photo (3:2)" },
          { value: "4 / 3", label: "Classic (4:3)" },
          { value: "1 / 1", label: "Square" },
          { value: "4 / 5", label: "Portrait (4:5)" },
        ],
      },
      { key: "gap", label: "Gap between tiles", kind: "number", min: 0, max: 40, step: 1, unit: "%", default: 6, help: "Share of a tile's height." },
      { key: "axis", label: "Band position", kind: "number", min: 10, max: 90, step: 1, unit: "%", default: 56, help: "Vertical centre of the band, from the top." },
      { key: "curve", label: "Curve", kind: "number", min: 5, max: 85, step: 1, unit: "°", default: 80, help: "How hard the ends bend toward the viewer." },
      { key: "fade", label: "Edge fade", kind: "number", min: 0, max: 40, step: 1, unit: "%", default: 12 },
      {
        key: "contentPosition",
        label: "Content position",
        kind: "select",
        default: "spread",
        options: [
          { value: "spread", label: "Top and bottom (spread)" },
          { value: "center", label: "Centred" },
          { value: "top", label: "Top" },
          { value: "bottom", label: "Bottom" },
        ],
        help: "Where the headline and other widgets inside sit over the band.",
      },
    ],
    defaults: {
      props: { images: [] },
      style: {
        desktop: { height: "560px", width: "100%", borderRadius: "var(--radius-md, 8px)", border: "1px solid var(--color-border, rgba(0,0,0,.1))", background: "var(--color-background, #fff)" },
        mobile: { height: "480px" },
      },
    },
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
  accordion: [],
  tabs: [],
  carousel: [],
  testimonial: [
    { key: "quote", label: "Quote", accepts: "text" },
    { key: "name", label: "Name", accepts: "text" },
    { key: "avatar", label: "Photo", accepts: "image" },
  ],
  pricing: [{ key: "price", label: "Price", accepts: "price" }],
  countdown: [],
  flipbox: [],
  cta: [
    { key: "title", label: "Title", accepts: "text" },
    { key: "image", label: "Background image", accepts: "image" },
  ],
  progress: [],
  counter: [],
  form: [],
  newsletter: [],
  rating: [],
  nav: [],
  breadcrumbs: [],
  search: [],
  social: [],
  audio: [],
  embed: [],
  "tilted-grid-hero": [{ key: "images", label: "Images", accepts: "gallery" }],
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
