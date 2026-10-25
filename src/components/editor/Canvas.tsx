"use client";

import { useEffect, useMemo, useRef, type KeyboardEvent, type MouseEvent } from "react";
import { nodeCapabilities, parentMap } from "@/lib/builder/policy";
import { SiteDocument, type RenderHooks } from "@/lib/builder/render";
import type { DesignTokens } from "@/lib/builder/styles";
import { BREAKPOINTS } from "@/lib/builder/types";
import { WIDGETS } from "@/lib/builder/widgets";
import { useEditor } from "./store";

/**
 * The live preview with the Client Mode overlay. It renders the exact same
 * component tree as the public site; the hooks only add selection outlines,
 * lock badges and inline text editing on top.
 */
export function Canvas({ tokens }: { tokens: DesignTokens }) {
  const doc = useEditor((s) => s.doc);
  const ctx = useEditor((s) => s.ctx);
  const selectedId = useEditor((s) => s.selectedId);
  const editingTextId = useEditor((s) => s.editingTextId);
  const viewport = useEditor((s) => s.viewport);
  const select = useEditor((s) => s.select);
  const setEditingText = useEditor((s) => s.setEditingText);

  const hooks = useMemo<RenderHooks>(() => {
    const parents = parentMap(doc);
    return {
      nodeProps: (node) => {
        const caps = nodeCapabilities(doc, node.id, ctx, parents);
        const isText = node.type === "heading" || node.type === "text";
        return {
          "data-editor-node": "",
          "data-node-id": node.id,
          "data-label": node.name ?? WIDGETS[node.type].label,
          "data-selected": selectedId === node.id ? "true" : undefined,
          "data-editable": caps.canEditContent ? "true" : undefined,
          "data-lock": caps.locks.layout && WIDGETS[node.type].isContainer && node.locks?.layout ? "layout" : undefined,
          "data-content-lock": caps.locks.content && WIDGETS[node.type].contentFields.length ? "true" : undefined,
          onClick: (e: MouseEvent) => {
            if (editingTextId === node.id) return; // let the caret move
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
      text: (node, field, value) => <InlineText key={`${node.id}:${editingTextId === node.id}`} nodeId={node.id} field={field} value={value} multiline={node.type === "text"} />,
    };
  }, [doc, ctx, selectedId, editingTextId, select, setEditingText]);

  const width = BREAKPOINTS[viewport].previewWidth;

  return (
    <div className="flex-1 overflow-auto bg-zinc-100 p-6" onClick={() => select(null)}>
      <div
        className="editor-canvas mx-auto min-h-full overflow-hidden rounded-lg bg-white shadow-[0_1px_3px_rgba(0,0,0,.08),0_20px_50px_-20px_rgba(0,0,0,.25)] transition-[max-width] duration-300"
        style={{ maxWidth: width }}
      >
        <SiteDocument doc={doc} tokens={tokens} hooks={hooks} />
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
