"use client";

import { useState, type ReactNode } from "react";
import { isSafeHref } from "@/lib/builder/content";
import { POST_SOURCES, SITE_SOURCES } from "@/lib/cms/binding";
import { FIELD_TYPE_INFO, type BindKind } from "@/lib/cms/fields";
import { isBoundField, isDesigner, nodeCapabilities } from "@/lib/builder/policy";
import { enclosingLoop, MAX_LOOP_ITEMS } from "@/lib/builder/tree";
import { contrastRatio, resolveColor, type DesignTokens } from "@/lib/builder/styles";
import type { Binding, BuilderDocument, ImageValue, LinkValue, LoopQuery, PriceValue, StyleKey, VideoValue } from "@/lib/builder/types";
import { ICON_NAMES, SiteIcon, iconLabel } from "@/lib/builder/icons";
import { parseVideoUrl } from "@/lib/builder/media";
import { settingValue, settingVisible, type MediaRef, type SettingDef } from "@/lib/builder/settings";
import { RichTextEditor } from "@/components/cms/RichTextEditor";
import { MAX_GRID_PRODUCTS, type CartProps, type ProductDetailsProps, type ProductGridProps } from "@/lib/commerce/types";
import { BINDABLE, WIDGETS, type BindTarget, type ContentField, type LanguageSwitcherProps } from "@/lib/builder/widgets";
import { DesignPanel } from "./DesignPanel";
import { MediaPicker, type PickerAsset } from "./MediaPicker";
import { parentOf, useEditor } from "./store";

interface InspectorProps {
  siteId: string;
  tokens: DesignTokens;
  assets: PickerAsset[];
  canUpload: boolean;
  onAssetUploaded: (asset: PickerAsset) => void;
}

export function Inspector(props: InspectorProps) {
  const doc = useEditor((s) => s.doc);
  const ctx = useEditor((s) => s.ctx);
  const selectedId = useEditor((s) => s.selectedId);
  const node = selectedId ? doc.nodes[selectedId] : null;

  if (!node) return isDesigner(ctx) ? <DesignerOverview /> : <Overview />;

  const caps = nodeCapabilities(doc, node.id, ctx);
  const def = WIDGETS[node.type];
  const parentId = parentOf(doc, node.id);
  const parentCaps = parentId ? nodeCapabilities(doc, parentId, ctx) : null;

  if (caps.isDesigner) return <DesignerInspector key={node.id} nodeId={node.id} {...props} />;

  return (
    <div className="space-y-5 p-4">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">{def.label}</p>
        <h2 className="text-sm font-semibold text-zinc-900">{node.name ?? def.label}</h2>
      </div>

      <LockNotice locks={caps.locks} isDesigner={caps.isDesigner} hasContent={def.contentFields.length > 0} />

      {def.contentFields
        .filter((field) => caps.canEditContent || isBoundField(doc, node.id, field.key))
        .map((field) => (
          <Group key={field.key} title={field.label}>
            {isBoundField(doc, node.id, field.key) ? (
              <p className="rounded-md bg-violet-50 px-3 py-2 text-xs leading-relaxed text-violet-900" data-bound-note="">
                <span className="font-semibold">Dynamic content.</span> This shows {describeBindings(node.bindings ?? {}, field.key)}. Change it in the entry it comes from.
              </p>
            ) : (
              <ContentEditor nodeId={node.id} field={field} value={node.props[field.key]} {...props} />
            )}
          </Group>
        ))}

      {caps.editableStyleKeys.length > 0 && (
        <Group title="Style">
          <StyleEditor nodeId={node.id} keys={caps.editableStyleKeys} tokens={props.tokens} />
        </Group>
      )}

      {parentId && parentCaps?.canReorderChildren && (
        <Group title="Order">
          <ReorderButtons parentId={parentId} childId={node.id} />
        </Group>
      )}

      {caps.isDesigner && (
        <Group title="Client guardrails">
          <LockToggles nodeId={node.id} />
        </Group>
      )}
    </div>
  );
}

function DesignerInspector({ nodeId, ...props }: { nodeId: string } & InspectorProps) {
  const node = useEditor((s) => s.doc.nodes[nodeId]);
  const def = WIDGETS[node.type];
  const settingsFirst = SETTINGS_WIDGETS.has(node.type);
  const dynamicTab = settingsFirst || BINDABLE[node.type].length > 0;
  const [tab, setTab] = useState<"style" | "content" | "settings" | "dynamic" | "guardrails">(settingsFirst ? "dynamic" : def.contentFields.length ? "content" : "style");
  const tabs = [
    ...(def.contentFields.length ? (["content"] as const) : []),
    ...(def.settings?.length ? (["settings"] as const) : []),
    ...(dynamicTab ? (["dynamic"] as const) : []),
    "style" as const,
    "guardrails" as const,
  ];
  const doc = useEditor((s) => s.doc);
  return (
    <div>
      <div className="sticky top-0 z-10 space-y-2 border-b border-zinc-200 bg-white px-4 pb-2 pt-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">{def.label}</p>
          <h2 className="text-sm font-semibold text-zinc-900">{node.name ?? def.label}</h2>
        </div>
        <div className="flex gap-1" role="tablist">
          {tabs.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`rounded-md px-2.5 py-1 text-xs capitalize ${tab === t ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      <div className="px-4 py-2">
        {tab === "content" &&
          def.contentFields.map((field) => (
            <div key={field.key} className="space-y-2 py-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{field.label}</h3>
              {isBoundField(doc, node.id, field.key) && (
                <p className="text-xs text-violet-800">Bound to {describeBindings(node.bindings ?? {}, field.key)}. The value below is the fallback used in previews only.</p>
              )}
              <ContentEditor nodeId={node.id} field={field} value={node.props[field.key]} {...props} />
            </div>
          ))}
        {tab === "dynamic" &&
          (node.type === "loop" ? (
            <LoopQueryEditor nodeId={node.id} />
          ) : node.type === "langswitch" ? (
            <LanguageSwitcherEditor nodeId={node.id} />
          ) : node.type === "productgrid" ? (
            <ProductGridEditor nodeId={node.id} />
          ) : node.type === "product" ? (
            <ProductDetailsEditor nodeId={node.id} />
          ) : node.type === "cart" ? (
            <CartEditor nodeId={node.id} />
          ) : (
            <BindingEditor nodeId={node.id} />
          ))}
        {tab === "settings" && <SettingsEditor nodeId={node.id} {...props} />}
        {tab === "style" && <DesignPanel node={node} tokens={props.tokens} />}
        {tab === "guardrails" && (
          <div className="py-2">
            <LockToggles nodeId={node.id} />
          </div>
        )}
      </div>
    </div>
  );
}

function DesignerOverview() {
  return (
    <div className="space-y-3 p-4 text-sm text-zinc-600">
      <h2 className="text-sm font-semibold text-zinc-900">Design mode</h2>
      <p>Drag widgets from Add onto the page, or rearrange anything by dragging it on the canvas or in Layers.</p>
      <ul className="space-y-1.5 text-[13px]">
        <li><kbd className="rounded bg-zinc-100 px-1">Delete</kbd> removes the selection</li>
        <li><kbd className="rounded bg-zinc-100 px-1">⌘/Ctrl D</kbd> duplicates it</li>
        <li><kbd className="rounded bg-zinc-100 px-1">⌘/Ctrl Z</kbd> undoes, <kbd className="rounded bg-zinc-100 px-1">⇧⌘/Ctrl Z</kbd> redoes</li>
        <li><kbd className="rounded bg-zinc-100 px-1">Esc</kbd> selects the parent</li>
      </ul>
      <p className="text-[13px]">Styles apply to the screen size you are previewing and every smaller one. Use Guardrails to decide what your client can change.</p>
    </div>
  );
}

function Overview() {
  return (
    <div className="space-y-3 p-4 text-sm text-zinc-600">
      <h2 className="text-sm font-semibold text-zinc-900">Editing your page</h2>
      <p>Click any text, image or button on the page to change it. Click selected text again to type directly on the page.</p>
      <ul className="space-y-2 text-[13px]">
        <li className="flex gap-2">
          <span className="mt-1 h-3 w-3 shrink-0 rounded-sm border-2 border-indigo-500" /> Blue outline: you can edit this.
        </li>
        <li className="flex gap-2">
          <span className="mt-1 h-3 w-3 shrink-0 rounded-sm border-2 border-dashed border-amber-500" /> Amber badge: the layout is locked by your designer, but the words and pictures inside are yours.
        </li>
      </ul>
      <p className="text-[13px]">Changes stay private until you press Publish. Every save is kept in History, so you can always go back.</p>
    </div>
  );
}

function LockNotice({ locks, isDesigner, hasContent }: { locks: { layout: boolean; style: boolean; content: boolean }; isDesigner: boolean; hasContent: boolean }) {
  if (isDesigner) {
    const active = Object.entries(locks).filter(([, v]) => v).map(([k]) => k);
    return active.length ? (
      <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">Clients see this as locked: {active.join(", ")}.</p>
    ) : null;
  }
  if (locks.content && hasContent) {
    return <p className="rounded-md bg-zinc-100 px-3 py-2 text-xs text-zinc-700">This element is fully locked by your designer.</p>;
  }
  if (locks.layout || locks.style) {
    return (
      <p className="rounded-md bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
        <span className="font-semibold">Design locked.</span> Your designer protected the {[locks.layout && "layout", locks.style && "styling"].filter(Boolean).join(" and ")} here.
        {hasContent ? " You can still change the content below." : " Select a text or image inside to edit it."}
      </p>
    );
  }
  return null;
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{title}</h3>
      {children}
    </section>
  );
}

const inputCls =
  "w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20";

/** Text input that commits on blur so one edit = one undo step. */
function CommitInput({
  value,
  onCommit,
  multiline,
  ...rest
}: { value: string; onCommit: (v: string) => void; multiline?: boolean } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const [draft, setDraft] = useState(value);
  const [synced, setSynced] = useState(value);
  if (synced !== value) {
    // Undo/redo or another field changed the value underneath us.
    setSynced(value);
    setDraft(value);
  }
  const commit = () => draft !== value && onCommit(draft);
  return multiline ? (
    <textarea className={`${inputCls} min-h-28`} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit} aria-label={rest["aria-label"]} />
  ) : (
    <input
      {...rest}
      className={inputCls}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
    />
  );
}

function ContentEditor({
  nodeId,
  field,
  value,
  siteId,
  assets,
  canUpload,
  onAssetUploaded,
}: { nodeId: string; field: ContentField; value: unknown } & InspectorProps) {
  const setContent = useEditor((s) => s.setContent);
  const [picking, setPicking] = useState(false);
  const set = (v: unknown) => setContent(nodeId, field.key, v);

  switch (field.kind) {
    case "text":
    case "multiline":
      return <CommitInput aria-label={field.label} value={String(value ?? "")} multiline={field.kind === "multiline"} maxLength={field.maxLength} onCommit={set} />;

    case "image": {
      const img = (value as ImageValue) ?? { assetId: null, src: "", alt: "" };
      return (
        <div className="space-y-2">
          {img.src && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img.src} alt="" className="aspect-video w-full rounded-md border border-zinc-200 object-cover" />
          )}
          <button type="button" onClick={() => setPicking(true)} className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50">
            Replace image
          </button>
          <label className="block text-xs text-zinc-600">
            Alt text <span className="text-zinc-400">(describes the image for screen readers and search)</span>
            <CommitInput aria-label="Alt text" value={img.alt} maxLength={300} onCommit={(alt) => set({ ...img, alt })} />
          </label>
          {!img.alt && <p className="text-xs text-amber-700">Add alt text so the page stays accessible.</p>}
          {picking && (
            <MediaPicker
              siteId={siteId}
              assets={assets}
              canUpload={canUpload}
              currentId={img.assetId}
              onClose={() => setPicking(false)}
              onUploaded={onAssetUploaded}
              onPick={(a) => {
                set({ assetId: a.id, src: a.url, alt: a.altText ?? "", width: a.width ?? undefined, height: a.height ?? undefined });
                setPicking(false);
              }}
            />
          )}
        </div>
      );
    }

    case "gallery": {
      const images = Array.isArray(value) ? (value as ImageValue[]) : [];
      return (
        <div className="space-y-2">
          <ul className="space-y-2">
            {images.map((img, i) => (
              <li key={`${img.assetId}-${i}`} className="flex gap-2 rounded-md border border-zinc-200 p-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.src} alt="" className="h-12 w-16 shrink-0 rounded object-cover" />
                <div className="min-w-0 flex-1 space-y-1">
                  <CommitInput aria-label={`Alt text for image ${i + 1}`} placeholder="Alt text" value={img.alt} maxLength={300} onCommit={(alt) => set(images.map((x, j) => (j === i ? { ...x, alt } : x)))} />
                  <div className="flex gap-1 text-[11px]">
                    <button type="button" disabled={i === 0} onClick={() => set(swap(images, i, i - 1))} className="rounded border border-zinc-300 px-1.5 disabled:opacity-40" aria-label={`Move image ${i + 1} earlier`}>↑</button>
                    <button type="button" disabled={i === images.length - 1} onClick={() => set(swap(images, i, i + 1))} className="rounded border border-zinc-300 px-1.5 disabled:opacity-40" aria-label={`Move image ${i + 1} later`}>↓</button>
                    <button type="button" onClick={() => set(images.filter((_, j) => j !== i))} className="rounded border border-red-200 px-1.5 text-red-700" aria-label={`Remove image ${i + 1}`}>Remove</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <button type="button" disabled={images.length >= 24} onClick={() => setPicking(true)} className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50">
            Add image
          </button>
          {picking && (
            <MediaPicker
              siteId={siteId}
              assets={assets}
              canUpload={canUpload}
              currentId={null}
              onClose={() => setPicking(false)}
              onUploaded={onAssetUploaded}
              onPick={(a) => {
                set([...images, { assetId: a.id, src: a.url, alt: a.altText ?? "", width: a.width ?? undefined, height: a.height ?? undefined }]);
                setPicking(false);
              }}
            />
          )}
        </div>
      );
    }

    case "link": {
      const link = (value as LinkValue) ?? { label: "", href: "" };
      if (field.optionalLink) {
        return (
          <div className="space-y-1">
            <OptionalLinkEditor link={link} noun={field.label} onChange={set} />
            <p className="text-[11px] text-zinc-500">Leave the link empty to hide this button.</p>
          </div>
        );
      }
      return <LinkEditor link={link} onChange={set} />;
    }

    case "html":
      return <HtmlEditor label={field.label} value={typeof value === "string" ? value : ""} onCommit={set} />;

    case "number":
      return (
        <CommitInput
          aria-label={field.label}
          type="number"
          min={field.min}
          max={field.max}
          step={field.step ?? "any"}
          value={value === undefined || value === null ? "" : String(value)}
          onCommit={(v) => {
            const n = Number(v);
            if (v !== "" && Number.isFinite(n) && (field.min === undefined || n >= field.min) && (field.max === undefined || n <= field.max)) set(n);
          }}
        />
      );

    case "datetime":
      return (
        <div className="space-y-1">
          <CommitInput aria-label={field.label} type="datetime-local" value={typeof value === "string" ? value : ""} onCommit={(v) => set(v.slice(0, 16))} />
          <p className="text-[11px] text-zinc-500">Date and time the countdown reaches zero.</p>
        </div>
      );

    case "items": {
      const list = Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
      return (
        <ItemsEditor
          field={field}
          items={list}
          onChange={set}
          imagePicker={(current, close, pick) => (
            <MediaPicker siteId={siteId} assets={assets} canUpload={canUpload} currentId={current} onClose={close} onUploaded={onAssetUploaded} onPick={(a) => pick({ assetId: a.id, src: a.url, alt: a.altText ?? "", width: a.width ?? undefined, height: a.height ?? undefined })} />
          )}
        />
      );
    }

    case "icon":
      return <IconPicker label={field.label} value={typeof value === "string" ? value : ""} onChange={set} />;

    case "video": {
      const v = (value as VideoValue) ?? { assetId: null, src: "" };
      return (
        <VideoEditor
          value={v}
          onChange={set}
          picker={(close, pick) => (
            <MediaPicker siteId={siteId} assets={assets} canUpload={canUpload} currentId={v.assetId} accept="video" onClose={close} onUploaded={onAssetUploaded} onPick={(a) => pick({ assetId: a.id, src: a.url })} />
          )}
        />
      );
    }

    case "price": {
      const price = (value as PriceValue) ?? { amount: 0, currency: "USD" };
      return (
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-zinc-600">
            Price ({price.currency})
            <CommitInput aria-label="Price" type="number" min={0} step="0.01" value={String(price.amount)} onCommit={(v) => Number.isFinite(+v) && +v >= 0 && set({ ...price, amount: +v })} />
          </label>
          <label className="text-xs text-zinc-600">
            Was (optional)
            <CommitInput
              aria-label="Compare at price"
              type="number"
              min={0}
              step="0.01"
              value={price.compareAt ? String(price.compareAt) : ""}
              onCommit={(v) => set({ ...price, compareAt: v === "" ? null : +v })}
            />
          </label>
        </div>
      );
    }
  }
}

function emptyItem(field: ContentField): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of field.itemFields ?? []) {
    out[f.key] =
      f.kind === "link" ? { label: "", href: "" } : f.kind === "image" ? { assetId: null, src: "", alt: "" } : f.kind === "number" ? (f.min ?? 0) : f.kind === "toggle" ? true : f.kind === "lines" ? [] : "";
  }
  return out;
}

/** A repeatable list (accordion panels, tabs, slides, plan features): add, remove, reorder, edit each record. */
function ItemsEditor({
  field,
  items,
  onChange,
  imagePicker,
}: {
  field: ContentField;
  items: Record<string, unknown>[];
  onChange: (v: Record<string, unknown>[]) => void;
  imagePicker: (currentId: string | null, close: () => void, pick: (img: ImageValue) => void) => ReactNode;
}) {
  const [open, setOpen] = useState<number | null>(items.length ? 0 : null);
  const [picking, setPicking] = useState<{ index: number; key: string } | null>(null);
  const noun = field.itemLabel ?? "Item";
  const max = field.maxItems ?? 50;
  const min = field.minItems ?? 0;
  const update = (i: number, key: string, v: unknown) => onChange(items.map((it, j) => (j === i ? { ...it, [key]: v } : it)));
  const titleOf = (it: Record<string, unknown>, i: number) => {
    const first = (field.itemFields ?? []).find((f) => f.kind === "text");
    const t = first ? String(it[first.key] ?? "") : "";
    return t || `${noun} ${i + 1}`;
  };
  return (
    <div className="space-y-2" data-items-editor={field.key}>
      <ol className="space-y-1.5">
        {items.map((it, i) => (
          <li key={i} className="rounded-md border border-zinc-200" data-item-row={i}>
            <div className="flex items-center gap-1 px-2 py-1.5">
              <button type="button" onClick={() => setOpen(open === i ? null : i)} className="min-w-0 flex-1 truncate text-left text-xs font-medium text-zinc-800" aria-expanded={open === i}>
                {titleOf(it, i)}
              </button>
              <button type="button" disabled={i === 0} onClick={() => (onChange(swap(items, i, i - 1)), setOpen(i - 1))} className="rounded border border-zinc-300 px-1.5 text-[11px] disabled:opacity-40" aria-label={`Move ${noun.toLowerCase()} ${i + 1} up`}>
                ↑
              </button>
              <button type="button" disabled={i === items.length - 1} onClick={() => (onChange(swap(items, i, i + 1)), setOpen(i + 1))} className="rounded border border-zinc-300 px-1.5 text-[11px] disabled:opacity-40" aria-label={`Move ${noun.toLowerCase()} ${i + 1} down`}>
                ↓
              </button>
              <button type="button" disabled={items.length <= min} onClick={() => (onChange(items.filter((_, j) => j !== i)), setOpen(null))} className="rounded border border-red-200 px-1.5 text-[11px] text-red-700 disabled:opacity-40" aria-label={`Remove ${noun.toLowerCase()} ${i + 1}`}>
                ✕
              </button>
            </div>
            {open === i && (
              <div className="space-y-2 border-t border-zinc-100 p-2">
                {(field.itemFields ?? []).map((f) => {
                  const v = it[f.key];
                  const label = `${f.label}`;
                  switch (f.kind) {
                    case "text":
                    case "multiline":
                      return (
                        <label key={f.key} className="block text-[11px] text-zinc-600">
                          {label}
                          <CommitInput aria-label={`${noun} ${i + 1} ${label}`} value={String(v ?? "")} maxLength={f.maxLength} multiline={f.kind === "multiline"} onCommit={(x) => update(i, f.key, x)} />
                        </label>
                      );
                    case "number":
                      return (
                        <label key={f.key} className="block text-[11px] text-zinc-600">
                          {label}
                          <CommitInput aria-label={`${noun} ${i + 1} ${label}`} type="number" min={f.min} max={f.max} value={String(v ?? "")} onCommit={(x) => Number.isFinite(Number(x)) && x !== "" && update(i, f.key, Number(x))} />
                        </label>
                      );
                    case "toggle":
                      return (
                        <label key={f.key} className="flex items-center gap-2 text-[11px] text-zinc-600">
                          <input type="checkbox" aria-label={`${noun} ${i + 1} ${label}`} checked={v !== false} onChange={(e) => update(i, f.key, e.target.checked)} />
                          {label}
                        </label>
                      );
                    case "lines":
                      return (
                        <label key={f.key} className="block text-[11px] text-zinc-600">
                          {label} <span className="text-zinc-400">(one per line)</span>
                          <CommitInput aria-label={`${noun} ${i + 1} ${label}`} multiline value={(Array.isArray(v) ? (v as string[]) : []).join("\n")} onCommit={(x) => update(i, f.key, x.split("\n").map((l) => l.trim()).filter(Boolean))} />
                        </label>
                      );
                    case "icon":
                      return <IconPicker key={f.key} label={`${noun} ${i + 1} ${label}`} value={String(v ?? "")} onChange={(x) => update(i, f.key, x)} allowNone />;
                    case "link":
                      return (
                        <div key={f.key} className="space-y-1 text-[11px] text-zinc-600">
                          {label}
                          <OptionalLinkEditor link={(v as LinkValue) ?? { label: "", href: "" }} noun={`${noun} ${i + 1}`} onChange={(x) => update(i, f.key, x)} />
                        </div>
                      );
                    case "image": {
                      const img = (v as ImageValue) ?? { assetId: null, src: "", alt: "" };
                      return (
                        <div key={f.key} className="space-y-1 text-[11px] text-zinc-600">
                          {label}
                          <div className="flex items-center gap-2">
                            {img.src ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={img.src} alt="" className="h-10 w-14 rounded object-cover" />
                            ) : (
                              <span className="grid h-10 w-14 place-items-center rounded bg-zinc-100 text-[10px] text-zinc-400">none</span>
                            )}
                            <button type="button" onClick={() => setPicking({ index: i, key: f.key })} className="flex-1 rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-50">
                              {img.src ? "Replace" : "Choose image"}
                            </button>
                          </div>
                          {img.src && <CommitInput aria-label={`${noun} ${i + 1} alt text`} placeholder="Alt text" value={img.alt} maxLength={300} onCommit={(alt) => update(i, f.key, { ...img, alt })} />}
                          {picking?.index === i && picking.key === f.key &&
                            imagePicker(img.assetId, () => setPicking(null), (picked) => {
                              update(i, f.key, picked);
                              setPicking(null);
                            })}
                        </div>
                      );
                    }
                  }
                })}
              </div>
            )}
          </li>
        ))}
      </ol>
      <button
        type="button"
        disabled={items.length >= max}
        onClick={() => {
          onChange([...items, emptyItem(field)]);
          setOpen(items.length);
        }}
        className="w-full rounded-md border border-dashed border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40"
        data-add-item={field.key}
      >
        + Add {noun.toLowerCase()}
      </button>
    </div>
  );
}

/** A link that may be left empty (no button). */
function OptionalLinkEditor({ link, noun, onChange }: { link: LinkValue; noun: string; onChange: (l: LinkValue) => void }) {
  const [href, setHref] = useState(link.href);
  const [synced, setSynced] = useState(link.href);
  if (synced !== link.href) {
    setSynced(link.href);
    setHref(link.href);
  }
  const valid = href === "" || isSafeHref(href);
  return (
    <div className="grid grid-cols-2 gap-1.5">
      <CommitInput aria-label={`${noun} button label`} placeholder="Label" value={link.label} maxLength={80} onCommit={(label) => onChange({ ...link, label })} />
      <input
        aria-label={`${noun} button link`}
        className={`${inputCls} ${valid ? "" : "border-red-400"}`}
        placeholder="/page or https://"
        value={href}
        onChange={(e) => setHref(e.target.value)}
        onBlur={() => valid && href !== link.href && onChange({ ...link, href })}
      />
    </div>
  );
}

/** The WYSIWYG editor commits when focus leaves it, so one editing pass is one undo step. */
function HtmlEditor({ label, value, onCommit }: { label: string; value: string; onCommit: (html: string) => void }) {
  const [draft, setDraft] = useState(value);
  const [synced, setSynced] = useState(value);
  if (synced !== value) {
    setSynced(value);
    setDraft(value);
  }
  return (
    <div
      data-html-editor=""
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null) && draft !== value) onCommit(draft);
      }}
    >
      <RichTextEditor label={label} value={draft} onChange={setDraft} minHeight={160} />
      <p className="mt-1 text-[11px] text-zinc-400">Saved when you click outside the editor.</p>
    </div>
  );
}

const ICON_LIST = [...ICON_NAMES].sort();

function IconPicker({ label, value, onChange, allowNone }: { label: string; value: string; onChange: (v: string) => void; allowNone?: boolean }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const list = ICON_LIST.filter((n) => !q || n.includes(q.trim().toLowerCase().replace(/\s+/g, "-")));
  return (
    <div className="space-y-2" data-icon-picker="">
      <div className="flex items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-md border border-zinc-200 text-zinc-700">{value ? <SiteIcon name={value} size={20} /> : <span className="text-[10px] text-zinc-400">none</span>}</span>
        <button type="button" onClick={() => setOpen(!open)} className="flex-1 rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50" aria-expanded={open} aria-label={`Choose ${label}`}>
          {value ? iconLabel(value) : "Choose an icon"}
        </button>
        {allowNone && value && (
          <button type="button" onClick={() => onChange("")} className="rounded-md px-2 py-1.5 text-xs text-zinc-500 hover:bg-zinc-100">
            Clear
          </button>
        )}
      </div>
      {open && (
        <div className="space-y-2 rounded-md border border-zinc-200 p-2">
          <input type="search" aria-label="Search icons" placeholder="Search icons…" className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="grid max-h-56 grid-cols-6 gap-1 overflow-y-auto">
            {list.map((name) => (
              <button
                key={name}
                type="button"
                title={iconLabel(name)}
                aria-label={iconLabel(name)}
                data-icon-option={name}
                onClick={() => {
                  onChange(name);
                  setOpen(false);
                }}
                className={`grid aspect-square place-items-center rounded text-zinc-700 hover:bg-zinc-100 ${value === name ? "bg-indigo-50 ring-1 ring-indigo-400" : ""}`}
              >
                <SiteIcon name={name} size={18} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function VideoEditor({ value, onChange, picker }: { value: VideoValue; onChange: (v: VideoValue) => void; picker: (close: () => void, pick: (v: VideoValue) => void) => ReactNode }) {
  const [picking, setPicking] = useState(false);
  const [url, setUrl] = useState(value.assetId ? "" : value.src);
  const valid = !url || parseVideoUrl(url) !== null;
  return (
    <div className="space-y-2">
      {value.assetId && value.src ? (
        <p className="truncate rounded-md bg-zinc-50 px-2.5 py-1.5 text-xs text-zinc-700">From the media library: {value.src.split("/").pop()}</p>
      ) : null}
      <button type="button" onClick={() => setPicking(true)} className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50">
        {value.assetId ? "Replace video" : "Choose from media library"}
      </button>
      <label className="block text-xs text-zinc-600">
        Or a YouTube / Vimeo address
        <input
          aria-label="Video address"
          className={`${inputCls} ${valid ? "" : "border-red-400"}`}
          value={url}
          placeholder="https://www.youtube.com/watch?v=…"
          onChange={(e) => setUrl(e.target.value)}
          onBlur={() => {
            if (!valid) return;
            if (url && url !== value.src) onChange({ assetId: null, src: url.trim() });
            if (!url && !value.assetId && value.src) onChange({ assetId: null, src: "" });
          }}
        />
      </label>
      {!valid && <p className="text-xs text-red-600">Use a YouTube, Vimeo or https .mp4 / .webm address.</p>}
      {picking &&
        picker(
          () => setPicking(false),
          (v) => {
            setUrl("");
            onChange(v);
            setPicking(false);
          },
        )}
    </div>
  );
}

/** Button variants restyle the button through ordinary style values, so the designer can fine-tune them. */
const BUTTON_VARIANTS: Record<string, Partial<Record<StyleKey, string | undefined>>> = {
  solid: { background: "var(--color-primary)", color: "var(--color-inverse, #fff)", border: "1px solid transparent" },
  outline: { background: "transparent", color: "var(--color-primary)", border: "1.5px solid currentColor" },
  ghost: { background: "transparent", color: "var(--color-primary)", border: "1px solid transparent" },
};

function SettingsEditor({ nodeId, ...props }: { nodeId: string } & InspectorProps) {
  const node = useEditor((s) => s.doc.nodes[nodeId]);
  const setDesignProp = useEditor((s) => s.setDesignProp);
  const applyStyles = useEditor((s) => s.applyStyles);
  const defs = WIDGETS[node.type].settings ?? [];
  const [picking, setPicking] = useState<string | null>(null);

  const change = (def: SettingDef, v: unknown) => {
    setDesignProp(nodeId, def.key, v);
    // Variants describe the desktop look; smaller screens inherit it.
    if (node.type === "button" && def.key === "variant" && BUTTON_VARIANTS[v as string]) applyStyles(nodeId, "desktop", BUTTON_VARIANTS[v as string]);
  };

  return (
    <div className="space-y-3.5 py-2 text-xs text-zinc-700" data-settings="">
      {defs
        .filter((d) => settingVisible(defs, d, node))
        .map((def) => {
          const value = settingValue(defs, node, def.key);
          const id = `set-${nodeId}-${def.key}`;
          return (
            <div key={def.key} className="space-y-1" data-setting={def.key}>
              {def.kind === "toggle" ? (
                <label className="flex items-center gap-2 font-medium">
                  <input id={id} type="checkbox" checked={!!value} onChange={(e) => change(def, e.target.checked)} />
                  {def.label}
                </label>
              ) : (
                <label htmlFor={id} className="block font-medium">
                  {def.label}
                  {def.kind === "number" && (
                    <span className="ml-1 font-normal text-zinc-400">
                      {String(value)}
                      {def.unit ?? ""}
                    </span>
                  )}
                </label>
              )}
              {def.kind === "select" && (
                <select id={id} className={inputCls} value={String(value)} onChange={(e) => change(def, e.target.value)}>
                  {def.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}
              {def.kind === "number" && (
                <input id={id} type="range" className="w-full" min={def.min} max={def.max} step={def.step ?? 1} value={Number(value)} onChange={(e) => change(def, Number(e.target.value))} />
              )}
              {def.kind === "text" && <CommitInput id={id} aria-label={def.label} value={String(value ?? "")} maxLength={def.maxLength} placeholder={def.placeholder} onCommit={(v) => change(def, v)} />}
              {def.kind === "color" && <ColorSetting id={id} value={String(value ?? "")} tokens={props.tokens} onChange={(v) => change(def, v)} />}
              {def.kind === "icon" && <IconPicker label={def.label} value={String(value ?? "")} onChange={(v) => change(def, v)} allowNone />}
              {def.kind === "media" && (
                <div className="space-y-1.5">
                  {value ? <p className="truncate rounded bg-zinc-50 px-2 py-1">{(value as MediaRef).src.split("/").pop()}</p> : null}
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setPicking(def.key)} className="flex-1 rounded-md border border-zinc-300 px-3 py-1.5 font-medium hover:bg-zinc-50">
                      {value ? "Replace video" : "Choose video"}
                    </button>
                    {value ? (
                      <button type="button" onClick={() => change(def, null)} className="rounded-md px-2 py-1.5 text-zinc-500 hover:bg-zinc-100">
                        Remove
                      </button>
                    ) : null}
                  </div>
                  {picking === def.key && (
                    <MediaPicker
                      siteId={props.siteId}
                      assets={props.assets}
                      canUpload={props.canUpload}
                      currentId={(value as MediaRef | null)?.assetId ?? null}
                      accept="video"
                      onClose={() => setPicking(null)}
                      onUploaded={props.onAssetUploaded}
                      onPick={(a) => {
                        change(def, { assetId: a.id, src: a.url });
                        setPicking(null);
                      }}
                    />
                  )}
                </div>
              )}
              {def.help && <p className="text-[11px] leading-relaxed text-zinc-500">{def.help}</p>}
            </div>
          );
        })}
    </div>
  );
}

function ColorSetting({ id, value, tokens, onChange }: { id: string; value: string; tokens: DesignTokens; onChange: (v: string) => void }) {
  const palette = Object.entries(tokens.colors ?? {});
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1.5">
        {palette.map(([name, hex]) => {
          const v = `var(--color-${name})`;
          return (
            <button
              key={name}
              type="button"
              title={name}
              aria-label={`Colour ${name}`}
              onClick={() => onChange(value === v ? "" : v)}
              className={`h-6 w-6 rounded-full border ${value === v ? "ring-2 ring-indigo-500 ring-offset-1" : "border-zinc-300"}`}
              style={{ background: hex }}
            />
          );
        })}
      </div>
      <CommitInput id={id} aria-label="Colour value" value={value} maxLength={120} placeholder="Inherit, or #hex / rgba() / var(--color-…)" onCommit={(v) => onChange(v.trim())} />
    </div>
  );
}

function swap<T>(list: T[], a: number, b: number) {
  const next = [...list];
  [next[a], next[b]] = [next[b], next[a]];
  return next;
}

function sourceLabel(b: Binding, fieldLabel?: string) {
  if (b.source === "post") return POST_SOURCES[b.key]?.label ?? b.key;
  if (b.source === "site") return SITE_SOURCES[b.key]?.label ?? b.key;
  return `the “${fieldLabel ?? b.key}” field`;
}

function describeBindings(bindings: Record<string, Binding>, field: string) {
  return Object.entries(bindings)
    .filter(([target]) => target.split(".")[0] === field)
    .map(([, b]) => sourceLabel(b).replace(/^([A-Z])/, (c) => c.toLowerCase()))
    .join(" and ");
}

/** Binding options for one target, grouped by where the data comes from. */
function useBindingOptions(nodeId: string, accepts: BindKind) {
  const doc = useEditor((s) => s.doc);
  const catalog = useEditor((s) => s.catalog);
  const contextPostTypeId = useEditor((s) => s.contextPostTypeId);
  const loopId = enclosingLoop(doc, nodeId);
  const postTypeId = loopId ? ((doc.nodes[loopId].props.query as LoopQuery | undefined)?.postTypeId ?? null) : contextPostTypeId;
  const postType = catalog.postTypes.find((p) => p.id === postTypeId);
  const groups: { label: string; options: { value: string; label: string }[] }[] = [];
  if (postTypeId) {
    groups.push({
      label: loopId ? `Each ${postType?.label ?? "entry"} in the loop` : `This ${postType?.label ?? "entry"}`,
      options: Object.entries(POST_SOURCES)
        .filter(([, src]) => src.kinds.includes(accepts))
        .map(([key, src]) => ({ value: `post:${key}`, label: src.label })),
    });
    const fields = (catalog.fields[postTypeId] ?? []).filter((f) => FIELD_TYPE_INFO[f.type].bind.includes(accepts));
    if (fields.length) groups.push({ label: "Custom fields", options: fields.map((f) => ({ value: `field:${f.key}`, label: f.label })) });
  }
  groups.push({
    label: "Site",
    options: Object.entries(SITE_SOURCES)
      .filter(([, src]) => src.kinds.includes(accepts))
      .map(([key, src]) => ({ value: `site:${key}`, label: src.label })),
  });
  return { groups: groups.filter((g) => g.options.length), loopId, postTypeId };
}

function BindingEditor({ nodeId }: { nodeId: string }) {
  const node = useEditor((s) => s.doc.nodes[nodeId]);
  const targets = BINDABLE[node.type];
  const loopId = enclosingLoop(useEditor.getState().doc, nodeId);
  const contextPostTypeId = useEditor((s) => s.contextPostTypeId);
  return (
    <div className="space-y-4 py-2">
      <p className="text-[11px] leading-relaxed text-zinc-500">
        {loopId
          ? "This widget is inside a loop grid, so it can show data from each entry the loop lists."
          : contextPostTypeId
            ? "Show data from this page (or, in a single template, the entry it renders), or from the site."
            : "Show site-wide data here. Put the widget in a loop grid to show entries."}{" "}
        Bound values are read only for clients.
      </p>
      {targets.map((t) => (
        <BindingRow key={t.key} nodeId={nodeId} target={t} binding={node.bindings?.[t.key]} />
      ))}
    </div>
  );
}

function BindingRow({ nodeId, target, binding }: { nodeId: string; target: BindTarget; binding?: Binding }) {
  const setBinding = useEditor((s) => s.setBinding);
  const { groups } = useBindingOptions(nodeId, target.accepts);
  const value = binding ? `${binding.source}:${binding.key}` : "";
  const known = groups.some((g) => g.options.some((o) => o.value === value));
  const id = `bind-${nodeId}-${target.key}`;
  return (
    <div className="space-y-1.5" data-binding-row={target.key}>
      <label htmlFor={id} className="block text-xs font-medium text-zinc-700">
        {target.label}
      </label>
      <select
        id={id}
        className={inputCls}
        value={value}
        onChange={(e) => {
          if (!e.target.value) return setBinding(nodeId, target.key, null);
          const [source, ...rest] = e.target.value.split(":");
          setBinding(nodeId, target.key, { source: source as Binding["source"], key: rest.join(":"), fallback: binding?.fallback });
        }}
      >
        <option value="">Static (not bound)</option>
        {binding && !known && <option value={value}>{sourceLabel(binding)} (not available here)</option>}
        {groups.map((g) => (
          <optgroup key={g.label} label={g.label}>
            {g.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {binding && target.accepts !== "gallery" && target.accepts !== "price" && (
        <label className="block text-[11px] text-zinc-500">
          Fallback when empty
          <CommitInput aria-label={`${target.label} fallback`} value={binding.fallback ?? ""} maxLength={200} onCommit={(fallback) => setBinding(nodeId, target.key, { ...binding, fallback: fallback || undefined })} />
        </label>
      )}
      {binding && !known && <p className="text-[11px] text-amber-700">This source isn&apos;t available in this spot, so the fallback shows.</p>}
    </div>
  );
}

/** Widgets whose "dynamic" tab holds their settings and opens first. */
const SETTINGS_WIDGETS = new Set<string>(["loop", "langswitch", "productgrid", "product", "cart"]);

function ProductGridEditor({ nodeId }: { nodeId: string }) {
  const props = useEditor((s) => s.doc.nodes[nodeId].props) as unknown as ProductGridProps;
  const count = useEditor((s) => s.commerce?.products.length ?? 0);
  const setDesignProp = useEditor((s) => s.setDesignProp);
  return (
    <div className="space-y-3 py-2 text-xs text-zinc-700">
      <p className="text-[11px] leading-relaxed text-zinc-500">
        Shows the shop&apos;s active products with their price and an Add to cart button (products with options link to their page). {count ? `${count} product${count === 1 ? "" : "s"} available.` : "Add products under Products first."}
      </p>
      <label className="block space-y-1">
        <span className="font-medium">Order</span>
        <select aria-label="Product grid order" className={inputCls} value={props.sort} onChange={(e) => setDesignProp(nodeId, "sort", e.target.value)} data-grid-order="">
          <option value="newest">Newest first</option>
          <option value="price-asc">Price, low to high</option>
          <option value="price-desc">Price, high to low</option>
          <option value="title">Name</option>
        </select>
      </label>
      <label className="block space-y-1">
        <span className="font-medium">How many</span>
        <input type="number" aria-label="Product grid limit" className={inputCls} min={1} max={MAX_GRID_PRODUCTS} value={props.limit} onChange={(e) => setDesignProp(nodeId, "limit", Math.max(1, Math.min(MAX_GRID_PRODUCTS, Number(e.target.value) || 1)))} />
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={props.inStockOnly} onChange={(e) => setDesignProp(nodeId, "inStockOnly", e.target.checked)} />
        Hide sold-out products
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={props.showSort} onChange={(e) => setDesignProp(nodeId, "showSort", e.target.checked)} />
        Let visitors change the order
      </label>
      <label className="block space-y-1">
        <span className="font-medium">Button label</span>
        <CommitInput aria-label="Product grid button label" value={props.buttonLabel} maxLength={40} onCommit={(v) => setDesignProp(nodeId, "buttonLabel", v || "Add to cart")} />
      </label>
    </div>
  );
}

function ProductDetailsEditor({ nodeId }: { nodeId: string }) {
  const props = useEditor((s) => s.doc.nodes[nodeId].props) as unknown as ProductDetailsProps;
  const products = useEditor((s) => s.commerce?.products ?? []);
  const setDesignProp = useEditor((s) => s.setDesignProp);
  return (
    <div className="space-y-3 py-2 text-xs text-zinc-700">
      <p className="text-[11px] leading-relaxed text-zinc-500">
        Gallery, price, option pickers and Add to cart. &ldquo;The page&apos;s product&rdquo; is for the product page template (Settings → Payments); pick a product to feature it anywhere else.
      </p>
      <label className="block space-y-1">
        <span className="font-medium">Product</span>
        <select aria-label="Product details product" className={inputCls} value={props.productId ?? ""} onChange={(e) => setDesignProp(nodeId, "productId", e.target.value || null)} data-product-pick="">
          <option value="">The page&apos;s product</option>
          {props.productId && !products.some((p) => p.id === props.productId) && <option value={props.productId}>(missing product)</option>}
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1">
        <span className="font-medium">Button label</span>
        <CommitInput aria-label="Product details button label" value={props.buttonLabel} maxLength={40} onCommit={(v) => setDesignProp(nodeId, "buttonLabel", v || "Add to cart")} />
      </label>
    </div>
  );
}

function CartEditor({ nodeId }: { nodeId: string }) {
  const props = useEditor((s) => s.doc.nodes[nodeId].props) as unknown as CartProps;
  const setDesignProp = useEditor((s) => s.setDesignProp);
  return (
    <div className="space-y-3 py-2 text-xs text-zinc-700">
      <p className="text-[11px] leading-relaxed text-zinc-500">
        A cart button with the item count. It opens a slide-out drawer where visitors change quantities and go to Stripe checkout. The cart is kept in their browser between visits. Hidden on sites without products.
      </p>
      <label className="block space-y-1">
        <span className="font-medium">Label</span>
        <CommitInput aria-label="Cart label" value={props.label} maxLength={40} onCommit={(v) => setDesignProp(nodeId, "label", v || "Cart")} />
      </label>
    </div>
  );
}

function LanguageSwitcherEditor({ nodeId }: { nodeId: string }) {
  const props = useEditor((s) => s.doc.nodes[nodeId].props) as Partial<LanguageSwitcherProps>;
  const setDesignProp = useEditor((s) => s.setDesignProp);
  return (
    <div className="space-y-3 py-2 text-xs text-zinc-700">
      <p className="text-[11px] leading-relaxed text-zinc-500">
        Visitors see a link to this page in each of the site&apos;s languages (or that language&apos;s home page when this page isn&apos;t translated yet). It stays hidden while the site has a single language.
      </p>
      <label className="block space-y-1">
        <span className="font-medium">Show</span>
        <select aria-label="Language switcher display" className={inputCls} value={props.display ?? "label"} onChange={(e) => setDesignProp(nodeId, "display", e.target.value)}>
          <option value="label">Language names (Français)</option>
          <option value="code">Short codes (FR)</option>
        </select>
      </label>
      <label className="block space-y-1">
        <span className="font-medium">Style</span>
        <select aria-label="Language switcher style" className={inputCls} value={props.variant ?? "inline"} onChange={(e) => setDesignProp(nodeId, "variant", e.target.value)}>
          <option value="inline">Row of links</option>
          <option value="dropdown">Dropdown</option>
        </select>
      </label>
    </div>
  );
}

function LoopQueryEditor({ nodeId }: { nodeId: string }) {
  const query = useEditor((s) => s.doc.nodes[nodeId].props.query as LoopQuery);
  const catalog = useEditor((s) => s.catalog);
  const setDesignProp = useEditor((s) => s.setDesignProp);
  const items = useEditor((s) => s.dynamic?.loops[nodeId]);
  const set = (patch: Partial<LoopQuery>) => setDesignProp(nodeId, "query", { ...query, ...patch });
  const terms = catalog.terms.filter((t) => query.postTypeId && t.postTypeIds.includes(query.postTypeId));
  return (
    <div className="space-y-3 py-2 text-xs text-zinc-700">
      <p className="text-[11px] leading-relaxed text-zinc-500">
        The first card is the template; the canvas repeats it with real published entries. Bind the widgets inside the first card to post data or custom fields.
      </p>
      {!catalog.postTypes.length && <p className="rounded bg-amber-50 px-2 py-1.5 text-amber-800">Create a post type first, then choose it here.</p>}
      <label className="block space-y-1">
        <span className="font-medium">Post type</span>
        <select aria-label="Loop post type" className={inputCls} value={query.postTypeId ?? ""} onChange={(e) => set({ postTypeId: e.target.value || null, termId: null })} data-loop-type="">
          <option value="">Choose…</option>
          {catalog.postTypes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      {terms.length > 0 && (
        <label className="block space-y-1">
          <span className="font-medium">Only in category</span>
          <select aria-label="Loop term filter" className={inputCls} value={query.termId ?? ""} onChange={(e) => set({ termId: e.target.value || null })}>
            <option value="">Any</option>
            {terms.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="grid grid-cols-2 gap-2">
        <label className="block space-y-1">
          <span className="font-medium">Show</span>
          <CommitInput aria-label="Loop limit" type="number" min={1} max={MAX_LOOP_ITEMS} value={String(query.limit)} onCommit={(v) => Number.isInteger(+v) && +v >= 1 && +v <= MAX_LOOP_ITEMS && set({ limit: +v })} />
        </label>
        <label className="block space-y-1">
          <span className="font-medium">Skip</span>
          <CommitInput aria-label="Loop offset" type="number" min={0} max={100} value={String(query.offset ?? 0)} onCommit={(v) => Number.isInteger(+v) && +v >= 0 && +v <= 100 && set({ offset: +v })} />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block space-y-1">
          <span className="font-medium">Order by</span>
          <select aria-label="Loop order by" className={inputCls} value={query.orderBy} onChange={(e) => set({ orderBy: e.target.value as LoopQuery["orderBy"] })}>
            <option value="date">Publish date</option>
            <option value="title">Title</option>
            <option value="menu">Menu order</option>
          </select>
        </label>
        <label className="block space-y-1">
          <span className="font-medium">Direction</span>
          <select aria-label="Loop order" className={inputCls} value={query.order} onChange={(e) => set({ order: e.target.value as LoopQuery["order"] })}>
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </label>
      </div>
      <p className="text-[11px] text-zinc-500" aria-live="polite">
        {items === undefined ? "Loading preview…" : `${items.length} published ${items.length === 1 ? "entry" : "entries"} in the preview.`}
      </p>
    </div>
  );
}

function LinkEditor({ link, onChange }: { link: LinkValue; onChange: (l: LinkValue) => void }) {
  const [href, setHref] = useState(link.href);
  const [synced, setSynced] = useState(link.href);
  if (synced !== link.href) {
    setSynced(link.href);
    setHref(link.href);
  }
  const valid = isSafeHref(href);
  return (
    <div className="space-y-2">
      <label className="block text-xs text-zinc-600">
        Label
        <CommitInput aria-label="Button label" value={link.label} maxLength={80} onCommit={(label) => onChange({ ...link, label })} />
      </label>
      <label className="block text-xs text-zinc-600">
        Link
        <input
          aria-label="Button link"
          className={`${inputCls} ${valid ? "" : "border-red-400"}`}
          value={href}
          placeholder="/contact or https://…"
          onChange={(e) => setHref(e.target.value)}
          onBlur={() => valid && href !== link.href && onChange({ ...link, href })}
        />
      </label>
      {!valid && <p className="text-xs text-red-600">Use a page path like /contact, or a full https:// address.</p>}
      <label className="flex items-center gap-2 text-xs text-zinc-600">
        <input type="checkbox" checked={!!link.newTab} onChange={(e) => onChange({ ...link, newTab: e.target.checked })} /> Open in a new tab
      </label>
    </div>
  );
}

function nearestBackground(doc: BuilderDocument, id: string, tokens: DesignTokens): string | undefined {
  let current: string | undefined = id;
  while (current) {
    const bg = resolveColor(doc.nodes[current]?.style.desktop?.background, tokens);
    if (bg) return bg;
    current = parentOf(doc, current);
  }
  return tokens.colors?.background ?? "#ffffff";
}

function nearestColor(doc: BuilderDocument, id: string, tokens: DesignTokens): string | undefined {
  let current: string | undefined = id;
  while (current) {
    const c = resolveColor(doc.nodes[current]?.style.desktop?.color, tokens);
    if (c) return c;
    current = parentOf(doc, current);
  }
  return tokens.colors?.text;
}

function StyleEditor({ nodeId, keys, tokens }: { nodeId: string; keys: StyleKey[]; tokens: DesignTokens }) {
  const doc = useEditor((s) => s.doc);
  const viewport = useEditor((s) => s.viewport);
  const setStyle = useEditor((s) => s.setStyle);
  const style = doc.nodes[nodeId].style[viewport] ?? {};
  const palette = Object.entries(tokens.colors ?? {});

  const fg = nearestColor(doc, nodeId, tokens);
  const bg = nearestBackground(doc, nodeId, tokens);
  const ratio = fg && bg ? contrastRatio(fg, bg) : null;

  const swatches = (key: "color" | "background") => (
    <div className="flex flex-wrap gap-1.5">
      {palette.map(([name, hex]) => {
        const value = `var(--color-${name})`;
        return (
          <button
            key={name}
            type="button"
            title={name}
            aria-label={`${key} ${name}`}
            onClick={() => setStyle(nodeId, key, style[key] === value ? undefined : value)}
            className={`h-6 w-6 rounded-full border ${style[key] === value ? "ring-2 ring-indigo-500 ring-offset-1" : "border-zinc-300"}`}
            style={{ background: hex }}
          />
        );
      })}
    </div>
  );

  return (
    <div className="space-y-3 text-xs text-zinc-600">
      <p className="text-[11px] text-zinc-400">Applies to {viewport} and smaller screens. Colours come from your brand palette.</p>
      {keys.includes("color") && (
        <div className="space-y-1">
          <span>Text colour</span>
          {swatches("color")}
        </div>
      )}
      {keys.includes("background") && (
        <div className="space-y-1">
          <span>Background</span>
          {swatches("background")}
        </div>
      )}
      {ratio !== null && (keys.includes("color") || keys.includes("background")) && (
        <p className={`rounded px-2 py-1 ${ratio >= 4.5 ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>
          Contrast {ratio.toFixed(1)}:1 {ratio >= 4.5 ? "meets WCAG AA" : "is below WCAG AA (4.5:1). Pick a darker or lighter colour."}
        </p>
      )}
      {keys.includes("textAlign") && (
        <Segmented label="Text align" options={["left", "center", "right"]} value={style.textAlign} onChange={(v) => setStyle(nodeId, "textAlign", v)} />
      )}
      {keys.includes("justifyContent") && (
        <Segmented label="Distribute" options={["flex-start", "center", "flex-end", "space-between"]} value={style.justifyContent} onChange={(v) => setStyle(nodeId, "justifyContent", v)} />
      )}
      {keys.includes("alignItems") && (
        <Segmented label="Align" options={["flex-start", "center", "flex-end", "stretch"]} value={style.alignItems} onChange={(v) => setStyle(nodeId, "alignItems", v)} />
      )}
      {keys.includes("gap") && (
        <Segmented label="Spacing" options={["var(--space-sm)", "var(--space-md)", "var(--space-lg)"]} labels={["S", "M", "L"]} value={style.gap} onChange={(v) => setStyle(nodeId, "gap", v)} />
      )}
    </div>
  );
}

function Segmented({ label, options, labels, value, onChange }: { label: string; options: string[]; labels?: string[]; value?: string; onChange: (v: string | undefined) => void }) {
  return (
    <div className="space-y-1">
      <span>{label}</span>
      <div className="flex overflow-hidden rounded-md border border-zinc-300">
        {options.map((o, i) => (
          <button
            key={o}
            type="button"
            onClick={() => onChange(value === o ? undefined : o)}
            className={`flex-1 px-1.5 py-1 text-[11px] ${value === o ? "bg-zinc-900 text-white" : "bg-white text-zinc-700 hover:bg-zinc-50"}`}
          >
            {labels?.[i] ?? o.replace("flex-", "").replace("space-", "")}
          </button>
        ))}
      </div>
    </div>
  );
}

function ReorderButtons({ parentId, childId }: { parentId: string; childId: string }) {
  const moveChild = useEditor((s) => s.moveChild);
  return (
    <div className="flex gap-2">
      <button type="button" onClick={() => moveChild(parentId, childId, -1)} className="flex-1 rounded-md border border-zinc-300 px-2 py-1.5 text-xs hover:bg-zinc-50">
        Move earlier
      </button>
      <button type="button" onClick={() => moveChild(parentId, childId, 1)} className="flex-1 rounded-md border border-zinc-300 px-2 py-1.5 text-xs hover:bg-zinc-50">
        Move later
      </button>
    </div>
  );
}

function LockToggles({ nodeId }: { nodeId: string }) {
  const locks = useEditor((s) => s.doc.nodes[nodeId].locks ?? {});
  const setLocks = useEditor((s) => s.setLocks);
  const rows: { key: "layout" | "style" | "content"; label: string; help: string }[] = [
    { key: "layout", label: "Layout", help: "Spacing, order and structure" },
    { key: "style", label: "Style", help: "Colours, type and effects" },
    { key: "content", label: "Content", help: "Text, images, links and prices" },
  ];
  const states = [
    { value: undefined, label: "Inherit" },
    { value: true, label: "Lock" },
    { value: false, label: "Unlock" },
  ];
  return (
    <div className="space-y-3">
      <p className="text-[11px] text-zinc-400">Applies to everything inside. Unlock re-opens an area inside a locked parent.</p>
      {rows.map((r) => (
        <div key={r.key} className="space-y-1 text-xs text-zinc-700">
          <p>
            <span className="font-medium">{r.label}</span> <span className="text-zinc-500">· {r.help}</span>
          </p>
          <div className="flex overflow-hidden rounded-md border border-zinc-300" role="radiogroup" aria-label={`${r.label} lock`}>
            {states.map((st) => (
              <button
                key={st.label}
                type="button"
                role="radio"
                aria-checked={locks[r.key] === st.value}
                onClick={() => setLocks(nodeId, { [r.key]: st.value })}
                className={`flex-1 px-2 py-1 text-[11px] ${locks[r.key] === st.value ? "bg-zinc-900 text-white" : "bg-white hover:bg-zinc-50"}`}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
