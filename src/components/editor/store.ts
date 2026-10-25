"use client";

import { create } from "zustand";
import { nodeCapabilities, parentMap, type EditContext } from "@/lib/builder/policy";
import { createWidget, duplicateNode, findParent, insertNode, moveNode, removeNode } from "@/lib/builder/tree";
import type { Breakpoint, BuilderDocument, LockSettings, SemanticTag, StyleKey, WidgetType } from "@/lib/builder/types";

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

  init(doc: BuilderDocument, ctx: EditContext, version: number): void;
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

  init: (doc, ctx, version) =>
    set({ doc, savedDoc: doc, ctx, version, past: [], future: [], selectedId: null, editingTextId: null, saveState: "idle" }),

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
    const node = createWidget(s.doc, type);
    const next = insertNode(s.doc, node, parentId, index);
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
