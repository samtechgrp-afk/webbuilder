import { isGridProps } from "@/lib/commerce/storefront";
import type { Binding, Breakpoint, BuilderDocument, BuilderNode, LoopQuery, StyleKey, WidgetType } from "./types";
import { BREAKPOINT_ORDER } from "./types";
import { PRESETS } from "./presets";
import { settingsProblem } from "./settings";
import { BINDABLE, WIDGETS } from "./widgets";

/**
 * Pure, immutable tree operations for the designer canvas. Each returns a new
 * document (or null when the move is impossible) and copies only the nodes it
 * touches, so undo history stays cheap.
 */

const STYLE_KEYS = new Set<StyleKey>([
  "display", "flexDirection", "flexWrap", "justifyContent", "alignItems", "gap", "gridTemplateColumns",
  "gridColumn", "padding", "margin", "width", "maxWidth", "minHeight", "aspectRatio", "objectFit",
  "background", "color", "fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing",
  "textAlign", "textTransform", "border", "borderRadius", "boxShadow", "backdropFilter", "opacity",
  "order", "flex", "alignSelf", "height",
]);

export function isContainer(doc: BuilderDocument, id: string) {
  const node = doc.nodes[id];
  return !!node && WIDGETS[node.type].isContainer;
}

export function newNodeId(doc: BuilderDocument): string {
  for (;;) {
    const id = `n${Math.random().toString(36).slice(2, 10)}`;
    if (!doc.nodes[id]) return id;
  }
}

export function subtreeIds(doc: BuilderDocument, id: string): string[] {
  const out: string[] = [];
  const walk = (n: string) => {
    out.push(n);
    for (const c of doc.nodes[n]?.children ?? []) walk(c);
  };
  walk(id);
  return out;
}

export function findParent(doc: BuilderDocument, id: string): string | undefined {
  for (const node of Object.values(doc.nodes)) if (node.children?.includes(id)) return node.id;
  return undefined;
}

/** A fresh widget with designer-quality defaults that lean on the site's tokens. */
export function createWidget(doc: BuilderDocument, type: WidgetType): BuilderNode {
  const def = WIDGETS[type];
  const node: BuilderNode = {
    id: newNodeId(doc),
    type,
    props: structuredClone(def.defaults.props),
    style: structuredClone(def.defaults.style),
  };
  if (def.isContainer) node.children = [];
  return node;
}

/**
 * A widget plus any children it starts with. A loop grid arrives with a
 * ready-made card (image, title, excerpt, link) already bound to the loop
 * item, so a designer sees real entries the moment it lands.
 */
export function createWidgetTree(doc: BuilderDocument, key: WidgetType | string): { node: BuilderNode; extra: Record<string, BuilderNode> } {
  const preset = PRESETS[key];
  if (preset) return preset.build(doc, createWidget);
  const type = key as WidgetType;
  const node = createWidget(doc, type);
  if (type !== "loop") return { node, extra: {} };
  const scratch: BuilderDocument = { ...doc, nodes: { ...doc.nodes, [node.id]: node } };
  const extra: Record<string, BuilderNode> = {};
  const add = (n: BuilderNode) => {
    scratch.nodes[n.id] = n;
    extra[n.id] = n;
    return n;
  };
  const bind = (n: BuilderNode, target: string, binding: Binding) => ({ ...n, bindings: { ...n.bindings, [target]: binding } });

  const image = add(bind(createWidget(scratch, "image"), "image", { source: "post", key: "featured_image" }));
  const title = add(bind({ ...createWidget(scratch, "heading"), tag: "h3" }, "text", { source: "post", key: "title" }));
  title.style = { desktop: { fontFamily: "var(--font-display)", fontSize: "1.5rem", lineHeight: "1.2" } };
  const excerpt = add(bind(createWidget(scratch, "text"), "text", { source: "post", key: "excerpt" }));
  const button = createWidget(scratch, "button");
  button.props = { link: { label: "Read more", href: "#" } };
  add(bind(button, "link.href", { source: "post", key: "url" }));
  const card = add({
    ...createWidget(scratch, "container"),
    name: "Loop item",
    tag: "article",
    children: [image.id, title.id, excerpt.id, button.id],
    style: { desktop: { display: "flex", flexDirection: "column", gap: "var(--space-sm)", alignItems: "flex-start" } },
  });
  node.children = [card.id];
  return { node, extra };
}

function placeChild(children: string[], childId: string, index: number) {
  const next = [...children];
  next.splice(Math.max(0, Math.min(index, next.length)), 0, childId);
  return next;
}

/** Inserts a node (and any nodes it brings along) into `parentId` at `index`. */
export function insertNode(
  doc: BuilderDocument,
  node: BuilderNode,
  parentId: string,
  index: number,
  extra: Record<string, BuilderNode> = {},
): BuilderDocument | null {
  const parent = doc.nodes[parentId];
  if (!parent || !isContainer(doc, parentId) || doc.nodes[node.id]) return null;
  return {
    ...doc,
    nodes: {
      ...doc.nodes,
      ...extra,
      [node.id]: node,
      [parentId]: { ...parent, children: placeChild(parent.children ?? [], node.id, index) },
    },
  };
}

/**
 * Moves a node to `parentId` at `index` (index counted in the parent's
 * children *before* the move). Refuses the root and moves into its own subtree.
 */
export function moveNode(doc: BuilderDocument, nodeId: string, parentId: string, index: number): BuilderDocument | null {
  if (nodeId === doc.rootId || !doc.nodes[nodeId] || !isContainer(doc, parentId)) return null;
  if (subtreeIds(doc, nodeId).includes(parentId)) return null;
  const from = findParent(doc, nodeId);
  if (!from) return null;

  const nodes = { ...doc.nodes };
  const oldKids = nodes[from].children ?? [];
  const oldIndex = oldKids.indexOf(nodeId);
  nodes[from] = { ...nodes[from], children: oldKids.filter((c) => c !== nodeId) };
  const target = nodes[parentId];
  const adjusted = from === parentId && oldIndex < index ? index - 1 : index;
  if (from === parentId && adjusted === oldIndex) return doc;
  nodes[parentId] = { ...target, children: placeChild(target.children ?? [], nodeId, adjusted) };
  return { ...doc, nodes };
}

export function removeNode(doc: BuilderDocument, nodeId: string): BuilderDocument | null {
  if (nodeId === doc.rootId || !doc.nodes[nodeId]) return null;
  const parentId = findParent(doc, nodeId);
  if (!parentId) return null;
  const nodes = { ...doc.nodes };
  for (const id of subtreeIds(doc, nodeId)) delete nodes[id];
  nodes[parentId] = { ...nodes[parentId], children: (nodes[parentId].children ?? []).filter((c) => c !== nodeId) };
  return { ...doc, nodes };
}

/** Deep-copies a node and its subtree with fresh ids, placed right after the original. */
export function duplicateNode(doc: BuilderDocument, nodeId: string): { doc: BuilderDocument; id: string } | null {
  const parentId = findParent(doc, nodeId);
  if (!parentId) return null;
  const copies: Record<string, BuilderNode> = {};
  const scratch: BuilderDocument = { ...doc, nodes: { ...doc.nodes } };
  const clone = (id: string): string => {
    const src = doc.nodes[id];
    const nid = newNodeId(scratch);
    scratch.nodes[nid] = src; // reserve the id
    copies[nid] = { ...structuredClone(src), id: nid, children: src.children?.map(clone) };
    if (!src.children) delete copies[nid].children;
    return nid;
  };
  const rootCopy = clone(nodeId);
  const index = (doc.nodes[parentId].children ?? []).indexOf(nodeId) + 1;
  const { [rootCopy]: top, ...rest } = copies;
  const next = insertNode(doc, top, parentId, index, rest);
  return next ? { doc: next, id: rootCopy } : null;
}

/**
 * Structural integrity check run on every save: one root, every other node
 * has exactly one parent and is reachable, known widget types and tags, known
 * style keys and breakpoints. Returns a reason, or null when sound.
 */
export function structuralProblem(doc: BuilderDocument): string | null {
  const parents = new Map<string, string>();
  for (const node of Object.values(doc.nodes)) {
    if (!WIDGETS[node.type]) return `Unknown element type "${node.type}"`;
    const def = WIDGETS[node.type];
    if (node.tag && !def.allowedTags.includes(node.tag)) return `<${node.tag}> isn't allowed on a ${def.label}`;
    if (node.children && !def.isContainer) return `${def.label} can't contain other elements`;
    for (const c of node.children ?? []) {
      if (c === doc.rootId) return "The page root can't be nested";
      if (parents.has(c)) return "An element appears in two places";
      parents.set(c, node.id);
    }
    for (const [bp, style] of Object.entries(node.style ?? {})) {
      if (!BREAKPOINT_ORDER.includes(bp as Breakpoint)) return `Unknown breakpoint "${bp}"`;
      for (const key of Object.keys(style ?? {})) if (!STYLE_KEYS.has(key as StyleKey)) return `Unknown style "${key}"`;
    }
    const bindingIssue = bindingProblem(node);
    if (bindingIssue) return bindingIssue;
    if (node.type === "loop" && !isLoopQuery(node.props.query)) return "Loop grid query is invalid";
    const commerceIssue = commerceProblem(node);
    if (commerceIssue) return commerceIssue;
    const settingsIssue = settingsProblem(def.settings, node.props ?? {});
    if (settingsIssue) return `${def.label}: ${settingsIssue}`;
  }
  const reachable = subtreeIds(doc, doc.rootId);
  if (new Set(reachable).size !== reachable.length) return "The page contains a loop";
  if (reachable.length !== Object.keys(doc.nodes).length) return "The page has detached elements";
  for (const node of Object.values(doc.nodes)) {
    if (node.type !== "loop") continue;
    if (subtreeIds(doc, node.id).slice(1).some((id) => doc.nodes[id].type === "loop")) return "Loop grids can't be nested";
  }
  return null;
}

const BINDING_KEY_RE = /^[a-z][a-z0-9_]{0,39}$/;

function bindingProblem(node: BuilderNode): string | null {
  if (node.bindings === undefined) return null;
  if (!node.bindings || typeof node.bindings !== "object" || Array.isArray(node.bindings)) return "Bindings are malformed";
  const targets = new Set(BINDABLE[node.type].map((t) => t.key));
  for (const [target, b] of Object.entries(node.bindings)) {
    if (!targets.has(target)) return `${WIDGETS[node.type].label} can't bind "${target}"`;
    if (!b || !["post", "field", "site"].includes(b.source) || typeof b.key !== "string" || !BINDING_KEY_RE.test(b.key)) {
      return "A dynamic binding is malformed";
    }
    if (b.fallback !== undefined && (typeof b.fallback !== "string" || b.fallback.length > 200)) return "A binding fallback is too long";
  }
  return null;
}

const shortLabel = (v: unknown) => v === undefined || (typeof v === "string" && v.length <= 40);

function commerceProblem(node: BuilderNode): string | null {
  const p = node.props;
  switch (node.type) {
    case "productgrid":
      return isGridProps(p) ? null : "Product grid settings are invalid";
    case "product":
      return (p.productId === null || (typeof p.productId === "string" && p.productId.length <= 40)) && shortLabel(p.buttonLabel) ? null : "Product details settings are invalid";
    case "cart":
      return shortLabel(p.label) ? null : "Cart settings are invalid";
  }
  return null;
}

export const MAX_LOOP_ITEMS = 24;

export function isLoopQuery(q: unknown): q is LoopQuery {
  if (!q || typeof q !== "object") return false;
  const v = q as Partial<LoopQuery>;
  return (
    (v.postTypeId === null || (typeof v.postTypeId === "string" && v.postTypeId.length <= 40)) &&
    Number.isInteger(v.limit) && v.limit! >= 1 && v.limit! <= MAX_LOOP_ITEMS &&
    ["date", "title", "menu"].includes(v.orderBy as string) &&
    ["asc", "desc"].includes(v.order as string) &&
    (v.termId === undefined || v.termId === null || (typeof v.termId === "string" && v.termId.length <= 40)) &&
    (v.offset === undefined || (Number.isInteger(v.offset) && v.offset >= 0 && v.offset <= 100))
  );
}

/** The nearest loop grid above a node (exclusive), if any. */
export function enclosingLoop(doc: BuilderDocument, id: string): string | undefined {
  let current = findParent(doc, id);
  while (current) {
    if (doc.nodes[current]?.type === "loop") return current;
    current = findParent(doc, current);
  }
  return undefined;
}

/** The value a style key resolves to at `bp`, walking up the desktop-first cascade. */
export function cascadedStyle(node: BuilderNode, bp: Breakpoint, key: StyleKey): { value?: string; from?: Breakpoint } {
  const order = BREAKPOINT_ORDER.slice(0, BREAKPOINT_ORDER.indexOf(bp) + 1).reverse();
  for (const b of order) {
    const v = node.style[b]?.[key];
    if (v !== undefined && v !== "") return { value: String(v), from: b };
  }
  return {};
}
