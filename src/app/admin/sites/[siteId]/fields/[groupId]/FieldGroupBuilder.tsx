"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type DragEvent } from "react";
import { Button, Card, Field, Notice, Toggle, inputClass } from "@/components/cms/ui";
import { FIELD_GROUPS, FIELD_TYPES, FIELD_TYPE_INFO, MAX_FIELD_DEPTH, type FieldConfig, type FieldDef, type FieldType } from "@/lib/cms/fields";
import { LOCATION_PARAMS, type LocationParam, type LocationRule } from "@/lib/cms/location";
import { keyify } from "@/lib/cms/slug";
import { deleteFieldGroupAction, saveFieldGroupAction } from "@/server/cms-actions";

/** A field being edited, with a client-only id for keys, selection and drag and drop. */
type Draft = Omit<FieldDef, "config"> & { uid: string; keyTouched?: boolean; config: DraftConfig };
type DraftConfig = Omit<FieldConfig, "subFields" | "layouts"> & { subFields?: Draft[]; layouts?: { uid: string; key: string; label: string; subFields: Draft[] }[] };

interface Options {
  postTypes: { id: string; label: string }[];
  templates: { key: string; label: string }[];
  taxonomies: { id: string; label: string }[];
  terms: { id: string; label: string }[];
  pages: { id: string; label: string }[];
}

let uidSeq = 0;
const uid = () => `f${++uidSeq}_${Math.random().toString(36).slice(2, 6)}`;

function toDraft(def: FieldDef): Draft {
  return {
    ...def,
    uid: uid(),
    keyTouched: true,
    config: {
      ...def.config,
      subFields: def.config.subFields?.map(toDraft),
      layouts: def.config.layouts?.map((l) => ({ ...l, uid: uid(), subFields: l.subFields.map(toDraft) })),
    },
  };
}

function fromDraft(d: Draft): FieldDef {
  const { uid: _u, keyTouched: _k, ...rest } = d;
  void _u;
  void _k;
  const config: FieldConfig = { ...d.config, subFields: d.config.subFields?.map(fromDraft), layouts: d.config.layouts?.map((l) => ({ key: l.key, label: l.label, subFields: l.subFields.map(fromDraft) })) };
  for (const k of Object.keys(config) as (keyof FieldConfig)[]) if (config[k] === undefined) delete config[k];
  return { ...rest, config };
}

function defaultConfig(type: FieldType): DraftConfig {
  switch (type) {
    case "SELECT":
    case "RADIO":
    case "CHECKBOX":
      return { choices: [{ value: "option_1", label: "Option 1" }, { value: "option_2", label: "Option 2" }] };
    case "PRICE":
      return { currency: "USD" };
    case "NUMBER":
      return {};
    case "REPEATER":
      return { subFields: [newField("TEXT", [], "Item")] };
    case "FLEXIBLE":
      return { layouts: [{ uid: uid(), key: "text_block", label: "Text block", subFields: [newField("RICH_TEXT", [], "Text")] }] };
    default:
      return {};
  }
}

function newField(type: FieldType, siblings: Draft[], label = FIELD_TYPE_INFO[type].label): Draft {
  let key = keyify(label) || "field";
  for (let i = 2; siblings.some((s) => s.key === key); i++) key = `${keyify(label)}_${i}`;
  return { uid: uid(), key, label, type, required: false, clientEditable: true, instructions: "", config: defaultConfig(type) };
}

export function FieldGroupBuilder({
  siteId,
  initial,
  options,
  justCreated,
}: {
  siteId: string;
  justCreated?: boolean;
  initial: { id?: string; label: string; description: string; active: boolean; location: unknown; fields: FieldDef[] };
  options: Options;
}) {
  const router = useRouter();
  const [label, setLabel] = useState(initial.label);
  const [description, setDescription] = useState(initial.description);
  const [active, setActive] = useState(initial.active);
  const [location, setLocation] = useState<LocationRule[][]>(Array.isArray(initial.location) ? (initial.location as LocationRule[][]) : []);
  const [fields, setFields] = useState<Draft[]>(() => initial.fields.map(toDraft));
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(!!justCreated);
  const [pending, start] = useTransition();
  const [paletteDrag, setPaletteDrag] = useState<FieldType | null>(null);

  const save = () =>
    start(async () => {
      setError(null);
      setSaved(false);
      const res = await saveFieldGroupAction({ siteId, id: initial.id ?? null, label, description, active, location, fields: fields.map(fromDraft) });
      if (!res.ok) return setError(res.error);
      setSaved(true);
      if (!initial.id) router.replace(`/admin/sites/${siteId}/fields/${res.id}?created=1`);
      else router.refresh();
    });

  const addTop = (type: FieldType, index = fields.length) => {
    const f = newField(type, fields);
    setFields((list) => [...list.slice(0, index), f, ...list.slice(index)]);
    setOpen(f.uid);
  };

  return (
    <main className="mx-auto max-w-7xl px-6 py-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href={`/admin/sites/${siteId}/fields`} className="text-sm text-zinc-500 hover:text-zinc-900">← Field groups</Link>
          <h1 className="mt-1 text-xl font-semibold text-zinc-900">{initial.id ? label || "Field group" : "New field group"}</h1>
        </div>
        <div className="flex items-center gap-2">
          {initial.id && (
            <Button
              tone="danger"
              disabled={pending}
              onClick={() => {
                if (!confirm("Delete this field group and every value saved in its fields?")) return;
                start(async () => {
                  const res = await deleteFieldGroupAction({ siteId, id: initial.id! });
                  if (!res.ok) return setError(res.error);
                  router.push(`/admin/sites/${siteId}/fields`);
                });
              }}
            >
              Delete
            </Button>
          )}
          <Button tone="primary" onClick={save} disabled={pending} data-save-group="">
            {pending ? "Saving…" : "Save field group"}
          </Button>
        </div>
      </div>
      <div className="mb-4 space-y-2">
        {error && <Notice tone="error" onDismiss={() => setError(null)}>{error}</Notice>}
        {saved && !error && <Notice tone="success" onDismiss={() => setSaved(false)}>Saved. The fields now appear on matching entries.</Notice>}
      </div>

      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside aria-label="Field types" className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <p className="text-xs text-zinc-500">Drag a type into the list, or click to add it at the end.</p>
          {FIELD_GROUPS.map((group) => (
            <div key={group}>
              <h2 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">{group}</h2>
              <ul className="space-y-1">
                {FIELD_TYPES.filter((ft) => FIELD_TYPE_INFO[ft].group === group).map((ft) => (
                  <li key={ft}>
                    <button
                      type="button"
                      draggable
                      data-field-type={ft}
                      title={FIELD_TYPE_INFO[ft].hint}
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = "copy";
                        e.dataTransfer.setData("text/plain", ft);
                        setPaletteDrag(ft);
                      }}
                      onDragEnd={() => setPaletteDrag(null)}
                      onClick={() => addTop(ft)}
                      className="w-full cursor-grab rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-left text-sm text-zinc-700 hover:border-zinc-400 active:cursor-grabbing"
                    >
                      {FIELD_TYPE_INFO[ft].label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </aside>

        <div className="space-y-6">
          <Card>
            <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
              <Field label="Group name" required>
                {(a) => <input {...a} name="groupLabel" className={inputClass} value={label} placeholder="Case study details" onChange={(e) => setLabel(e.target.value)} />}
              </Field>
              <div className="flex items-end gap-2 pb-2">
                <Toggle checked={active} onChange={setActive} label="Active" />
                <span className="text-sm text-zinc-700">Active</span>
              </div>
            </div>
            <Field label="Description" className="mt-4" hint="Shown above the fields on the entry form.">
              {(a) => <input {...a} className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} />}
            </Field>
          </Card>

          <Card title="Fields">
            <FieldList
              fields={fields}
              onChange={setFields}
              open={open}
              setOpen={setOpen}
              depth={1}
              options={options}
              paletteDrag={paletteDrag}
              onPaletteDrop={(type, index) => {
                addTop(type, index);
                setPaletteDrag(null);
              }}
            />
          </Card>

          <Card title="Location rules">
            <LocationEditor rules={location} onChange={setLocation} options={options} />
          </Card>
        </div>
      </div>
    </main>
  );
}

function FieldList({
  fields,
  onChange,
  open,
  setOpen,
  depth,
  options,
  paletteDrag,
  onPaletteDrop,
}: {
  fields: Draft[];
  onChange: (f: Draft[]) => void;
  open: string | null;
  setOpen: (uid: string | null) => void;
  depth: number;
  options: Options;
  paletteDrag?: FieldType | null;
  onPaletteDrop?: (type: FieldType, index: number) => void;
}) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [adding, setAdding] = useState<FieldType | "">("");

  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to > fields.length) return;
    const next = [...fields];
    const [item] = next.splice(from, 1);
    next.splice(to > from ? to - 1 : to, 0, item);
    onChange(next);
  };
  const dropAt = (index: number) => (e: DragEvent) => {
    if (!dragging && !paletteDrag) return;
    e.preventDefault();
    e.stopPropagation();
    if (paletteDrag && onPaletteDrop) onPaletteDrop(paletteDrag, index);
    else if (dragging) move(fields.findIndex((f) => f.uid === dragging), index);
    setDragging(null);
    setOver(null);
  };
  const allowDrop = (index: number) => (e: DragEvent) => {
    if (!dragging && !(paletteDrag && onPaletteDrop)) return;
    e.preventDefault();
    e.stopPropagation();
    setOver(index);
  };

  return (
    <div className="space-y-2">
      <ol
        className="space-y-1.5"
        aria-label={depth === 1 ? "Fields" : "Sub-fields"}
        onDragOver={allowDrop(fields.length)}
        onDrop={dropAt(fields.length)}
        onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setOver(null)}
      >
        {fields.map((f, i) => (
          <li key={f.uid} onDragOver={allowDrop(i)} onDrop={dropAt(i)} className="relative" data-field-row={f.key}>
            {over === i && <div aria-hidden className="absolute -top-1 left-0 right-0 h-0.5 rounded bg-indigo-500" />}
            <div className={`rounded-lg border bg-white ${open === f.uid ? "border-zinc-400 shadow-sm" : "border-zinc-200"} ${dragging === f.uid ? "opacity-40" : ""}`}>
              <div className="flex items-center gap-2 px-3 py-2">
                <span
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", f.uid);
                    setDragging(f.uid);
                  }}
                  onDragEnd={() => {
                    setDragging(null);
                    setOver(null);
                  }}
                  aria-hidden
                  className="cursor-grab select-none px-1 text-zinc-400 active:cursor-grabbing"
                  title="Drag to reorder"
                >
                  ⋮⋮
                </span>
                <button type="button" onClick={() => setOpen(open === f.uid ? null : f.uid)} aria-expanded={open === f.uid} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <span className="truncate text-sm font-medium text-zinc-900">{f.label || "Untitled field"}</span>
                  <span className="font-mono text-xs text-zinc-400">{f.key}</span>
                  <span className="ml-auto rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-600">{FIELD_TYPE_INFO[f.type].label}</span>
                  {f.required && <span className="text-[11px] text-red-700">required</span>}
                  {depth === 1 && f.clientEditable === false && <span className="text-[11px] text-zinc-500">🔒 designer only</span>}
                </button>
                <Button size="sm" tone="ghost" disabled={i === 0} onClick={() => move(i, i - 1)} aria-label={`Move ${f.label} up`}>↑</Button>
                <Button size="sm" tone="ghost" disabled={i === fields.length - 1} onClick={() => move(i, i + 2)} aria-label={`Move ${f.label} down`}>↓</Button>
                <Button size="sm" tone="ghost" className="text-red-700" onClick={() => onChange(fields.filter((x) => x.uid !== f.uid))} aria-label={`Delete ${f.label}`}>✕</Button>
              </div>
              {open === f.uid && (
                <div className="border-t border-zinc-100 p-4">
                  <FieldSettings field={f} siblings={fields} depth={depth} options={options} onChange={(next) => onChange(fields.map((x) => (x.uid === f.uid ? next : x)))} />
                </div>
              )}
            </div>
          </li>
        ))}
        {over === fields.length && <li aria-hidden className="h-0.5 rounded bg-indigo-500" />}
        {!fields.length && (
          <li className={`rounded-lg border-2 border-dashed px-4 py-8 text-center text-sm ${paletteDrag ? "border-indigo-400 bg-indigo-50/50 text-indigo-700" : "border-zinc-200 text-zinc-500"}`}>
            {depth === 1 ? "Drag field types here, or click one on the left." : "No sub-fields yet."}
          </li>
        )}
      </ol>
      {depth > 1 && (
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor={`add-${depth}-${fields[0]?.uid ?? "x"}`}>Add sub-field</label>
          <select
            id={`add-${depth}-${fields[0]?.uid ?? "x"}`}
            value={adding}
            onChange={(e) => setAdding(e.target.value as FieldType)}
            className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm"
          >
            <option value="">Add a sub-field…</option>
            {FIELD_TYPES.filter((ft) => depth < MAX_FIELD_DEPTH || (ft !== "REPEATER" && ft !== "FLEXIBLE")).map((ft) => (
              <option key={ft} value={ft}>
                {FIELD_TYPE_INFO[ft].label}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            disabled={!adding}
            onClick={() => {
              if (!adding) return;
              const f = newField(adding, fields);
              onChange([...fields, f]);
              setOpen(f.uid);
              setAdding("");
            }}
          >
            Add
          </Button>
        </div>
      )}
    </div>
  );
}

function FieldSettings({ field, siblings, depth, options, onChange }: { field: Draft; siblings: Draft[]; depth: number; options: Options; onChange: (f: Draft) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const c = field.config;
  const set = (patch: Partial<Draft>) => onChange({ ...field, ...patch });
  const setC = (patch: Partial<DraftConfig>) => onChange({ ...field, config: { ...c, ...patch } });
  const clash = siblings.some((s) => s.uid !== field.uid && s.key === field.key);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Label" required>
          {(a) => (
            <input
              {...a}
              data-setting="label"
              className={inputClass}
              value={field.label}
              onChange={(e) => set({ label: e.target.value, ...(field.keyTouched || field.id ? {} : { key: keyify(e.target.value) || field.key }) })}
            />
          )}
        </Field>
        <Field label="Key" error={clash ? "Another field here uses this key" : null} hint={field.id ? "Renaming keeps saved values; bindings use the key" : "Used by bindings and the API"}>
          {(a) => <input {...a} data-setting="key" className={`${inputClass} font-mono`} value={field.key} onChange={(e) => set({ key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"), keyTouched: true })} />}
        </Field>
        <Field label="Type" hint={field.id ? "Changing the type clears saved values" : undefined}>
          {(a) => (
            <select {...a} className={inputClass} value={field.type} onChange={(e) => onChange({ ...field, type: e.target.value as FieldType, config: defaultConfig(e.target.value as FieldType) })}>
              {FIELD_TYPES.filter((ft) => depth < MAX_FIELD_DEPTH || (ft !== "REPEATER" && ft !== "FLEXIBLE")).map((ft) => (
                <option key={ft} value={ft}>
                  {FIELD_TYPE_INFO[ft].label}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      <Field label="Instructions" hint="Help text shown under the field.">
        {(a) => <input {...a} className={inputClass} value={field.instructions ?? ""} onChange={(e) => set({ instructions: e.target.value })} />}
      </Field>
      <div className="flex flex-wrap gap-6">
        <label className="flex items-center gap-2 text-sm text-zinc-800">
          <input type="checkbox" checked={!!field.required} onChange={(e) => set({ required: e.target.checked })} className="h-4 w-4 rounded border-zinc-300" />
          Required to publish
        </label>
        {depth === 1 && (
          <label className="flex items-center gap-2 text-sm text-zinc-800">
            <input type="checkbox" checked={field.clientEditable !== false} onChange={(e) => set({ clientEditable: e.target.checked })} className="h-4 w-4 rounded border-zinc-300" data-setting="clientEditable" />
            Clients can edit the value
          </label>
        )}
      </div>

      {(field.type === "TEXT" || field.type === "TEXTAREA") && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Placeholder">{(a) => <input {...a} className={inputClass} value={c.placeholder ?? ""} onChange={(e) => setC({ placeholder: e.target.value || undefined })} />}</Field>
          <Field label="Character limit">{(a) => <input {...a} type="number" min={1} className={inputClass} value={c.maxLength ?? ""} onChange={(e) => setC({ maxLength: e.target.value ? Number(e.target.value) : undefined })} />}</Field>
        </div>
      )}
      {field.type === "NUMBER" && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Minimum">{(a) => <input {...a} type="number" className={inputClass} value={c.min ?? ""} onChange={(e) => setC({ min: e.target.value === "" ? undefined : Number(e.target.value) })} />}</Field>
          <Field label="Maximum">{(a) => <input {...a} type="number" className={inputClass} value={c.max ?? ""} onChange={(e) => setC({ max: e.target.value === "" ? undefined : Number(e.target.value) })} />}</Field>
          <Field label="Step">{(a) => <input {...a} type="number" min={0} step="any" className={inputClass} value={c.step ?? ""} onChange={(e) => setC({ step: e.target.value ? Number(e.target.value) : undefined })} />}</Field>
        </div>
      )}
      {field.type === "PRICE" && (
        <Field label="Currency" hint="ISO code, e.g. USD, EUR, GBP">
          {(a) => <input {...a} className={`${inputClass} max-w-28 font-mono uppercase`} maxLength={3} value={c.currency ?? ""} onChange={(e) => setC({ currency: e.target.value.toUpperCase() })} />}
        </Field>
      )}
      {(field.type === "SELECT" || field.type === "RADIO" || field.type === "CHECKBOX") && <ChoicesEditor choices={c.choices ?? []} onChange={(choices) => setC({ choices })} />}
      {(field.type === "SELECT" || field.type === "RELATION") && (
        <label className="flex items-center gap-2 text-sm text-zinc-800">
          <input type="checkbox" checked={!!c.multiple} onChange={(e) => setC({ multiple: e.target.checked })} className="h-4 w-4 rounded border-zinc-300" />
          Allow several
        </label>
      )}
      {field.type === "RELATION" && (
        <fieldset>
          <legend className="mb-1 text-sm font-medium text-zinc-800">Which post types can be linked</legend>
          <div className="flex flex-wrap gap-3">
            {options.postTypes.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={(c.postTypeIds ?? []).includes(p.id)}
                  onChange={(e) => setC({ postTypeIds: e.target.checked ? [...(c.postTypeIds ?? []), p.id] : (c.postTypeIds ?? []).filter((x) => x !== p.id) })}
                  className="h-4 w-4 rounded border-zinc-300"
                />
                {p.label}
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-zinc-500">None ticked means any.</p>
        </fieldset>
      )}
      {field.type === "TAXONOMY" && (
        <Field label="Taxonomy" required>
          {(a) => (
            <select {...a} className={`${inputClass} max-w-xs`} value={c.taxonomyId ?? ""} onChange={(e) => setC({ taxonomyId: e.target.value || undefined })}>
              <option value="">Choose…</option>
              {options.taxonomies.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>
          )}
        </Field>
      )}
      {field.type === "FILE" && (
        <Field label="Accepts">
          {(a) => (
            <select {...a} className={`${inputClass} max-w-xs`} value={c.accept ?? "any"} onChange={(e) => setC({ accept: e.target.value as FieldConfig["accept"] })}>
              <option value="any">Any file</option>
              <option value="document">Documents</option>
              <option value="video">Videos</option>
            </select>
          )}
        </Field>
      )}
      {(field.type === "REPEATER" || field.type === "GALLERY" || field.type === "FLEXIBLE") && (
        <div className="grid gap-3 sm:grid-cols-2">
          {field.type !== "GALLERY" && (
            <Field label={field.type === "FLEXIBLE" ? "Minimum blocks" : "Minimum rows"}>
              {(a) => <input {...a} type="number" min={0} className={inputClass} value={c.minRows ?? ""} onChange={(e) => setC({ minRows: e.target.value ? Number(e.target.value) : undefined })} />}
            </Field>
          )}
          <Field label={field.type === "GALLERY" ? "Most images" : field.type === "FLEXIBLE" ? "Most blocks" : "Most rows"}>
            {(a) => <input {...a} type="number" min={1} className={inputClass} value={c.maxRows ?? ""} onChange={(e) => setC({ maxRows: e.target.value ? Number(e.target.value) : undefined })} />}
          </Field>
        </div>
      )}
      {field.type === "REPEATER" && (
        <div className="rounded-lg bg-zinc-50 p-3">
          <p className="mb-2 text-sm font-medium text-zinc-800">Sub-fields (one set per row)</p>
          <FieldList fields={c.subFields ?? []} onChange={(subFields) => setC({ subFields })} open={open} setOpen={setOpen} depth={depth + 1} options={options} />
        </div>
      )}
      {field.type === "FLEXIBLE" && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-zinc-800">Layouts (block types editors can stack)</p>
          {(c.layouts ?? []).map((layout, li) => (
            <div key={layout.uid} className="rounded-lg bg-zinc-50 p-3">
              <div className="mb-2 flex flex-wrap items-end gap-2">
                <Field label="Layout name" className="flex-1">
                  {(a) => (
                    <input
                      {...a}
                      className={inputClass}
                      value={layout.label}
                      onChange={(e) => setC({ layouts: c.layouts!.map((l, j) => (j === li ? { ...l, label: e.target.value, key: keyify(e.target.value) || l.key } : l)) })}
                    />
                  )}
                </Field>
                <span className="pb-2 font-mono text-xs text-zinc-400">{layout.key}</span>
                <Button size="sm" tone="ghost" className="mb-1 text-red-700" onClick={() => setC({ layouts: c.layouts!.filter((_, j) => j !== li) })}>
                  Remove layout
                </Button>
              </div>
              <FieldList fields={layout.subFields} onChange={(subFields) => setC({ layouts: c.layouts!.map((l, j) => (j === li ? { ...l, subFields } : l)) })} open={open} setOpen={setOpen} depth={depth + 1} options={options} />
            </div>
          ))}
          <Button size="sm" onClick={() => setC({ layouts: [...(c.layouts ?? []), { uid: uid(), key: `layout_${(c.layouts?.length ?? 0) + 1}`, label: `Layout ${(c.layouts?.length ?? 0) + 1}`, subFields: [] }] })}>
            + Add layout
          </Button>
        </div>
      )}
    </div>
  );
}

function ChoicesEditor({ choices, onChange }: { choices: { value: string; label: string }[]; onChange: (c: { value: string; label: string }[]) => void }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-zinc-800">Choices</legend>
      {choices.map((ch, i) => (
        <div key={i} className="flex gap-2">
          <label className="sr-only" htmlFor={`choice-label-${i}`}>Choice {i + 1} label</label>
          <input
            id={`choice-label-${i}`}
            className={inputClass}
            value={ch.label}
            placeholder="Label"
            onChange={(e) => onChange(choices.map((c, j) => (j === i ? { label: e.target.value, value: c.value.startsWith("option_") || !c.value ? keyify(e.target.value) || c.value : c.value } : c)))}
          />
          <label className="sr-only" htmlFor={`choice-value-${i}`}>Choice {i + 1} value</label>
          <input id={`choice-value-${i}`} className={`${inputClass} max-w-40 font-mono`} value={ch.value} placeholder="value" onChange={(e) => onChange(choices.map((c, j) => (j === i ? { ...c, value: e.target.value } : c)))} />
          <Button size="sm" tone="ghost" className="text-red-700" onClick={() => onChange(choices.filter((_, j) => j !== i))} aria-label={`Remove ${ch.label}`}>✕</Button>
        </div>
      ))}
      <Button size="sm" onClick={() => onChange([...choices, { value: `option_${choices.length + 1}`, label: `Option ${choices.length + 1}` }])}>+ Add choice</Button>
    </fieldset>
  );
}

function LocationEditor({ rules, onChange, options }: { rules: LocationRule[][]; onChange: (r: LocationRule[][]) => void; options: Options }) {
  const values = (param: LocationParam) =>
    param === "post_type"
      ? options.postTypes.map((p) => ({ v: p.id, l: p.label }))
      : param === "page_template"
        ? [{ v: "default", l: "Default" }, ...options.templates.map((x) => ({ v: x.key, l: x.label }))]
        : param === "post_term"
          ? options.terms.map((x) => ({ v: x.id, l: x.label }))
          : options.pages.map((p) => ({ v: p.id, l: p.label }));
  const blank = (): LocationRule => ({ param: "post_type", op: "==", value: options.postTypes[0]?.id ?? "" });
  const update = (gi: number, ri: number, patch: Partial<LocationRule>) =>
    onChange(rules.map((g, i) => (i === gi ? g.map((r, j) => (j === ri ? { ...r, ...patch, ...(patch.param ? { value: values(patch.param)[0]?.v ?? "" } : {}) } : r)) : g)));

  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-600">Show this field group on entries when…</p>
      {rules.map((group, gi) => (
        <div key={gi}>
          {gi > 0 && <p className="my-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">or</p>}
          <div className="space-y-2 rounded-lg border border-zinc-200 p-3" role="group" aria-label={`Rule group ${gi + 1}`}>
            {group.map((rule, ri) => (
              <div key={ri} className="flex flex-wrap items-center gap-2">
                {ri > 0 && <span className="w-8 text-xs font-medium text-zinc-500">and</span>}
                <label className="sr-only" htmlFor={`loc-${gi}-${ri}-p`}>Condition</label>
                <select id={`loc-${gi}-${ri}-p`} className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm" value={rule.param} onChange={(e) => update(gi, ri, { param: e.target.value as LocationParam })}>
                  {(Object.keys(LOCATION_PARAMS) as LocationParam[]).map((p) => (
                    <option key={p} value={p}>
                      {LOCATION_PARAMS[p]}
                    </option>
                  ))}
                </select>
                <label className="sr-only" htmlFor={`loc-${gi}-${ri}-o`}>Comparison</label>
                <select id={`loc-${gi}-${ri}-o`} className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm" value={rule.op} onChange={(e) => update(gi, ri, { op: e.target.value as "==" | "!=" })}>
                  <option value="==">is</option>
                  <option value="!=">is not</option>
                </select>
                <label className="sr-only" htmlFor={`loc-${gi}-${ri}-v`}>Value</label>
                <select id={`loc-${gi}-${ri}-v`} data-location-value="" className="min-w-48 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm" value={rule.value} onChange={(e) => update(gi, ri, { value: e.target.value })}>
                  {!values(rule.param).length && <option value="">Nothing to pick yet</option>}
                  {values(rule.param).map((o) => (
                    <option key={o.v} value={o.v}>
                      {o.l}
                    </option>
                  ))}
                </select>
                <Button size="sm" tone="ghost" onClick={() => onChange(rules.map((g, i) => (i === gi ? [...g.slice(0, ri + 1), blank(), ...g.slice(ri + 1)] : g)))}>and</Button>
                <Button
                  size="sm"
                  tone="ghost"
                  className="text-red-700"
                  aria-label="Remove rule"
                  onClick={() => onChange(rules.map((g, i) => (i === gi ? g.filter((_, j) => j !== ri) : g)).filter((g) => g.length))}
                >
                  ✕
                </Button>
              </div>
            ))}
          </div>
        </div>
      ))}
      <Button size="sm" onClick={() => onChange([...rules, [blank()]])}>{rules.length ? "+ Add “or” group" : "+ Add a rule"}</Button>
    </div>
  );
}
