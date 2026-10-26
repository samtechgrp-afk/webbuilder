"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent } from "react";
import { CLONE_SEP } from "@/lib/cms/binding";
import { isBoundField, nodeCapabilities, parentMap } from "@/lib/builder/policy";
import { SiteDocument, type LanguageLink, type RenderHooks } from "@/lib/builder/render";
import type { DesignTokens } from "@/lib/builder/styles";
import { BREAKPOINTS } from "@/lib/builder/types";
import { WIDGETS } from "@/lib/builder/widgets";
import { computeDrop, type DropTarget } from "./dnd";
import { useEditor } from "./store";

/**
 * The live preview with the editing overlay. It renders the exact same
 * component tree as the public site; the hooks only add selection outlines,
 * lock badges, inline text editing and, for designers, drag and drop.
 */
export function Canvas({ tokens, languages }: { tokens: DesignTokens; languages?: LanguageLink[] }) {
  const doc = useEditor((s) => s.doc);
  const ctx = useEditor((s) => s.ctx);
  const selectedId = useEditor((s) => s.selectedId);
  const editingTextId = useEditor((s) => s.editingTextId);
  const viewport = useEditor((s) => s.viewport);
  const select = useEditor((s) => s.select);
  const setEditingText = useEditor((s) => s.setEditingText);
  const drag = useEditor((s) => s.drag);
  const dynamic = useEditor((s) => s.dynamic);
  const frameRef = useRef<HTMLDivElement>(null);
  const [drop, setDrop] = useState<DropTarget | null>(null);

  const hooks = useMemo<RenderHooks>(() => {
    const parents = parentMap(doc);
    return {
      nodeProps: (node) => {
        // Loop grid copies preview real entries but aren't editable; the first item is the template.
        if (node.id.includes(CLONE_SEP)) return { "data-loop-clone": "", inert: true };
        const caps = nodeCapabilities(doc, node.id, ctx, parents);
        const bound = !!node.bindings && Object.keys(node.bindings).length > 0;
        const isText = (node.type === "heading" || node.type === "text") && !isBoundField(doc, node.id, "text");
        const draggable = caps.isDesigner && node.id !== doc.rootId && editingTextId !== node.id;
        return {
          draggable: draggable || undefined,
          onDragStart: draggable
            ? (e: DragEvent) => {
                e.stopPropagation();
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", node.id);
                useEditor.getState().setDrag({ kind: "move", id: node.id });
              }
            : undefined,
          "data-editor-node": "",
          "data-node-id": node.id,
          "data-label": node.name ?? WIDGETS[node.type].label,
          "data-selected": selectedId === node.id ? "true" : undefined,
          "data-editable": caps.canEditContent && !(bound && WIDGETS[node.type].contentFields.every((f) => isBoundField(doc, node.id, f.key))) ? "true" : undefined,
          "data-bound": bound ? "true" : undefined,
          "data-lock": caps.locks.layout && WIDGETS[node.type].isContainer && node.locks?.layout ? "layout" : undefined,
          "data-content-lock": caps.locks.content && WIDGETS[node.type].contentFields.length ? "true" : undefined,
          onClick: (e: MouseEvent) => {
            if (editingTextId === node.id) {
              e.stopPropagation(); // let the caret move, and keep the parent from grabbing selection
              return;
            }
            e.preventDefault();
            e.stopPropagation();
            if (selectedId === node.id && isText && caps.canEditContent) setEditingText(node.id);
            else select(node.id);
          },
          onDoubleClick: (e: MouseEvent) => {
            if (!isText || !caps.canEditContent) return;
            e.stopPropagation();
            select(node.id);
            setEditingText(node.id);
          },
        };
      },
      text: (node, field, value) =>
        node.id.includes(CLONE_SEP) || isBoundField(doc, node.id, field) ? (
          value
        ) : (
          <InlineText key={`${node.id}:${editingTextId === node.id}`} nodeId={node.id} field={field} value={value} multiline={node.type === "text"} />
        ),
    };
  }, [doc, ctx, selectedId, editingTextId, select, setEditingText]);

  const width = BREAKPOINTS[viewport].previewWidth;

  // A drag that ends anywhere (dropped, cancelled, left the window) clears the indicator.
  useEffect(() => {
    const end = () => {
      setDrop(null);
      useEditor.getState().setDrag(null);
    };
    window.addEventListener("dragend", end);
    window.addEventListener("drop", end);
    return () => {
      window.removeEventListener("dragend", end);
      window.removeEventListener("drop", end);
    };
  }, []);

  const onDragOver = (e: DragEvent) => {
    if (!drag || !frameRef.current) return;
    const target = computeDrop(doc, drag, e.target, e.clientX, e.clientY, frameRef.current.getBoundingClientRect());
    setDrop(target);
    if (target) {
      e.preventDefault();
      e.dataTransfer.dropEffect = drag.kind === "new" ? "copy" : "move";
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    const s = useEditor.getState();
    if (drop && s.drag) {
      if (s.drag.kind === "new") s.insertWidget(s.drag.type, drop.parentId, drop.index);
      else if (s.moveNodeTo(s.drag.id, drop.parentId, drop.index)) s.select(s.drag.id);
    }
    setDrop(null);
    s.setDrag(null);
  };

  return (
    <div className="flex-1 overflow-auto bg-zinc-100 p-6" onClick={() => select(null)}>
      <div
        ref={frameRef}
        data-dragging={drag ? "true" : undefined}
        className="editor-canvas relative mx-auto min-h-full overflow-hidden rounded-lg bg-white shadow-[0_1px_3px_rgba(0,0,0,.08),0_20px_50px_-20px_rgba(0,0,0,.25)] transition-[max-width] duration-300"
        style={{ maxWidth: width }}
        onDragOver={onDragOver}
        onDragLeave={(e) => {
          if (!frameRef.current?.contains(e.relatedTarget as Node)) setDrop(null);
        }}
        onDrop={onDrop}
      >
        <SiteDocument doc={doc} tokens={tokens} hooks={hooks} data={dynamic ?? undefined} editor languages={languages} />
        {drop && (
          <div
            aria-hidden
            data-drop-indicator={drop.indicator.kind}
            className={`pointer-events-none absolute z-40 ${
              drop.indicator.kind === "line" ? "rounded-full bg-indigo-500 shadow-[0_0_0_2px_rgba(255,255,255,.9)]" : "rounded-md border-2 border-dashed border-indigo-500 bg-indigo-500/10"
            }`}
            style={{ left: drop.indicator.x, top: drop.indicator.y, width: drop.indicator.w, height: drop.indicator.h }}
          />
        )}
      </div>
    </div>
  );
}

function InlineText({ nodeId, field, value, multiline }: { nodeId: string; field: string; value: string; multiline: boolean }) {
  const editing = useEditor((s) => s.editingTextId === nodeId);
  const setContent = useEditor((s) => s.setContent);
  const setEditingText = useEditor((s) => s.setEditingText);
  const ref = useRef<HTMLSpanElement>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!editing || !el) return;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, [editing]);

  if (!editing) return <>{value}</>;

  const onKeyDown = (e: KeyboardEvent<HTMLSpanElement>) => {
    if (e.key === "Escape") {
      cancelled.current = true;
      e.currentTarget.blur();
    } else if (e.key === "Enter" && (!multiline || e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      e.currentTarget.blur();
    }
  };

  return (
    <span
      ref={ref}
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      spellCheck
      className="editor-inline-text"
      onKeyDown={onKeyDown}
      onBlur={(e) => {
        if (!cancelled.current) setContent(nodeId, field, e.currentTarget.innerText.replace(/\n{3,}/g, "\n\n").trimEnd());
        setEditingText(null);
      }}
    >
      {value}
    </span>
  );
}
