import type { Binding, BuilderDocument, BuilderNode, WidgetType } from "./types";
import type { WidgetCategory } from "./widgets";

/**
 * Palette shortcuts that drop a ready-made arrangement of ordinary widgets
 * (a two-column row, a boxed container). They add no new node types, so the
 * saved JSON is the same as if the designer had built them by hand.
 */
export interface Preset {
  label: string;
  category: WidgetCategory;
  icon: string;
  hint: string;
  keywords?: string;
  build(doc: BuilderDocument, create: (doc: BuilderDocument, type: WidgetType) => BuilderNode): { node: BuilderNode; extra: Record<string, BuilderNode> };
}

/** Builds a parent with children, reserving ids as it goes so none collide. */
function tree(doc: BuilderDocument, create: Parameters<Preset["build"]>[1]) {
  const scratch: BuilderDocument = { ...doc, nodes: { ...doc.nodes } };
  const extra: Record<string, BuilderNode> = {};
  const make = (type: WidgetType, patch: Partial<BuilderNode> = {}) => {
    const n = { ...create(scratch, type), ...patch };
    scratch.nodes[n.id] = n;
    return n;
  };
  const child = (type: WidgetType, patch: Partial<BuilderNode> = {}) => {
    const n = make(type, patch);
    extra[n.id] = n;
    return n;
  };
  return { make, child, extra };
}

const column = (span = "1 1 0") => ({
  name: "Column",
  style: {
    desktop: { display: "flex" as const, flexDirection: "column" as const, gap: "var(--space-sm)", flex: span, minHeight: "120px" },
    mobile: { flex: "1 1 100%" },
  },
});

function row(columns: number): Preset["build"] {
  return (doc, create) => {
    const { make, child, extra } = tree(doc, create);
    const kids = Array.from({ length: columns }, () => child("container", column()).id);
    const node = make("container", {
      name: `Row · ${columns} columns`,
      children: kids,
      style: { desktop: { display: "flex", flexDirection: "row", flexWrap: "wrap", gap: "var(--space-md)", alignItems: "stretch" }, mobile: { flexDirection: "column" } },
    });
    return { node, extra };
  };
}

/** One widget whose content comes from the site or the current post. */
function bound(type: WidgetType, target: string, binding: Binding, patch: Partial<BuilderNode> = {}): Preset["build"] {
  return (doc, create) => {
    const n = create(doc, type);
    return { node: { ...n, ...patch, props: { ...n.props, ...patch.props }, style: patch.style ?? n.style, bindings: { [target]: binding } }, extra: {} };
  };
}

/** A loop grid with a ready-made card: featured image, title, excerpt and a link. */
const postGrid: Preset["build"] = (doc, create) => {
  const { make, child, extra } = tree(doc, create);
  const image = child("image", { name: "Featured image", bindings: { image: { source: "post", key: "featured_image" } } });
  image.style = { desktop: { width: "100%", aspectRatio: "4 / 3", objectFit: "cover", borderRadius: "var(--radius-md)" } };
  const title = child("heading", { name: "Post title", tag: "h3", bindings: { text: { source: "post", key: "title" } } });
  const excerpt = child("text", { name: "Excerpt", bindings: { text: { source: "post", key: "excerpt" } } });
  const link = child("button", { name: "Read more", bindings: { "link.href": { source: "post", key: "url" } } });
  link.props = { ...link.props, link: { label: "Read more", href: "/" } };
  const card = child("container", {
    name: "Post card",
    tag: "article",
    children: [image.id, title.id, excerpt.id, link.id],
    style: { desktop: { display: "flex", flexDirection: "column", gap: "var(--space-sm)", alignItems: "flex-start" } },
  });
  const node = make("loop", { name: "Post grid", children: [card.id] });
  return { node, extra };
};

export const PRESETS: Record<string, Preset> = {
  "preset:row-2": { label: "Row · 2 columns", category: "layout", icon: "columns-2", hint: "Two side-by-side columns that stack on mobile", keywords: "columns split row", build: row(2) },
  "preset:row-3": { label: "Row · 3 columns", category: "layout", icon: "columns-3", hint: "Three columns that stack on mobile", keywords: "columns grid row", build: row(3) },
  "preset:column": {
    label: "Column",
    category: "layout",
    icon: "rectangle-vertical",
    hint: "A column for a row; set width and order per screen size in Style",
    keywords: "col cell",
    build: (doc, create) => ({ node: { ...create(doc, "container"), ...column() }, extra: {} }),
  },
  "preset:boxed": {
    label: "Boxed container",
    category: "layout",
    icon: "square",
    hint: "Centred content with a maximum width",
    keywords: "wrapper max width center",
    build: (doc, create) => ({
      node: { ...create(doc, "container"), name: "Boxed", style: { desktop: { display: "flex", flexDirection: "column", gap: "var(--space-md)", width: "100%", maxWidth: "1200px", margin: "0 auto" } } },
      extra: {},
    }),
  },
  "preset:site-logo": {
    label: "Site logo",
    category: "dynamic",
    icon: "gem",
    hint: "The logo from Settings → Branding, on every page that uses it",
    keywords: "brand logo header",
    build: bound("image", "image", { source: "site", key: "logo" }, { name: "Site logo", style: { desktop: { width: "140px", height: "auto" } } }),
  },
  "preset:site-title": {
    label: "Site title",
    category: "dynamic",
    icon: "heading",
    hint: "The site's name, kept in sync with Settings",
    keywords: "name brand header",
    build: bound("text", "text", { source: "site", key: "name" }, { name: "Site title", style: { desktop: { fontFamily: "var(--font-display)", fontSize: "1.35rem", fontWeight: "600" } } }),
  },
  "preset:post-title": {
    label: "Post title",
    category: "dynamic",
    icon: "heading",
    hint: "The current entry's title (for single templates)",
    keywords: "entry heading single template",
    build: bound("heading", "text", { source: "post", key: "title" }, { name: "Post title", tag: "h1" }),
  },
  "preset:post-content": {
    label: "Post content",
    category: "dynamic",
    icon: "pilcrow",
    hint: "The current entry's body (for single templates)",
    keywords: "entry body article single template",
    build: bound("richtext", "html", { source: "post", key: "content" }, { name: "Post content" }),
  },
  "preset:featured-image": {
    label: "Featured image",
    category: "dynamic",
    icon: "image",
    hint: "The current entry's featured image (for single templates)",
    keywords: "entry cover thumbnail single template",
    build: bound("image", "image", { source: "post", key: "featured_image" }, { name: "Featured image" }),
  },
  "preset:post-grid": {
    label: "Post grid",
    category: "dynamic",
    icon: "layout-grid",
    hint: "Cards for the latest entries of a post type: image, title, excerpt, link",
    keywords: "blog posts loop list archive cards",
    build: postGrid,
  },
};
