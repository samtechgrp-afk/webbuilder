"use client";

import { useState, type ReactNode } from "react";
import { safeCssValue } from "@/lib/design/css-values";
import { CORE_COLORS, FONT_CHOICES, PRESETS, PRESET_KEYS } from "@/lib/design/presets";
import { fontFamilyOptions, type FontFamilyOption, type SiteFontFace } from "@/lib/design/fonts";
import { applyPreset, fluidTypeScale, TYPE_STEPS, type DesignTokens, type TokenGroup, type TypeScale, type TypeStep } from "@/lib/design/tokens";

/**
 * The global tokens editor, shared by the Designer Mode drawer and the
 * design-system page. It edits a working copy and reports every change at
 * once, so the canvas or preview restyles as you drag a colour picker; the
 * parent decides when to save.
 */

export const DEFAULT_TYPE_SCALE: TypeScale = { minBase: 1, maxBase: 1.0625, minRatio: 1.2, maxRatio: 1.25, minWidth: 360, maxWidth: 1280 };
const RATIOS = [
  ["1.125", "Major second"],
  ["1.2", "Minor third"],
  ["1.25", "Major third"],
  ["1.333", "Perfect fourth"],
  ["1.414", "Augmented fourth"],
  ["1.5", "Perfect fifth"],
] as const;

const inputCls =
  "w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 aria-[invalid=true]:border-red-400 aria-[invalid=true]:bg-red-50";

export function TokensPanel({
  value,
  onChange,
  disabled,
  fonts,
  onManageFonts,
}: {
  value: DesignTokens;
  onChange: (next: DesignTokens) => void;
  disabled?: boolean;
  /** The site's custom fonts; the global font tokens can use them. */
  fonts?: SiteFontFace[];
  onManageFonts?: () => void;
}) {
  const custom = fontFamilyOptions(fonts);
  const setGroup = (group: TokenGroup, key: string, v: string | undefined) => {
    const next = { ...(value[group] ?? {}) };
    if (v === undefined) delete next[key];
    else next[key] = v;
    onChange({ ...value, [group]: next, preset: value.preset && value.preset !== "custom" ? `${value.preset.replace(/ \(edited\)$/, "")} (edited)` : value.preset });
  };
  const set = (patch: Partial<DesignTokens>) => onChange({ ...value, ...patch });

  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-1">
      <Section title="Presets">
        <div className="grid gap-2">
          {PRESET_KEYS.map((key) => {
            const p = PRESETS[key];
            const c = p.tokens.colors!;
            const active = value.preset === key;
            return (
              <button
                key={key}
                type="button"
                data-preset={key}
                aria-pressed={active}
                onClick={() => onChange(applyPreset(value, p.tokens))}
                className={`flex items-center gap-3 rounded-lg border p-2 text-left transition hover:border-zinc-400 ${active ? "border-indigo-500 ring-2 ring-indigo-500/20" : "border-zinc-200"}`}
              >
                <span className="flex h-10 w-14 shrink-0 items-end gap-1 rounded-md p-1.5" style={{ background: c.background, boxShadow: `inset 0 0 0 1px ${c.border}` }}>
                  <span className="h-3 w-3 rounded-full" style={{ background: c.primary }} />
                  <span className="h-3 w-3 rounded-full" style={{ background: c.accent }} />
                  <span className="h-2 flex-1 rounded-sm" style={{ background: c["surface-high"], boxShadow: `0 0 0 1px ${c.border}` }} />
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-zinc-900">{p.label}</span>
                  <span className="block text-[11px] leading-snug text-zinc-500">{p.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Colours">
        {CORE_COLORS.map(([key, label]) => (
          <ColorRow key={key} name={key} label={label} value={value.colors?.[key]} onChange={(v) => setGroup("colors", key, v)} />
        ))}
        {Object.keys(value.colors ?? {})
          .filter((k) => !CORE_COLORS.some(([c]) => c === k))
          .map((key) => (
            <ColorRow key={key} name={key} label={key} value={value.colors?.[key]} onChange={(v) => setGroup("colors", key, v)} removable />
          ))}
        <AddToken group="colors" placeholder="#C9A66B" onAdd={(k, v) => setGroup("colors", k, v)} />
      </Section>

      <Section title="Typography">
        <div className="grid grid-cols-1 gap-2">
          {(["heading", "display", "body", "mono"] as const).map((key) => (
            <FontSelect key={key} label={`${key[0].toUpperCase()}${key.slice(1)} font`} value={value.fonts?.[key]} custom={custom} onChange={(v) => setGroup("fonts", key, v)} />
          ))}
          {onManageFonts && (
            <button type="button" onClick={onManageFonts} className="justify-self-start text-[11px] text-indigo-600 hover:underline" data-open-font-manager="">
              {custom.length ? `Manage custom fonts (${custom.length})…` : "Upload or link custom fonts…"}
            </button>
          )}
        </div>
        <TypeScaleEditor scale={value.typeScale} onChange={(typeScale) => set({ typeScale })} />
        <GroupRows title="Line height" group="lineHeights" value={value} onChange={setGroup} placeholder="1.5" suggested={["tight", "body"]} />
        <GroupRows title="Letter spacing" group="letterSpacing" value={value} onChange={setGroup} placeholder="-0.02em" suggested={["tight", "wide"]} />
      </Section>

      <Section title="Spacing">
        <label className="block">
          <span className="mb-0.5 block text-[11px] text-zinc-500">Grid unit (--space-1 … --space-32)</span>
          <select
            className={inputCls}
            aria-label="Spacing grid"
            value={value.spaceUnit ?? ""}
            onChange={(e) => set({ spaceUnit: e.target.value ? Number(e.target.value) : undefined })}
          >
            <option value="">Off (named spacing only)</option>
            <option value="4">4pt</option>
            <option value="8">8pt</option>
          </select>
        </label>
        {value.spaceUnit ? (
          <div className="space-y-1" aria-hidden>
            {[1, 2, 3, 4, 6, 8, 12, 16].map((n) => (
              <div key={n} className="flex items-center gap-2 text-[10px] text-zinc-500">
                <span className="w-14 font-mono">space-{n}</span>
                <span className="h-1.5 rounded-full bg-indigo-400" style={{ width: Math.min(n * value.spaceUnit!, 180) }} />
                <span>{n * value.spaceUnit!}px</span>
              </div>
            ))}
          </div>
        ) : null}
        <GroupRows title="Named spacing" group="spacing" value={value} onChange={setGroup} placeholder="1.5rem" />
      </Section>

      <Section title="Shape & depth" defaultOpen={false}>
        <GroupRows title="Radius" group="radii" value={value} onChange={setGroup} placeholder="8px" suggested={["sm", "md", "lg"]} />
        <GroupRows title="Elevation (shadows)" group="shadows" value={value} onChange={setGroup} placeholder="0 1px 2px rgba(0,0,0,.1)" suggested={["sm", "md", "lg"]} />
      </Section>

      <Section title="Glass & glow" defaultOpen={false}>
        <GroupRows title="Backdrop blur" group="blur" value={value} onChange={setGroup} placeholder="16px" suggested={["sm", "md", "lg"]} />
        <GroupRows title="Border glow" group="glows" value={value} onChange={setGroup} placeholder="0 0 0 1px rgba(94,106,210,.5)" />
        <GroupRows title="Ambient glow" group="ambient" value={value} onChange={setGroup} placeholder="radial-gradient(…)" />
      </Section>
    </fieldset>
  );
}

function Section({ title, children, defaultOpen = true }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-b border-zinc-100 last:border-0">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between py-2.5 text-left">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{title}</span>
        <span aria-hidden className="text-xs text-zinc-400">{open ? "−" : "+"}</span>
      </button>
      {open && <div className="space-y-2.5 pb-3">{children}</div>}
    </section>
  );
}

const HEX = /^#[0-9a-f]{6}$/i;
const expandHex = (v?: string) => (v && /^#[0-9a-f]{3}$/i.test(v) ? `#${[...v.slice(1)].map((c) => c + c).join("")}` : v);

/** A swatch picker plus a text field for any CSS colour; both apply as you go. */
function ColorRow({ name, label, value, onChange, removable }: { name: string; label: string; value?: string; onChange: (v: string | undefined) => void; removable?: boolean }) {
  const [draft, setDraft] = useState(value ?? "");
  const [last, setLast] = useState(value);
  if (value !== last) {
    setLast(value);
    setDraft(value ?? "");
  }
  const hex = expandHex(value);
  const valid = !draft || safeCssValue(draft) !== null;
  return (
    <div className="flex items-center gap-2" data-token={`colors.${name}`}>
      <input
        type="color"
        aria-label={`${label} colour picker`}
        value={hex && HEX.test(hex) ? hex : "#000000"}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        className="h-7 w-7 shrink-0 cursor-pointer rounded border border-zinc-300 bg-white p-0.5"
      />
      <span className="w-24 shrink-0 truncate text-[11px] text-zinc-600" title={`--color-${name}`}>
        {label}
      </span>
      <input
        className={inputCls}
        aria-label={`${label} colour`}
        aria-invalid={!valid}
        value={draft}
        placeholder="unset"
        onChange={(e) => {
          setDraft(e.target.value);
          const v = e.target.value.trim();
          if (!v) onChange(undefined);
          else if (safeCssValue(v) && (HEX.test(v) || /^#[0-9a-f]{3}$/i.test(v) || /\)$/.test(v) || /^[a-z]+$/i.test(v))) onChange(v);
        }}
      />
      {removable && (
        <button type="button" onClick={() => onChange(undefined)} aria-label={`Remove ${label}`} className="text-xs text-zinc-400 hover:text-red-600">
          ×
        </button>
      )}
    </div>
  );
}

function FontSelect({ label, value, custom, onChange }: { label: string; value?: string; custom: FontFamilyOption[]; onChange: (v: string | undefined) => void }) {
  const known = FONT_CHOICES.some((f) => f.value === value) || custom.some((f) => f.value === value);
  return (
    <label className="flex items-center gap-2">
      <span className="w-24 shrink-0 text-[11px] text-zinc-600">{label}</span>
      <select className={inputCls} aria-label={label} value={value ?? ""} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">Inherit</option>
        {custom.length > 0 && (
          <optgroup label="Custom fonts">
            {custom.map((f) => (
              <option key={f.value} value={f.value}>
                {f.family}
              </option>
            ))}
          </optgroup>
        )}
        <optgroup label="Built-in">
          {FONT_CHOICES.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </optgroup>
        {value && !known && <option value={value}>Custom: {value.slice(0, 28)}</option>}
      </select>
    </label>
  );
}

function TypeScaleEditor({ scale, onChange }: { scale?: TypeScale; onChange: (s: TypeScale | undefined) => void }) {
  if (!scale) {
    return (
      <button type="button" onClick={() => onChange(DEFAULT_TYPE_SCALE)} className="w-full rounded-md border border-dashed border-zinc-300 py-2 text-xs text-zinc-600 hover:border-zinc-400">
        Use a fluid type scale
      </button>
    );
  }
  const steps = fluidTypeScale(scale);
  const num = (k: keyof TypeScale, label: string, step: number) => (
    <label className="block">
      <span className="mb-0.5 block text-[11px] text-zinc-500">{label}</span>
      <input
        type="number"
        step={step}
        className={inputCls}
        aria-label={label}
        value={scale[k]}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n) && n > 0) onChange({ ...scale, [k]: n });
        }}
      />
    </label>
  );
  const ratio = (k: "minRatio" | "maxRatio", label: string) => (
    <label className="block">
      <span className="mb-0.5 block text-[11px] text-zinc-500">{label}</span>
      <select className={inputCls} aria-label={label} value={String(scale[k])} onChange={(e) => onChange({ ...scale, [k]: Number(e.target.value) })}>
        {!RATIOS.some(([r]) => Number(r) === scale[k]) && <option value={String(scale[k])}>{scale[k]}</option>}
        {RATIOS.map(([r, name]) => (
          <option key={r} value={r}>
            {r} · {name}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <div className="space-y-2 rounded-lg bg-zinc-50 p-2.5" data-type-scale>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-zinc-700">Fluid type scale</span>
        <button type="button" onClick={() => onChange(undefined)} className="text-[11px] text-zinc-400 hover:text-zinc-900">
          Turn off
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {num("minBase", `Body at ${scale.minWidth}px (rem)`, 0.0625)}
        {num("maxBase", `Body at ${scale.maxWidth}px (rem)`, 0.0625)}
        {ratio("minRatio", "Ratio, small screens")}
        {ratio("maxRatio", "Ratio, large screens")}
        {num("minWidth", "Smallest width (px)", 10)}
        {num("maxWidth", "Largest width (px)", 10)}
      </div>
      <ul className="space-y-0.5">
        {(Object.keys(TYPE_STEPS) as TypeStep[]).reverse().map((step) => (
          <li key={step} className="flex items-baseline justify-between gap-2 text-[10px]">
            <span className="font-mono text-zinc-700">--text-{step}</span>
            <code className="truncate text-zinc-400" title={steps[step]} data-step={step}>
              {steps[step]}
            </code>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Rows for an open-ended group: edit, remove, and add named tokens. */
function GroupRows({
  title,
  group,
  value,
  onChange,
  placeholder,
  suggested = [],
}: {
  title: string;
  group: TokenGroup;
  value: DesignTokens;
  onChange: (group: TokenGroup, key: string, v: string | undefined) => void;
  placeholder: string;
  suggested?: string[];
}) {
  const entries = value[group] ?? {};
  const names = [...new Set([...suggested, ...Object.keys(entries)])];
  return (
    <div>
      <span className="mb-1 block text-[11px] font-medium text-zinc-700">{title}</span>
      <div className="space-y-1">
        {names.map((name) => (
          <TextToken key={name} group={group} name={name} value={entries[name]} placeholder={placeholder} onChange={(v) => onChange(group, name, v)} />
        ))}
        <AddToken group={group} placeholder={placeholder} onAdd={(k, v) => onChange(group, k, v)} />
      </div>
    </div>
  );
}

function TextToken({ group, name, value, placeholder, onChange }: { group: TokenGroup; name: string; value?: string; placeholder: string; onChange: (v: string | undefined) => void }) {
  const [draft, setDraft] = useState(value ?? "");
  const [last, setLast] = useState(value);
  if (value !== last) {
    setLast(value);
    setDraft(value ?? "");
  }
  const valid = !draft.trim() || safeCssValue(draft) !== null;
  return (
    <label className="flex items-center gap-2" data-token={`${group}.${name}`}>
      <span className="w-16 shrink-0 truncate font-mono text-[10px] text-zinc-600">{name}</span>
      <input
        className={inputCls}
        aria-label={`${group} ${name}`}
        aria-invalid={!valid}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => {
          setDraft(e.target.value);
          const v = e.target.value.trim();
          if (!v) onChange(undefined);
          else if (safeCssValue(v)) onChange(v);
        }}
      />
    </label>
  );
}

function AddToken({ group, placeholder, onAdd }: { group: TokenGroup; placeholder: string; onAdd: (name: string, value: string) => void }) {
  const [name, setName] = useState("");
  const [val, setVal] = useState("");
  const okName = /^[a-z][a-z0-9-]{0,31}$/.test(name);
  const ok = okName && safeCssValue(val) !== null;
  return (
    <div className="flex items-center gap-1.5">
      <input className={`${inputCls} w-20 shrink-0`} aria-label={`New ${group} token name`} placeholder="name" value={name} onChange={(e) => setName(e.target.value.toLowerCase())} />
      <input className={inputCls} aria-label={`New ${group} token value`} placeholder={placeholder} value={val} onChange={(e) => setVal(e.target.value)} />
      <button
        type="button"
        disabled={!ok}
        onClick={() => {
          onAdd(name, val.trim());
          setName("");
          setVal("");
        }}
        className="shrink-0 rounded-md border border-zinc-300 px-2 py-1 text-[11px] hover:bg-zinc-50 disabled:opacity-40"
      >
        Add
      </button>
    </div>
  );
}
