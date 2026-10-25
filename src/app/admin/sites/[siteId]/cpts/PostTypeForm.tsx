"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Card, Field, Notice, Toggle, inputClass } from "@/components/cms/ui";
import { keyify, slugify } from "@/lib/cms/slug";
import { savePostTypeAction } from "@/server/cms-actions";

export const ICONS = ["📄", "📰", "💼", "🛠️", "👥", "💬", "⭐", "🏠", "🛍️", "📷", "🎓", "🍽️", "📅", "🎵", "📍", "🏆", "📦", "🧾", "❓", "🎨"];

export interface PostTypeValues {
  id?: string;
  labelSingular: string;
  labelPlural: string;
  key: string;
  description: string;
  icon: string;
  routePrefix: string;
  slugRule: "TITLE" | "DATE_TITLE" | "ID";
  usesBuilder: boolean;
  hasArchive: boolean;
  hierarchical: boolean;
  apiEnabled: boolean;
  templates: { key: string; label: string }[];
  isSystem?: boolean;
}

const BLANK: PostTypeValues = {
  labelSingular: "",
  labelPlural: "",
  key: "",
  description: "",
  icon: "📄",
  routePrefix: "",
  slugRule: "TITLE",
  usesBuilder: false,
  hasArchive: true,
  hierarchical: false,
  apiEnabled: false,
  templates: [],
};

/** Create or edit a custom post type. Designer only (the server checks too). */
export function PostTypeForm({ siteId, initial, siteKey }: { siteId: string; initial?: PostTypeValues; siteKey?: string }) {
  const router = useRouter();
  const [v, setV] = useState<PostTypeValues>(initial ?? BLANK);
  const [touched, setTouched] = useState({ key: !!initial, prefix: !!initial });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [newTpl, setNewTpl] = useState("");
  const set = (patch: Partial<PostTypeValues>) => setV((x) => ({ ...x, ...patch }));
  const isPage = v.key === "page" && v.isSystem;

  const submit = () =>
    start(async () => {
      setError(null);
      setSaved(null);
      const res = await savePostTypeAction({ siteId, ...v, id: v.id ?? null });
      if (!res.ok) return setError(res.error);
      if (!v.id) router.push(`/admin/sites/${siteId}/cpts/${res.id}`);
      else {
        setSaved("Saved.");
        router.refresh();
      }
    });

  return (
    <Card title={v.id ? "Settings" : "New post type"}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {error && <Notice tone="error">{error}</Notice>}
        {saved && <Notice tone="success">{saved}</Notice>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Plural label" required>
            {(a) => (
              <input
                {...a}
                name="labelPlural"
                className={inputClass}
                value={v.labelPlural}
                placeholder="Case studies"
                onChange={(e) => {
                  const labelPlural = e.target.value;
                  set({ labelPlural, ...(touched.key || v.isSystem ? {} : { key: keyify(labelPlural) }), ...(touched.prefix ? {} : { routePrefix: slugify(labelPlural) }) });
                }}
              />
            )}
          </Field>
          <Field label="Singular label" required>
            {(a) => <input {...a} name="labelSingular" className={inputClass} value={v.labelSingular} placeholder="Case study" onChange={(e) => set({ labelSingular: e.target.value })} />}
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Key" hint={v.id ? "Fixed once created" : "Used by the API and bindings"}>
            {(a) => (
              <input
                {...a}
                name="key"
                className={`${inputClass} font-mono`}
                value={v.key}
                disabled={!!v.id}
                onChange={(e) => {
                  setTouched((x) => ({ ...x, key: true }));
                  set({ key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") });
                }}
              />
            )}
          </Field>
          {!isPage && (
            <Field label="URL prefix" hint={`/${v.routePrefix || "…"}/entry-name`}>
              {(a) => (
                <input
                  {...a}
                  name="routePrefix"
                  className={`${inputClass} font-mono`}
                  value={v.routePrefix}
                  onChange={(e) => {
                    setTouched((x) => ({ ...x, prefix: true }));
                    set({ routePrefix: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") });
                  }}
                />
              )}
            </Field>
          )}
        </div>
        <Field label="Description">{(a) => <textarea {...a} rows={2} className={inputClass} value={v.description} onChange={(e) => set({ description: e.target.value })} />}</Field>

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-zinc-800">Icon</legend>
          <div className="flex flex-wrap gap-1.5">
            {ICONS.map((icon) => (
              <button
                key={icon}
                type="button"
                aria-pressed={v.icon === icon}
                aria-label={`Icon ${icon}`}
                onClick={() => set({ icon })}
                className={`flex h-9 w-9 items-center justify-center rounded-lg border text-lg ${v.icon === icon ? "border-[var(--accent)] bg-zinc-50 ring-2 ring-[var(--accent)]/20" : "border-zinc-200 hover:border-zinc-400"}`}
              >
                {icon}
              </button>
            ))}
          </div>
        </fieldset>

        {!isPage && (
          <Field label="New entry addresses" hint="How a new entry's slug is generated. Editors can still change it.">
            {(a) => (
              <select {...a} className={inputClass} value={v.slugRule} onChange={(e) => set({ slugRule: e.target.value as PostTypeValues["slugRule"] })}>
                <option value="TITLE">From the title (oak-dining-table)</option>
                <option value="DATE_TITLE">Date and title (2026-10-25-oak-dining-table)</option>
                <option value="ID">Short random id (k3j9x2ab)</option>
              </select>
            )}
          </Field>
        )}

        <div className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
          {(
            [
              ["usesBuilder", "Design entries on the visual canvas", "Off: entries use a form with rich text, and a single template designs them all."],
              ["hasArchive", "Archive page", `Lists every entry at /${v.routePrefix || "prefix"}.`],
              ["hierarchical", "Parent and child entries", "Like pages, entries can sit under other entries."],
              ["apiEnabled", "Public REST API", siteKey ? `Published entries at /api/v1/sites/${siteKey}/${v.key || "key"}` : "Published entries as JSON."],
            ] as const
          )
            .filter(([k]) => !(isPage && (k === "usesBuilder" || k === "hasArchive")))
            .map(([k, label, hint]) => (
              <div key={k} className="flex items-start justify-between gap-4 px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium text-zinc-800">{label}</p>
                  <p className="text-xs text-zinc-500">{hint}</p>
                </div>
                <Toggle checked={v[k]} onChange={(on) => set({ [k]: on })} label={label} />
              </div>
            ))}
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-zinc-800">Page templates</legend>
          <p className="text-xs text-zinc-500">Optional variants editors can pick per entry. Field groups can target a template.</p>
          <ul className="space-y-1">
            {v.templates.map((tpl, i) => (
              <li key={tpl.key} className="flex items-center justify-between rounded-md bg-zinc-50 px-2 py-1 text-sm">
                <span>
                  {tpl.label} <span className="font-mono text-xs text-zinc-500">{tpl.key}</span>
                </span>
                <button type="button" className="text-xs text-red-700" onClick={() => set({ templates: v.templates.filter((_, j) => j !== i) })}>
                  Remove<span className="sr-only"> {tpl.label}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <label htmlFor="new-template" className="sr-only">New template name</label>
            <input id="new-template" className={inputClass} placeholder="e.g. Landing" value={newTpl} onChange={(e) => setNewTpl(e.target.value)} />
            <Button
              size="sm"
              disabled={!keyify(newTpl)}
              onClick={() => {
                const key = keyify(newTpl);
                if (!key || v.templates.some((x) => x.key === key)) return;
                set({ templates: [...v.templates, { key, label: newTpl.trim() }] });
                setNewTpl("");
              }}
            >
              Add
            </Button>
          </div>
        </fieldset>

        <Button tone="primary" type="submit" disabled={pending} className="w-full" data-save-post-type="">
          {pending ? "Saving…" : v.id ? "Save post type" : "Create post type"}
        </Button>
      </form>
    </Card>
  );
}
