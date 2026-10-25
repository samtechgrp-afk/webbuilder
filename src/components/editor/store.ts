"use client";

import { create } from "zustand";
import { nodeCapabilities, parentMap, type EditContext } from "@/lib/builder/policy";
import type { DynamicData, DynamicPost } from "@/lib/cms/binding";
import type { FieldType } from "@/lib/cms/fields";
import { createWidgetTree, duplicateNode, enclosingLoop, findParent, insertNode, moveNode, removeNode } from "@/lib/builder/tree";
import { hasPermission } from "@/lib/rbac";
import type { DesignTokens } from "@/lib/design/tokens";
import type { Binding, Breakpoint, BuilderDocument, LockSettings, SemanticTag, StyleKey, WidgetType } from "@/lib/builder/types";

/**
 * Live canvas state: the working document, selection, viewport and an
 * undo/redo history of whole-document snapshots (cheap with structural
 * sharing, since only touched nodes are copied).
 *
 * Every mutation re-checks the guardrail policy before applying it, so the UI
 * simply can't produce a locked edit. The server checks again on save.
 */

const HISTORY_LIMIT = 100;

export type SaveState = "idle" | "saving" | "saved" | "error";

/** What is being dragged: a new widget from the palette, or an existing node. */
export type DragItem = { kind: "new"; type: WidgetType } | { kind: "move"; id: string };

/** What the designer can bind to: post types, their custom fields, and terms for loop filters. */
export interface BindingCatalog {
  postTypes: { id: string; label: string }[];
  fields: Record<string, { key: string; label: string; type: FieldType }[]>;
  terms: { id: string; label: string; postTypeIds: string[] }[];
}

interface EditorState {
  doc: BuilderDocument;
  savedDoc: BuilderDocument;
  ctx: EditContext;
  selectedId: string | null;
  editingTextId: string | null;
  viewport: Breakpoint;
  past: BuilderDocument[];
  future: BuilderDocument[];
  version: number;
  saveState: SaveState;
  message: { tone: "info" | "error" | "success"; text: string; details?: string[] } | null;
  drag: DragItem | null;
  /** Data the canvas renders bindings and loop grids with. */
  dynamic: DynamicData | null;
  catalog: BindingCatalog;
  /** The post type the document renders entries of (a page's own type, or a single template's target). */
  contextPostTypeId: string | null;
  /**
   * Working copy of the site's global tokens. The canvas renders from it, so
   * the design-system drawer restyles every widget as you edit; it is saved
   * on its own (site-wide), separately from the page.
   */
  tokens: DesignTokens | null;
  savedTokens: DesignTokens | null;
  tokensVersion: number;

  init(doc: BuilderDocument, ctx: EditContext, version: number): void;
  initDynamic(dynamic: DynamicData | null, catalog: BindingCatalog, contextPostTypeId: string | null): void;
  setLoopItems(loopId: string, items: DynamicPost[]): void;
  initTokens(tokens: DesignTokens, version: number): void;
  /** Designer-only (`design.tokens`): live-edit the global tokens. */
  setTokens(tokens: DesignTokens): boolean;
  markTokensSaved(tokens: DesignTokens, version: number): void;
  /** Designer-only: bind a widget target to dynamic data, or unbind with null. */
  setBinding(nodeId: string, target: string, binding: Binding | null): boolean;
  /** Designer-only: a non-content prop such as a loop grid's query. */
  setDesignProp(nodeId: string, key: string, value: unknown): boolean;
  select(id: string | null): void;
  setEditingText(id: string | null): void;
  setViewport(bp: Breakpoint): void;
  setContent(nodeId: string, field: string, value: unknown): boolean;
  setStyle(nodeId: string, key: StyleKey, value: string | undefined): boolean;
  moveChild(parentId: string, childId: string, direction: -1 | 1): boolean;
  setLocks(nodeId: string, locks: LockSettings): boolean;
  /** Designer tree edits. Each returns false when the policy or the tree refuses it. */
  insertWidget(type: WidgetType, parentId: string, index: number): boolean;
  moveNodeTo(nodeId: string, parentId: string, index: number): boolean;
  removeNode(nodeId: string): boolean;
  duplicate(nodeId: string): boolean;
  setTag(nodeId: string, tag: SemanticTag | undefined): boolean;
  setName(nodeId: string, name: string): boolean;
  setDrag(item: DragItem | null): void;
  undo(): void;
  redo(): void;
  markSaved(version: number, doc?: BuilderDocument): void;
  setSaveState(state: SaveState): void;
  notify(message: EditorState["message"]): void;
}

function commit(state: EditorState, doc: BuilderDocument): Partial<EditorState> {
  return {
    doc,
    past: [...state.past, state.doc].slice(-HISTORY_LIMIT),
    future: [],
    saveState: "idle",
  };
}

function withNode(doc: BuilderDocument, nodeId: string, patch: (n: BuilderDocument["nodes"][string]) => BuilderDocument["nodes"][string]) {
  return { ...doc, nodes: { ...doc.nodes, [nodeId]: patch(doc.nodes[nodeId]) } };
}

export const useEditor = create<EditorState>((set, get) => ({
  doc: { version: 1, rootId: "", nodes: {} },
  savedDoc: { version: 1, rootId: "", nodes: {} },
  ctx: { permissions: [] },
  selectedId: null,
  editingTextId: null,
  viewport: "desktop",
  past: [],
  future: [],
  version: 0,
  saveState: "idle",
  message: null,
  drag: null,
  dynamic: null,
  catalog: { postTypes: [], fields: {}, terms: [] },
  contextPostTypeId: null,
  tokens: null,
  savedTokens: null,
  tokensVersion: 0,

  init: (doc, ctx, version) =>
    set({ doc, savedDoc: doc, ctx, version, past: [], future: [], selectedId: null, editingTextId: null, saveState: "idle" }),

  initDynamic: (dynamic, catalog, contextPostTypeId) => set({ dynamic, catalog, contextPostTypeId }),

  initTokens: (tokens, tokensVersion) => set({ tokens, savedTokens: tokens, tokensVersion }),
  setTokens: (tokens) => {
    if (!hasPermission(get().ctx.permissions, "design.tokens")) return false;
    set({ tokens });
    return true;
  },
  markTokensSaved: (tokens, tokensVersion) => set({ tokens, savedTokens: tokens, tokensVersion }),

  setLoopItems: (loopId, items) =>
    set((s) => (s.dynamic ? { dynamic: { ...s.dynamic, loops: { ...s.dynamic.loops, [loopId]: items } } } : {})),

  setBinding: (nodeId, target, binding) => {
    const s = get();
    if (!s.doc.nodes[nodeId] || !nodeCapabilities(s.doc, nodeId, s.ctx).isDesigner) return false;
    set(
      commit(
        s,
        withNode(s.doc, nodeId, (n) => {
          const bindings = { ...n.bindings };
          if (binding) bindings[target] = binding;
          else delete bindings[target];
          if (Object.keys(bindings).length) return { ...n, bindings };
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { bindings: _unused, ...rest } = n;
          return rest;
        }),
      ),
    );
    return true;
  },

  setDesignProp: (nodeId, key, value) => {
    const s = get();
    if (!s.doc.nodes[nodeId] || !nodeCapabilities(s.doc, nodeId, s.ctx).isDesigner) return false;
    set(commit(s, withNode(s.doc, nodeId, (n) => ({ ...n, props: { ...n.props, [key]: value } }))));
    return true;
  },

  select: (id) => set({ selectedId: id, editingTextId: get().editingTextId === id ? id : null }),
  setEditingText: (id) => set({ editingTextId: id }),
  setViewport: (viewport) => set({ viewport }),

  setContent: (nodeId, field, value) => {
    const s = get();
    if (!nodeCapabilities(s.doc, nodeId, s.ctx).canEditContent) return false;
    const node = s.doc.nodes[nodeId];
    if (JSON.stringify(node.props[field]) === JSON.stringify(value)) return true;
    set(commit(s, withNode(s.doc, nodeId, (n) => ({ ...n, props: { ...n.props, [field]: value } }))));
    return true;
  },

  setStyle: (nodeId, key, value) => {
    const s = get();
    const caps = nodeCapabilities(s.doc, nodeId, s.ctx);
    if (!caps.isDesigner && !caps.editableStyleKeys.includes(key)) return false;
    const bp = s.viewport;
    set(
      commit(
        s,
        withNode(s.doc, nodeId, (n) => {
          const current = { ...(n.style[bp] ?? {}) };
          if (value === undefined || value === "") delete current[key];
          else (current as Record<string, string>)[key] = value;
          return { ...n, style: { ...n.style, [bp]: current } };
        }),
      ),
    );
    return true;
  },

  moveChild: (parentId, childId, direction) => {
    const s = get();
    if (!nodeCapabilities(s.doc, parentId, s.ctx).canReorderChildren) return false;
    const kids = [...(s.doc.nodes[parentId].children ?? [])];
    const i = kids.indexOf(childId);
    const j = i + direction;
    if (i < 0 || j < 0 || j >= kids.length) return false;
    [kids[i], kids[j]] = [kids[j], kids[i]];
    set(commit(s, withNode(s.doc, parentId, (n) => ({ ...n, children: kids }))));
    return true;
  },

  setLocks: (nodeId, locks) => {
    const s = get();
    if (!nodeCapabilities(s.doc, nodeId, s.ctx).isDesigner) return false;
    set(
      commit(
        s,
        withNode(s.doc, nodeId, (n) => {
          const next: LockSettings = { ...n.locks, ...locks };
          for (const key of Object.keys(next) as (keyof LockSettings)[]) if (next[key] === undefined) delete next[key];
          return { ...n, locks: next };
        }),
      ),
    );
    return true;
  },

  insertWidget: (type, parentId, index) => {
    const s = get();
    if (!nodeCapabilities(s.doc, parentId, s.ctx).isDesigner) return false;
    if (type === "loop" && (s.doc.nodes[parentId]?.type === "loop" || enclosingLoop(s.doc, parentId))) {
      s.notify({ tone: "error", text: "Loop grids can't go inside another loop grid." });
      return false;
    }
    const { node, extra } = createWidgetTree(s.doc, type);
    if (type === "loop" && s.catalog.postTypes[0]) {
      node.props = { ...node.props, query: { ...(node.props.query as object), postTypeId: s.catalog.postTypes[0].id } };
    }
    const next = insertNode(s.doc, node, parentId, index, extra);
    if (!next) return false;
    set({ ...commit(s, next), selectedId: node.id });
    return true;
  },

  moveNodeTo: (nodeId, parentId, index) => {
    const s = get();
    const caps = nodeCapabilities(s.doc, parentId, s.ctx);
    // Clients may only reorder inside a layout-unlocked parent; designers move anywhere.
    if (!caps.isDesigner && !(caps.canReorderChildren && findParent(s.doc, nodeId) === parentId)) return false;
    const next = moveNode(s.doc, nodeId, parentId, index);
    if (!next) return false;
    if (next !== s.doc) set(commit(s, next));
    return true;
  },

  removeNode: (nodeId) => {
    const s = get();
    if (!nodeCapabilities(s.doc, nodeId, s.ctx).isDesigner) return false;
    const parent = findParent(s.doc, nodeId);
    const next = removeNode(s.doc, nodeId);
    if (!next) return false;
    set({ ...commit(s, next), selectedId: parent ?? null, editingTextId: null });
    return true;
  },

  duplicate: (nodeId) => {
    const s = get();
    if (!nodeCapabilities(s.doc, nodeId, s.ctx).isDesigner) return false;
    const result = duplicateNode(s.doc, nodeId);
    if (!result) return false;
    set({ ...commit(s, result.doc), selectedId: result.id });
    return true;
  },

  setTag: (nodeId, tag) => {
    const s = get();
    if (!nodeCapabilities(s.doc, nodeId, s.ctx).isDesigner) return false;
    set(
      commit(
        s,
        withNode(s.doc, nodeId, (n) => {
          const next = { ...n, tag };
          if (!tag) delete next.tag;
          return next;
        }),
      ),
    );
    return true;
  },

  setName: (nodeId, name) => {
    const s = get();
    if (!nodeCapabilities(s.doc, nodeId, s.ctx).isDesigner) return false;
    set(commit(s, withNode(s.doc, nodeId, (n) => ({ ...n, name: name.trim().slice(0, 60) || undefined }))));
    return true;
  },

  setDrag: (drag) => set({ drag }),

  undo: () => {
    const s = get();
    const prev = s.past.at(-1);
    if (!prev) return;
    set({ doc: prev, past: s.past.slice(0, -1), future: [s.doc, ...s.future], saveState: "idle" });
  },

  redo: () => {
    const s = get();
    const next = s.future[0];
    if (!next) return;
    set({ doc: next, past: [...s.past, s.doc], future: s.future.slice(1), saveState: "idle" });
  },

  markSaved: (version, doc) => set((s) => ({ version, savedDoc: doc ?? s.doc, ...(doc ? { doc, past: [], future: [] } : {}), saveState: "saved" })),
  setSaveState: (saveState) => set({ saveState }),
  notify: (message) => set({ message }),
}));

export const selectIsDirty = (s: EditorState) => s.doc !== s.savedDoc;

/** Parent of the selected node, memoised per document. */
let parentsCache: { doc: BuilderDocument | null; map: Map<string, string> } = { doc: null, map: new Map() };
export function parentOf(doc: BuilderDocument, id: string) {
  if (parentsCache.doc !== doc) parentsCache = { doc, map: parentMap(doc) };
  return parentsCache.map.get(id);
}

export const selectTokensDirty = (s: EditorState) => s.tokens !== s.savedTokens && JSON.stringify(s.tokens) !== JSON.stringify(s.savedTokens);
