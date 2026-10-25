import { hasPermission } from "@/lib/rbac";
import type { Breakpoint, BuilderDocument, LockSettings, StyleKey } from "./types";
import { BREAKPOINT_ORDER } from "./types";
import { CLIENT_LAYOUT_KEYS, CLIENT_STYLE_KEYS, LAYOUT_STYLE_KEYS, WIDGETS, contentField } from "./widgets";

/**
 * The guardrail engine. It answers one question, "may this user make this
 * change to this node?", and it is used in two places:
 *
 *  1. In the browser, to decide which handles and fields the editor shows.
 *  2. On the server, on every save, against the *stored* document. The
 *     browser is never trusted; a hand-crafted request gets the same answer.
 */

export interface EditContext {
  permissions: readonly string[];
}

export type Change =
  | { kind: "content"; nodeId: string; field: string }
  | { kind: "style"; nodeId: string; breakpoint: Breakpoint; key: StyleKey }
  | { kind: "reorder"; nodeId: string }
  | { kind: "structure"; nodeId: string; detail: string }
  | { kind: "design"; nodeId: string; detail: string };

export interface Violation {
  nodeId: string;
  message: string;
}

export interface NodeCapabilities {
  locks: Required<LockSettings>;
  canEditContent: boolean;
  editableStyleKeys: StyleKey[];
  /** May reorder this node's children. */
  canReorderChildren: boolean;
  /** Full designer control (structure, styles, locks). */
  isDesigner: boolean;
}

export function isDesigner(ctx: EditContext) {
  return hasPermission(ctx.permissions, "design.layout");
}

export function parentMap(doc: BuilderDocument): Map<string, string> {
  const parents = new Map<string, string>();
  for (const node of Object.values(doc.nodes)) {
    for (const child of node.children ?? []) parents.set(child, node.id);
  }
  return parents;
}

/**
 * Resolves each lock from the nearest node (self, then ancestors) that sets
 * it explicitly. `true` locks a subtree, `false` re-opens it inside a locked
 * parent, unset inherits. Nothing set anywhere means unlocked.
 */
export function effectiveLocks(
  doc: BuilderDocument,
  nodeId: string,
  parents: Map<string, string> = parentMap(doc),
): Required<LockSettings> {
  const result: LockSettings = {};
  let current: string | undefined = nodeId;
  while (current) {
    const locks = doc.nodes[current]?.locks;
    for (const key of ["layout", "style", "content"] as const) {
      if (result[key] === undefined && typeof locks?.[key] === "boolean") result[key] = locks[key];
    }
    current = parents.get(current);
  }
  return { layout: !!result.layout, style: !!result.style, content: !!result.content };
}

export function nodeCapabilities(
  doc: BuilderDocument,
  nodeId: string,
  ctx: EditContext,
  parents: Map<string, string> = parentMap(doc),
): NodeCapabilities {
  const node = doc.nodes[nodeId];
  const locks = effectiveLocks(doc, nodeId, parents);
  if (isDesigner(ctx)) {
    return {
      locks,
      canEditContent: !!node && WIDGETS[node.type].contentFields.length > 0,
      editableStyleKeys: [],
      canReorderChildren: true,
      isDesigner: true,
    };
  }
  const canContent = hasPermission(ctx.permissions, "content.edit");
  const editableStyleKeys: StyleKey[] = [];
  if (canContent && node) {
    if (!locks.style) editableStyleKeys.push(...CLIENT_STYLE_KEYS);
    if (!locks.layout && WIDGETS[node.type].isContainer) editableStyleKeys.push(...CLIENT_LAYOUT_KEYS);
  }
  return {
    locks,
    canEditContent: canContent && !locks.content && !!node && WIDGETS[node.type].contentFields.length > 0,
    editableStyleKeys,
    canReorderChildren: canContent && !locks.layout && !!node && WIDGETS[node.type].isContainer,
    isDesigner: false,
  };
}

function sameJson(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Every difference between two documents, classified by what kind of edit it is. */
export function diffDocuments(prev: BuilderDocument, next: BuilderDocument): Change[] {
  const changes: Change[] = [];
  if (prev.rootId !== next.rootId) changes.push({ kind: "structure", nodeId: prev.rootId, detail: "root replaced" });

  for (const id of Object.keys(next.nodes)) {
    if (!prev.nodes[id]) changes.push({ kind: "structure", nodeId: id, detail: "node added" });
  }

  for (const [id, before] of Object.entries(prev.nodes)) {
    const after = next.nodes[id];
    if (!after) {
      changes.push({ kind: "structure", nodeId: id, detail: "node removed" });
      continue;
    }
    if (after.id !== before.id || after.type !== before.type) {
      changes.push({ kind: "structure", nodeId: id, detail: "type changed" });
      continue;
    }
    if ((after.tag ?? null) !== (before.tag ?? null)) changes.push({ kind: "design", nodeId: id, detail: "semantic tag" });
    if ((after.name ?? null) !== (before.name ?? null)) changes.push({ kind: "design", nodeId: id, detail: "name" });
    if (!sameJson(after.locks ?? {}, before.locks ?? {})) changes.push({ kind: "design", nodeId: id, detail: "locks" });

    const kidsBefore = before.children ?? [];
    const kidsAfter = after.children ?? [];
    if (!sameJson(kidsBefore, kidsAfter)) {
      const sameSet =
        kidsBefore.length === kidsAfter.length && [...kidsBefore].sort().join() === [...kidsAfter].sort().join();
      changes.push(sameSet ? { kind: "reorder", nodeId: id } : { kind: "structure", nodeId: id, detail: "children changed" });
    }

    const propKeys = new Set([...Object.keys(before.props ?? {}), ...Object.keys(after.props ?? {})]);
    for (const key of propKeys) {
      if (sameJson(before.props?.[key], after.props?.[key])) continue;
      if (contentField(before.type, key)) changes.push({ kind: "content", nodeId: id, field: key });
      else changes.push({ kind: "design", nodeId: id, detail: `prop ${key}` });
    }

    for (const bp of BREAKPOINT_ORDER) {
      const sb = before.style?.[bp] ?? {};
      const sa = after.style?.[bp] ?? {};
      const keys = new Set([...Object.keys(sb), ...Object.keys(sa)] as StyleKey[]);
      for (const key of keys) {
        if (sb[key] !== sa[key]) changes.push({ kind: "style", nodeId: id, breakpoint: bp, key });
      }
    }
  }
  return changes;
}

/** Checks changes against the locks and permissions of the document *before* the edit. */
export function authorizeChanges(prev: BuilderDocument, changes: Change[], ctx: EditContext): Violation[] {
  const parents = parentMap(prev);
  const designer = isDesigner(ctx);
  const violations: Violation[] = [];

  for (const change of changes) {
    if (designer) {
      if (change.kind === "content" && !hasPermission(ctx.permissions, "content.edit")) {
        violations.push({ nodeId: change.nodeId, message: "Missing content.edit permission" });
      }
      continue;
    }
    const caps = nodeCapabilities(prev, change.nodeId, ctx, parents);
    const label = prev.nodes[change.nodeId]?.name ?? change.nodeId;
    switch (change.kind) {
      case "content":
        if (!caps.canEditContent) violations.push({ nodeId: change.nodeId, message: `"${label}" content is locked` });
        break;
      case "style":
        if (!caps.editableStyleKeys.includes(change.key)) {
          const what = LAYOUT_STYLE_KEYS.has(change.key) ? "layout" : "style";
          violations.push({ nodeId: change.nodeId, message: `"${label}" ${what} is locked (${change.key})` });
        }
        break;
      case "reorder":
        if (!caps.canReorderChildren) violations.push({ nodeId: change.nodeId, message: `"${label}" layout is locked` });
        break;
      case "structure":
      case "design":
        violations.push({ nodeId: change.nodeId, message: `Only designers can change ${change.detail}` });
        break;
    }
  }
  return violations;
}
