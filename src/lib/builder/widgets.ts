import type { ResponsiveStyle, SemanticTag, StyleKey, WidgetType } from "./types";

/**
 * What a client is allowed to edit inside each widget. The editor UI and the
 * server-side guard both read this registry, so they can never disagree.
 */
export type ContentFieldKind = "text" | "multiline" | "image" | "link" | "price";

export interface ContentField {
  key: string;
  label: string;
  kind: ContentFieldKind;
  maxLength?: number;
}

export interface WidgetDefinition {
  label: string;
  isContainer: boolean;
  defaultTag: SemanticTag;
  allowedTags: SemanticTag[];
  contentFields: ContentField[];
  /** One-line hint shown in the designer's widget palette. */
  hint: string;
  /** What a freshly dropped widget looks like. Values lean on design tokens. */
  defaults: { props: Record<string, unknown>; style: ResponsiveStyle };
}

export const WIDGETS: Record<WidgetType, WidgetDefinition> = {
  section: {
    label: "Section",
    isContainer: true,
    defaultTag: "section",
    allowedTags: ["section", "header", "main", "footer", "article", "aside", "nav"],
    contentFields: [],
    hint: "Full-width band with its own padding",
    defaults: { props: {}, style: { desktop: { display: "flex", flexDirection: "column", gap: "var(--space-md)", padding: "var(--space-xl) 2rem" }, mobile: { padding: "4rem 1.25rem" } } },
  },
  container: {
    label: "Container",
    isContainer: true,
    defaultTag: "div",
    allowedTags: ["div", "main", "article", "aside", "nav"],
    contentFields: [],
    hint: "Flexbox or Grid box for arranging items",
    defaults: { props: {}, style: { desktop: { display: "flex", flexDirection: "column", gap: "var(--space-md)" } } },
  },
  heading: {
    label: "Heading",
    isContainer: false,
    defaultTag: "h2",
    allowedTags: ["h1", "h2", "h3", "h4"],
    contentFields: [{ key: "text", label: "Heading", kind: "text", maxLength: 200 }],
    hint: "Title, h1 to h4",
    defaults: { props: { text: "A considered headline" }, style: { desktop: { fontFamily: "var(--font-display)", fontSize: "var(--text-h2)", lineHeight: "1.1" } } },
  },
  text: {
    label: "Text",
    isContainer: false,
    defaultTag: "p",
    allowedTags: ["p", "span", "div"],
    contentFields: [{ key: "text", label: "Text", kind: "multiline", maxLength: 4000 }],
    hint: "Paragraph of body copy",
    defaults: { props: { text: "Write a short, clear paragraph here." }, style: { desktop: { lineHeight: "1.6", color: "var(--color-muted)" } } },
  },
  image: {
    label: "Image",
    isContainer: false,
    defaultTag: "div",
    allowedTags: ["div"],
    contentFields: [{ key: "image", label: "Image", kind: "image" }],
    hint: "Picture from the media library",
    defaults: { props: { image: { assetId: null, src: "", alt: "" } }, style: { desktop: { aspectRatio: "4 / 3", borderRadius: "var(--radius-md)", objectFit: "cover" } } },
  },
  button: {
    label: "Button",
    isContainer: false,
    defaultTag: "span",
    allowedTags: ["span"],
    contentFields: [{ key: "link", label: "Button", kind: "link", maxLength: 80 }],
    hint: "Link styled as a button",
    defaults: { props: { link: { label: "Learn more", href: "/contact" } }, style: { desktop: { padding: ".9rem 1.5rem", borderRadius: "var(--radius-pill)", background: "var(--color-deep)", color: "var(--color-inverse)", fontWeight: "500" } } },
  },
  price: {
    label: "Price",
    isContainer: false,
    defaultTag: "p",
    allowedTags: ["p", "span"],
    contentFields: [{ key: "price", label: "Price", kind: "price" }],
    hint: "Formatted price clients can update",
    defaults: { props: { price: { amount: 100, currency: "USD", compareAt: null } }, style: { desktop: { fontFamily: "var(--font-display)", fontSize: "2rem" } } },
  },
};

export function contentField(type: WidgetType, key: string): ContentField | undefined {
  return WIDGETS[type].contentFields.find((f) => f.key === key);
}

/** Spacing and structure. Guarded by the `layout` lock. */
export const LAYOUT_STYLE_KEYS: ReadonlySet<StyleKey> = new Set<StyleKey>([
  "display", "flexDirection", "flexWrap", "justifyContent", "alignItems", "gap",
  "gridTemplateColumns", "gridColumn", "padding", "margin", "width", "maxWidth",
  "minHeight", "aspectRatio", "objectFit",
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
