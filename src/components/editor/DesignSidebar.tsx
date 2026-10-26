"use client";

import { useState, type DragEvent } from "react";
import { effectiveLocks, parentMap } from "@/lib/builder/policy";
import { findParent, isContainer, subtreeIds } from "@/lib/builder/tree";
import type { BuilderDocument, WidgetType } from "@/lib/builder/types";
import { WIDGETS } from "@/lib/builder/widgets";
import { useEditor } from "./store";

/** Designer-only left panel: the widget palette and the layer navigator. */
export function DesignSidebar() {
  const [tab, setTab] = useState<"add" | "layers">("add");
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-zinc-200 bg-white" aria-label="Design tools">
      <div className="flex border-b border-zinc-200 p-1" role="tablist">
        {(["add", "layers"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium ${tab === t ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"}`}
          >
            {t === "add" ? "Add" : "Layers"}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{tab === "add" ? <Palette /> : <Layers />}</div>
    </aside>
  );
}

const ICONS: Record<WidgetType, string> = {
  section: "▭",
  container: "▦",
  heading: "H",
  text: "¶",
  image: "◩",
  button: "⬭",
  price: "$",
  gallery: "▤",
  richtext: "≡",
  loop: "↻",
  langswitch: "文",
  productgrid: "▣",
  product: "◫",
  cart: "⊡",
};

/** Where a clicked palette item lands: inside the selected container, after a selected leaf, else at the end of the page. */
function clickTarget(doc: BuilderDocument, selectedId: string | null): { parentId: string; index: number } {
  if (selectedId && doc.nodes[selectedId]) {
    if (isContainer(doc, selectedId)) return { parentId: selectedId, index: doc.nodes[selectedId].children?.length ?? 0 };
    const parentId = findParent(doc, selectedId);
    if (parentId) return { parentId, index: (doc.nodes[parentId].children ?? []).indexOf(selectedId) + 1 };
  }
  return { parentId: doc.rootId, index: doc.nodes[doc.rootId]?.children?.length ?? 0 };
}

function Palette() {
  const insertWidget = useEditor((s) => s.insertWidget);
  const setDrag = useEditor((s) => s.setDrag);
  const types = Object.keys(WIDGETS) as WidgetType[];

  return (
    <div className="space-y-3 p-3">
      <p className="text-[11px] leading-relaxed text-zinc-500">Drag onto the page, or click to add inside the selected container.</p>
      <div className="grid grid-cols-2 gap-2">
        {types.map((type) => (
          <button
            key={type}
            type="button"
            draggable
            data-palette={type}
            title={WIDGETS[type].hint}
            onDragStart={(e: DragEvent) => {
              e.dataTransfer.effectAllowed = "copy";
              e.dataTransfer.setData("text/plain", type);
              setDrag({ kind: "new", type });
            }}
            onClick={() => {
              const { doc, selectedId } = useEditor.getState();
              const { parentId, index } = clickTarget(doc, selectedId);
              insertWidget(type, parentId, index);
            }}
            className="flex cursor-grab flex-col items-center gap-1 rounded-lg border border-zinc-200 px-2 py-3 text-xs text-zinc-700 hover:border-zinc-400 hover:bg-zinc-50 active:cursor-grabbing"
          >
            <span aria-hidden className="text-lg leading-none text-zinc-500">
              {ICONS[type]}
            </span>
            {WIDGETS[type].label}
          </button>
        ))}
      </div>
    </div>
  );
}

type RowDrop = { id: string; where: "before" | "after" | "inside" } | null;

function Layers() {
  const doc = useEditor((s) => s.doc);
  const selectedId = useEditor((s) => s.selectedId);
  const drag = useEditor((s) => s.drag);
  const [over, setOver] = useState<RowDrop>(null);
  const parents = parentMap(doc);

  const rows: { id: string; depth: number }[] = [];
  const walk = (id: string, depth: number) => {
    rows.push({ id, depth });
    for (const c of doc.nodes[id]?.children ?? []) walk(c, depth + 1);
  };
  if (doc.nodes[doc.rootId]) walk(doc.rootId, 0);

  const resolve = (target: RowDrop) => {
    if (!target || !drag) return null;
    const blocked = drag.kind === "move" ? subtreeIds(doc, drag.id) : [];
    if (target.where === "inside") {
      if (!isContainer(doc, target.id) || blocked.includes(target.id)) return null;
      return { parentId: target.id, index: doc.nodes[target.id].children?.length ?? 0 };
    }
    const parentId = parents.get(target.id);
    if (!parentId || blocked.includes(parentId)) return null;
    const i = (doc.nodes[parentId].children ?? []).indexOf(target.id);
    return { parentId, index: target.where === "before" ? i : i + 1 };
  };

  return (
    <ol className="py-1 text-[13px]" aria-label="Layers">
      {rows.map(({ id, depth }) => {
        const node = doc.nodes[id];
        const locks = effectiveLocks(doc, id, parents);
        const own = node.locks ?? {};
        const isRoot = id === doc.rootId;
        const mark = over?.id === id ? over.where : null;
        return (
          <li
            key={id}
            data-layer={id}
            draggable={!isRoot}
            onDragStart={(e) => {
              e.stopPropagation();
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", id);
              useEditor.getState().setDrag({ kind: "move", id });
            }}
            onDragOver={(e) => {
              if (!drag) return;
              const r = e.currentTarget.getBoundingClientRect();
              const f = (e.clientY - r.top) / r.height;
              const where: "before" | "after" | "inside" =
                isContainer(doc, id) && (isRoot || (f > 0.25 && f < 0.75)) ? "inside" : f < 0.5 ? "before" : "after";
              const target = { id, where };
              if (resolve(target)) {
                e.preventDefault();
                setOver(target);
              } else setOver(null);
            }}
            onDragLeave={() => setOver(null)}
            onDrop={(e) => {
              e.preventDefault();
              const dest = resolve(over);
              const s = useEditor.getState();
              if (dest && s.drag) {
                if (s.drag.kind === "new") s.insertWidget(s.drag.type, dest.parentId, dest.index);
                else if (s.moveNodeTo(s.drag.id, dest.parentId, dest.index)) s.select(s.drag.id);
              }
              setOver(null);
              s.setDrag(null);
            }}
            onClick={() => useEditor.getState().select(id)}
            className={`relative flex cursor-pointer items-center gap-1.5 py-1 pr-2 ${
              selectedId === id ? "bg-indigo-50 text-indigo-900" : "text-zinc-700 hover:bg-zinc-50"
            } ${mark === "inside" ? "ring-2 ring-inset ring-indigo-500" : ""}`}
            style={{ paddingLeft: 10 + depth * 14 }}
          >
            {mark === "before" && <span aria-hidden className="absolute inset-x-2 top-0 h-0.5 bg-indigo-500" />}
            {mark === "after" && <span aria-hidden className="absolute inset-x-2 bottom-0 h-0.5 bg-indigo-500" />}
            <span aria-hidden className="w-4 text-center text-xs text-zinc-400">
              {ICONS[node.type]}
            </span>
            <span className="min-w-0 flex-1 truncate">{node.name ?? WIDGETS[node.type].label}</span>
            {(own.layout || own.style || own.content) && (
              <span title={`Locked: ${Object.entries(own).filter(([, v]) => v).map(([k]) => k).join(", ")}`} className="text-[10px]">
                🔒
              </span>
            )}
            {!own.layout && !own.style && !own.content && (locks.layout || locks.style || locks.content) && (
              <span title="Inherits a lock from a parent" className="text-[10px] opacity-40">
                🔒
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
