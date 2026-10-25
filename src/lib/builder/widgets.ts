import type { SemanticTag, StyleKey, WidgetType } from "./types";

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
}

export const WIDGETS: Record<WidgetType, WidgetDefinition> = {
  section: {
    label: "Section",
    isContainer: true,
    defaultTag: "section",
    allowedTags: ["section", "header", "main", "footer", "article", "aside", "nav"],
    contentFields: [],
  },
  container: {
    label: "Container",
    isContainer: true,
    defaultTag: "div",
    allowedTags: ["div", "main", "article", "aside", "nav"],
    contentFields: [],
  },
  heading: {
    label: "Heading",
    isContainer: false,
    defaultTag: "h2",
    allowedTags: ["h1", "h2", "h3", "h4"],
    contentFields: [{ key: "text", label: "Heading", kind: "text", maxLength: 200 }],
  },
  text: {
    label: "Text",
    isContainer: false,
    defaultTag: "p",
    allowedTags: ["p", "span", "div"],
    contentFields: [{ key: "text", label: "Text", kind: "multiline", maxLength: 4000 }],
  },
  image: {
    label: "Image",
    isContainer: false,
    defaultTag: "div",
    allowedTags: ["div"],
    contentFields: [{ key: "image", label: "Image", kind: "image" }],
  },
  button: {
    label: "Button",
    isContainer: false,
    defaultTag: "span",
    allowedTags: ["span"],
    contentFields: [{ key: "link", label: "Button", kind: "link", maxLength: 80 }],
  },
  price: {
    label: "Price",
    isContainer: false,
    defaultTag: "p",
    allowedTags: ["p", "span"],
    contentFields: [{ key: "price", label: "Price", kind: "price" }],
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
