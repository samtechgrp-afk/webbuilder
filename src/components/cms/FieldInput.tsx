"use client";

import { useId, type ReactNode } from "react";
import { emptyValue, type FieldDef, type FlexibleBlock, type RepeaterRow } from "@/lib/cms/fields";
import { MediaField, type LibraryAsset } from "./MediaField";
import { RichTextEditor } from "./RichTextEditor";
import { Button, Toggle, inputClass } from "./ui";

/** Everything a field control might need to offer choices. */
export interface FieldContext {
  siteId: string;
  assets: LibraryAsset[];
  onUploaded: (asset: LibraryAsset) => void;
  canUpload: boolean;
  entries: { id: string; title: string; postTypeId: string; typeLabel: string }[];
  members: { id: string; name: string }[];
  terms: { id: string; name: string; taxonomyId: string; depth: number }[];
}

/** One field: label, instructions, control, error. Recurses for repeaters and flexible content. */
export function FieldInput({
  def,
  value,
  onChange,
  ctx,
  disabled,
  error,
  lockedNote,
}: {
  def: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
  ctx: FieldContext;
  disabled?: boolean;
  error?: string | null;
  lockedNote?: string;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errId = `${id}-err`;
  const describedBy = [def.instructions || lockedNote ? hintId : null, error ? errId : null].filter(Boolean).join(" ") || undefined;
  const grouped = ["RADIO", "CHECKBOX", "REPEATER", "FLEXIBLE", "TAXONOMY", "GALLERY"].includes(def.type) || (def.type === "SELECT" && def.config.multiple) || (def.type === "RELATION" && def.config.multiple);
  const control = <Control def={def} value={value} onChange={onChange} ctx={ctx} disabled={disabled} id={id} describedBy={describedBy} invalid={!!error} />;

  const label = (
    <>
      {def.label}
      {def.required && <span className="ml-0.5 text-red-600" aria-hidden>*</span>}
      {def.required && <span className="sr-only"> (required)</span>}
      {disabled && lockedNote && (
        <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-normal text-zinc-600">
          <span aria-hidden>🔒</span> Designer only
        </span>
      )}
    </>
  );
  const meta = (
    <>
      {(def.instructions || (disabled && lockedNote)) && (
        <p id={hintId} className="text-xs text-zinc-500">
          {def.instructions}
          {disabled && lockedNote ? ` ${lockedNote}` : ""}
        </p>
      )}
      {error && (
        <p id={errId} className="text-xs font-medium text-red-700">
          {error}
        </p>
      )}
    </>
  );

  return grouped ? (
    <fieldset className="space-y-2" data-field={def.key} aria-describedby={describedBy}>
      <legend className="text-sm font-medium text-zinc-800">{label}</legend>
      {control}
      {meta}
    </fieldset>
  ) : (
    <div className="space-y-1.5" data-field={def.key}>
      <label htmlFor={id} className="block text-sm font-medium text-zinc-800">
        {label}
      </label>
      {control}
      {meta}
    </div>
  );
}

function Control({
  def,
  value,
  onChange,
  ctx,
  disabled,
  id,
  describedBy,
  invalid,
}: {
  def: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
  ctx: FieldContext;
  disabled?: boolean;
  id: string;
  describedBy?: string;
  invalid: boolean;
}) {
  const c = def.config;
  const a11y = { id, "aria-describedby": describedBy, "aria-invalid": invalid || undefined, disabled };
  const str = typeof value === "string" ? value : value == null ? "" : String(value);
  const list = Array.isArray(value) ? (value as string[]) : [];

  switch (def.type) {
    case "TEXT":
      return <input {...a11y} className={inputClass} value={str} maxLength={c.maxLength ?? 300} placeholder={c.placeholder} onChange={(e) => onChange(e.target.value)} />;
    case "TEXTAREA":
      return <textarea {...a11y} className={inputClass} rows={4} value={str} maxLength={c.maxLength ?? 5000} placeholder={c.placeholder} onChange={(e) => onChange(e.target.value)} />;
    case "RICH_TEXT":
      return <RichTextEditor id={id} label={def.label} describedBy={describedBy} value={str} onChange={onChange} disabled={disabled} minHeight={140} />;
    case "URL":
    case "VIDEO_URL":
      return <input {...a11y} type="url" inputMode="url" className={inputClass} value={str} placeholder={def.type === "VIDEO_URL" ? "https://www.youtube.com/watch?v=…" : (c.placeholder ?? "https://")} onChange={(e) => onChange(e.target.value)} />;
    case "EMAIL":
      return <input {...a11y} type="email" className={inputClass} value={str} onChange={(e) => onChange(e.target.value)} />;
    case "NUMBER":
      return (
        <input
          {...a11y}
          type="number"
          className={`${inputClass} max-w-40`}
          value={typeof value === "number" ? value : ""}
          min={c.min}
          max={c.max}
          step={c.step ?? "any"}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        />
      );
    case "PRICE": {
      const p = value as { amount: number; currency: string } | null;
      const currency = c.currency ?? p?.currency ?? "USD";
      return (
        <div className="flex max-w-48 items-center gap-2">
          <input
            {...a11y}
            type="number"
            min={0}
            step="0.01"
            className={inputClass}
            value={p?.amount ?? ""}
            onChange={(e) => onChange(e.target.value === "" ? null : { amount: Number(e.target.value), currency })}
          />
          <span className="text-sm text-zinc-500">{currency}</span>
        </div>
      );
    }
    case "DATE":
      return <input {...a11y} type="date" className={`${inputClass} max-w-48`} value={str} onChange={(e) => onChange(e.target.value)} />;
    case "COLOR":
      return (
        <div className="flex items-center gap-2">
          <input type="color" aria-label={`${def.label} picker`} disabled={disabled} value={/^#[0-9a-f]{6}$/i.test(str) ? str : "#000000"} onChange={(e) => onChange(e.target.value)} className="h-9 w-12 rounded border border-zinc-300" />
          <input {...a11y} className={`${inputClass} max-w-32 font-mono`} value={str} placeholder="#1F2937" onChange={(e) => onChange(e.target.value)} />
        </div>
      );
    case "BOOLEAN":
      return (
        <div className="flex items-center gap-3">
          <Toggle id={id} checked={!!value} onChange={onChange} label={def.label} disabled={disabled} />
          <span className="text-sm text-zinc-600">{value ? "On" : "Off"}</span>
        </div>
      );
    case "SELECT":
      if (c.multiple) return <ChoiceList choices={c.choices ?? []} value={list} onChange={onChange} disabled={disabled} type="checkbox" name={id} />;
      return (
        <select {...a11y} className={`${inputClass} max-w-sm`} value={str} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">Choose…</option>
          {(c.choices ?? []).map((ch) => (
            <option key={ch.value} value={ch.value}>
              {ch.label}
            </option>
          ))}
        </select>
      );
    case "RADIO":
      return <ChoiceList choices={c.choices ?? []} value={str ? [str] : []} onChange={(v) => onChange((v as string[])[0] ?? null)} disabled={disabled} type="radio" name={id} />;
    case "CHECKBOX":
      return <ChoiceList choices={c.choices ?? []} value={list} onChange={onChange} disabled={disabled} type="checkbox" name={id} />;
    case "IMAGE":
    case "FILE":
      return (
        <MediaField
          id={id}
          siteId={ctx.siteId}
          label={def.label}
          value={str ? [str] : []}
          onChange={(ids) => onChange(ids[0] ?? null)}
          assets={ctx.assets}
          kind={def.type === "IMAGE" ? "image" : c.accept === "video" ? "video" : c.accept === "document" ? "document" : "file"}
          disabled={disabled}
          canUpload={ctx.canUpload}
          onUploaded={ctx.onUploaded}
        />
      );
    case "GALLERY":
      return <MediaField siteId={ctx.siteId} label={def.label} value={list} onChange={onChange} assets={ctx.assets} kind="image" multiple disabled={disabled} canUpload={ctx.canUpload} onUploaded={ctx.onUploaded} />;
    case "RELATION": {
      const allowed = c.postTypeIds ?? [];
      const options = ctx.entries.filter((e) => !allowed.length || allowed.includes(e.postTypeId));
      if (c.multiple) return <ChoiceList choices={options.map((o) => ({ value: o.id, label: `${o.title} · ${o.typeLabel}` }))} value={list} onChange={onChange} disabled={disabled} type="checkbox" name={id} scroll />;
      return (
        <select {...a11y} className={`${inputClass} max-w-md`} value={str} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">None</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.title} · {o.typeLabel}
            </option>
          ))}
        </select>
      );
    }
    case "USER":
      return (
        <select {...a11y} className={`${inputClass} max-w-sm`} value={str} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">Nobody</option>
          {ctx.members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      );
    case "TAXONOMY": {
      const terms = ctx.terms.filter((x) => x.taxonomyId === c.taxonomyId);
      if (!terms.length) return <p className="text-sm text-zinc-500">No terms yet.</p>;
      return <ChoiceList choices={terms.map((x) => ({ value: x.id, label: `${"— ".repeat(x.depth)}${x.name}` }))} value={list} onChange={onChange} disabled={disabled} type="checkbox" name={id} scroll />;
    }
    case "REPEATER":
      return <Repeater def={def} rows={(Array.isArray(value) ? value : []) as RepeaterRow[]} onChange={onChange} ctx={ctx} disabled={disabled} />;
    case "FLEXIBLE":
      return <Flexible def={def} blocks={(Array.isArray(value) ? value : []) as FlexibleBlock[]} onChange={onChange} ctx={ctx} disabled={disabled} />;
  }
}

function ChoiceList({
  choices,
  value,
  onChange,
  disabled,
  type,
  name,
  scroll,
}: {
  choices: { value: string; label: string }[];
  value: string[];
  onChange: (v: unknown) => void;
  disabled?: boolean;
  type: "checkbox" | "radio";
  name: string;
  scroll?: boolean;
}) {
  return (
    <div className={`grid gap-1.5 sm:grid-cols-2 ${scroll ? "max-h-56 overflow-y-auto rounded-lg border border-zinc-200 p-2" : ""}`}>
      {choices.map((ch) => {
        const on = value.includes(ch.value);
        return (
          <label key={ch.value} className="flex items-center gap-2 text-sm text-zinc-800">
            <input
              type={type}
              name={name}
              disabled={disabled}
              checked={on}
              onChange={() => onChange(type === "radio" ? [ch.value] : on ? value.filter((x) => x !== ch.value) : [...value, ch.value])}
              className="h-4 w-4 border-zinc-300"
            />
            {ch.label}
          </label>
        );
      })}
    </div>
  );
}

function RowShell({ title, index, count, onMove, onRemove, disabled, children }: { title: string; index: number; count: number; onMove: (d: -1 | 1) => void; onRemove: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <li className="rounded-lg border border-zinc-200 bg-zinc-50/60">
      <div className="flex items-center justify-between gap-2 border-b border-zinc-200 px-3 py-1.5">
        <span className="text-xs font-medium text-zinc-600">{title}</span>
        {!disabled && (
          <div className="flex gap-1">
            <Button size="sm" tone="ghost" disabled={index === 0} onClick={() => onMove(-1)} aria-label={`Move ${title} up`}>↑</Button>
            <Button size="sm" tone="ghost" disabled={index === count - 1} onClick={() => onMove(1)} aria-label={`Move ${title} down`}>↓</Button>
            <Button size="sm" tone="ghost" onClick={onRemove} aria-label={`Remove ${title}`} className="text-red-700">Remove</Button>
          </div>
        )}
      </div>
      <div className="space-y-4 p-3">{children}</div>
    </li>
  );
}

function moveItem<T>(list: T[], i: number, d: -1 | 1) {
  const next = [...list];
  [next[i], next[i + d]] = [next[i + d], next[i]];
  return next;
}

function Repeater({ def, rows, onChange, ctx, disabled }: { def: FieldDef; rows: RepeaterRow[]; onChange: (v: unknown) => void; ctx: FieldContext; disabled?: boolean }) {
  const subs = def.config.subFields ?? [];
  const max = def.config.maxRows ?? 200;
  const blank = () => Object.fromEntries(subs.map((s) => [s.key, emptyValue(s)]));
  return (
    <div className="space-y-2">
      <ol className="space-y-2">
        {rows.map((row, i) => (
          <RowShell key={i} title={`Row ${i + 1}`} index={i} count={rows.length} disabled={disabled} onMove={(d) => onChange(moveItem(rows, i, d))} onRemove={() => onChange(rows.filter((_, j) => j !== i))}>
            {subs.map((sf) => (
              <FieldInput key={sf.key} def={sf} value={row[sf.key] ?? emptyValue(sf)} ctx={ctx} disabled={disabled} onChange={(v) => onChange(rows.map((r, j) => (j === i ? { ...r, [sf.key]: v } : r)))} />
            ))}
          </RowShell>
        ))}
      </ol>
      {!disabled && rows.length < max && (
        <Button size="sm" onClick={() => onChange([...rows, blank()])}>
          + Add row<span className="sr-only"> to {def.label}</span>
        </Button>
      )}
    </div>
  );
}

function Flexible({ def, blocks, onChange, ctx, disabled }: { def: FieldDef; blocks: FlexibleBlock[]; onChange: (v: unknown) => void; ctx: FieldContext; disabled?: boolean }) {
  const layouts = def.config.layouts ?? [];
  const addId = useId();
  return (
    <div className="space-y-2">
      <ol className="space-y-2">
        {blocks.map((block, i) => {
          const layout = layouts.find((l) => l.key === block.layout);
          return (
            <RowShell key={i} title={`${i + 1}. ${layout?.label ?? block.layout}`} index={i} count={blocks.length} disabled={disabled} onMove={(d) => onChange(moveItem(blocks, i, d))} onRemove={() => onChange(blocks.filter((_, j) => j !== i))}>
              {(layout?.subFields ?? []).map((sf) => (
                <FieldInput
                  key={sf.key}
                  def={sf}
                  value={block.values[sf.key] ?? emptyValue(sf)}
                  ctx={ctx}
                  disabled={disabled}
                  onChange={(v) => onChange(blocks.map((b, j) => (j === i ? { ...b, values: { ...b.values, [sf.key]: v } } : b)))}
                />
              ))}
            </RowShell>
          );
        })}
      </ol>
      {!disabled && (
        <div className="flex items-center gap-2">
          <label htmlFor={addId} className="text-sm text-zinc-600">Add block</label>
          <select
            id={addId}
            value=""
            onChange={(e) => {
              const layout = layouts.find((l) => l.key === e.target.value);
              if (layout) onChange([...blocks, { layout: layout.key, values: Object.fromEntries(layout.subFields.map((s) => [s.key, emptyValue(s)])) }]);
            }}
            className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm"
          >
            <option value="">Choose a layout…</option>
            {layouts.map((l) => (
              <option key={l.key} value={l.key}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
