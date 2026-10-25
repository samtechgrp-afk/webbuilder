"use client";

import { findParent, isContainer, subtreeIds } from "@/lib/builder/tree";
import type { BuilderDocument } from "@/lib/builder/types";
import type { DragItem } from "./store";

/**
 * Drop-position maths for the canvas. Reads the live layout (rects and
 * computed flex/grid direction) so the insertion line follows the real flow:
 * a vertical stack gets a horizontal line, a row or grid gets a vertical one.
 */

export interface DropTarget {
  parentId: string;
  index: number;
  /** Indicator geometry relative to the canvas frame. */
  indicator: { x: number; y: number; w: number; h: number; kind: "line" | "box" };
}

type Axis = "row" | "column";

function axisOf(el: Element | null): Axis {
  if (!el) return "column";
  const cs = getComputedStyle(el);
  if (cs.display.includes("grid")) return "row";
  if (cs.display.includes("flex") && cs.flexDirection.startsWith("row")) return "row";
  return "column";
}

const childEls = (el: Element) => Array.from(el.querySelectorAll(":scope > [data-node-id]")) as HTMLElement[];

function relative(r: DOMRect, frame: DOMRect) {
  return { x: r.left - frame.left, y: r.top - frame.top, w: r.width, h: r.height };
}

function lineAt(r: DOMRect, frame: DOMRect, axis: Axis, edge: "start" | "end") {
  const b = relative(r, frame);
  return axis === "column"
    ? { x: b.x, y: (edge === "start" ? b.y : b.y + b.h) - 2, w: b.w, h: 4, kind: "line" as const }
    : { x: (edge === "start" ? b.x : b.x + b.w) - 2, y: b.y, w: 4, h: b.h, kind: "line" as const };
}

function insideTarget(doc: BuilderDocument, el: HTMLElement, id: string, x: number, y: number, frame: DOMRect): DropTarget {
  const kids = childEls(el);
  const axis = axisOf(el);
  if (!kids.length) {
    return { parentId: id, index: 0, indicator: { ...relative(el.getBoundingClientRect(), frame), kind: "box" } };
  }
  let index = kids.length;
  for (let i = 0; i < kids.length; i++) {
    const r = kids[i].getBoundingClientRect();
    const before = axis === "column" ? y < r.top + r.height / 2 : y < r.top || (y <= r.bottom && x < r.left + r.width / 2);
    if (before) {
      index = i;
      break;
    }
  }
  const indicator =
    index < kids.length
      ? lineAt(kids[index].getBoundingClientRect(), frame, axis, "start")
      : lineAt(kids[kids.length - 1].getBoundingClientRect(), frame, axis, "end");
  return { parentId: id, index, indicator };
}

export function computeDrop(
  doc: BuilderDocument,
  drag: DragItem,
  target: EventTarget | null,
  x: number,
  y: number,
  frame: DOMRect,
): DropTarget | null {
  const el = (target as Element | null)?.closest?.("[data-node-id]") as HTMLElement | null;
  if (!el) return null;
  const id = el.dataset.nodeId!;
  const blocked = drag.kind === "move" ? new Set(subtreeIds(doc, drag.id)) : new Set<string>();
  if (blocked.has(id)) return null;

  const parentEl = el.parentElement?.closest("[data-node-id]") ?? null;
  const parentAxis = axisOf(parentEl);
  const r = el.getBoundingClientRect();

  if (isContainer(doc, id)) {
    // Near the edge along the parent's flow → drop beside the container; otherwise inside it.
    const size = parentAxis === "column" ? r.height : r.width;
    const pos = parentAxis === "column" ? y - r.top : x - r.left;
    const band = Math.min(14, size * 0.2);
    const nearEdge = id !== doc.rootId && (pos < band || pos > size - band);
    if (!nearEdge) return insideTarget(doc, el, id, x, y, frame);
  }

  const parentId = findParent(doc, id);
  if (!parentId || blocked.has(parentId)) return null;
  const siblings = doc.nodes[parentId].children ?? [];
  const before = parentAxis === "column" ? y < r.top + r.height / 2 : x < r.left + r.width / 2;
  return {
    parentId,
    index: siblings.indexOf(id) + (before ? 0 : 1),
    indicator: lineAt(r, frame, parentAxis, before ? "start" : "end"),
  };
}
