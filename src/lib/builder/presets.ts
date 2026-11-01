import type { BuilderDocument, BuilderNode, WidgetType } from "./types";
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
};
