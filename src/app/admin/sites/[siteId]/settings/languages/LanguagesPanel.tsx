"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Card, EmptyState, Field, Notice, Toggle, inputClass } from "@/components/cms/ui";
import { suggestPrefix } from "@/lib/i18n/locales";
import { addLocaleAction, deleteLocaleAction, setLocaleDetectionAction, updateLocaleAction } from "@/server/i18n-actions";

interface LocaleRow {
  id: string;
  code: string;
  label: string;
  prefix: string;
  isDefault: boolean;
  currency: string;
  domain: string | null;
  entries: number;
}

type Draft = { code: string; label: string; prefix: string; currency: string; domain: string };

const blank: Draft = { code: "", label: "", prefix: "", currency: "USD", domain: "" };

export function LanguagesPanel({ siteId, initial, localeDetection }: { siteId: string; initial: LocaleRow[]; localeDetection: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | "new" | null>(initial.length ? null : "new");
  const [draft, setDraft] = useState<Draft>(blank);
  const [prefixTouched, setPrefixTouched] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const isFirst = !initial.length;
  const editingRow = initial.find((l) => l.id === editing);

  const open = (row: LocaleRow | null) => {
    setNotice(null);
    setPrefixTouched(!!row);
    setDraft(row ? { code: row.code, label: row.label, prefix: row.prefix, currency: row.currency, domain: row.domain ?? "" } : blank);
    setEditing(row ? row.id : "new");
  };

  const submit = () =>
    start(async () => {
      const isDefault = isFirst || !!editingRow?.isDefault;
      // The default language has no prefix in its addresses; it still stores one for the language switcher's codes.
      const locale = { ...draft, prefix: isDefault ? draft.prefix || suggestPrefix(draft.code) : draft.prefix, domain: isDefault ? null : draft.domain || null };
      const res = editing === "new" ? await addLocaleAction({ siteId, locale }) : await updateLocaleAction({ siteId, id: editing!, locale });
      if (!res.ok) return setNotice({ tone: "error", text: res.error });
      setNotice({ tone: "success", text: editing === "new" ? `${draft.label} added.` : `${draft.label} saved.` });
      setEditing(null);
      router.refresh();
    });

  const remove = (row: LocaleRow) =>
    start(async () => {
      if (!window.confirm(`Remove ${row.label}? Visitors can no longer reach ${row.isDefault ? "the site in this language" : `/${row.prefix}`}.`)) return;
      const res = await deleteLocaleAction({ siteId, id: row.id });
      setNotice(res.ok ? { tone: "success", text: `${row.label} removed.` } : { tone: "error", text: res.error });
      if (res.ok) router.refresh();
    });

  return (
    <div className="space-y-6">
      {notice && <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</Notice>}

      <Card title="Site languages" actions={editing === null && <Button size="sm" onClick={() => open(null)} data-add-locale="">Add language</Button>}>
        {initial.length === 0 && editing !== "new" ? (
          <EmptyState title="One language">Add the language the site is written in first; it becomes the default.</EmptyState>
        ) : (
          <ul className="divide-y divide-zinc-100" data-locales="">
            {initial.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-3 py-3" data-locale={l.code}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-zinc-900">
                    {l.label} <span className="font-mono text-xs text-zinc-500">{l.code}</span>
                    {l.isDefault && <span className="ml-2 rounded-full bg-zinc-900 px-2 py-0.5 text-[11px] font-medium text-white">Default</span>}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {l.isDefault ? "Clean addresses (/about)" : l.domain ? `https://${l.domain}/` : `/${l.prefix}/…`} · {l.currency} · {l.entries} {l.isDefault ? "pages and entries" : l.entries === 1 ? "translation" : "translations"}
                  </p>
                </div>
                <Button size="sm" tone="ghost" onClick={() => open(l)}>Edit</Button>
                <Button size="sm" tone="danger" disabled={pending} onClick={() => remove(l)}>Remove</Button>
              </li>
            ))}
          </ul>
        )}

        {editing !== null && (
          <form
            className="mt-4 grid gap-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            data-locale-form=""
          >
            <p className="text-sm font-semibold text-zinc-900 sm:col-span-2">{editing === "new" ? (isFirst ? "Default language" : "New language") : `Edit ${editingRow?.label}`}</p>
            <Field label="Language code" required hint="A language tag such as en-US, fr-FR or es-ES.">
              {(a) => (
                <input
                  {...a}
                  name="code"
                  className={inputClass}
                  value={draft.code}
                  placeholder="fr-FR"
                  onChange={(e) => {
                    const code = e.target.value;
                    setDraft((d) => ({ ...d, code, prefix: prefixTouched ? d.prefix : suggestPrefix(code, initial.map((l) => l.prefix)) }));
                  }}
                />
              )}
            </Field>
            <Field label="Name" required hint="As visitors see it in the language switcher.">
              {(a) => <input {...a} name="label" className={inputClass} value={draft.label} placeholder="Français" maxLength={40} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />}
            </Field>
            {!(isFirst || editingRow?.isDefault) && (
              <>
                <Field label="URL prefix" required hint={`Pages in this language live at /${draft.prefix || "fr"}/…`}>
                  {(a) => (
                    <input
                      {...a}
                      name="prefix"
                      className={inputClass}
                      value={draft.prefix}
                      placeholder="fr"
                      onChange={(e) => {
                        setPrefixTouched(true);
                        setDraft({ ...draft, prefix: e.target.value.toLowerCase() });
                      }}
                    />
                  )}
                </Field>
                <Field label="Own domain" hint="Optional, such as aurelia.fr. Point its DNS at the platform; the prefix keeps working too.">
                  {(a) => <input {...a} name="domain" className={inputClass} value={draft.domain} placeholder="aurelia.fr" onChange={(e) => setDraft({ ...draft, domain: e.target.value })} />}
                </Field>
              </>
            )}
            <Field label="Currency" required hint="3-letter code, such as EUR. Shown with prices in this language.">
              {(a) => <input {...a} name="currency" className={inputClass} value={draft.currency} maxLength={3} onChange={(e) => setDraft({ ...draft, currency: e.target.value.toUpperCase() })} />}
            </Field>
            <div className="flex items-end gap-2 sm:col-span-2">
              <Button
                tone="primary"
                type="submit"
                disabled={pending}
                data-save-locale=""
              >
                {pending ? "Saving…" : editing === "new" ? "Add language" : "Save"}
              </Button>
              {!isFirst && (
                <Button tone="ghost" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
              )}
            </div>
          </form>
        )}
      </Card>

      {initial.length > 1 && (
        <Card title="Visitors">
          <div className="flex items-start justify-between gap-6">
            <div>
              <label htmlFor="locale-detection" className="text-sm font-medium text-zinc-900">
                Send first-time visitors to their language
              </label>
              <p className="mt-1 text-xs text-zinc-500">
                Uses the browser&apos;s language preference, once, on clean addresses only, and only when that page is translated. Search engines are never redirected. A visitor who picks another language in the switcher keeps it.
              </p>
            </div>
            <Toggle
              id="locale-detection"
              label="Send first-time visitors to their language"
              checked={localeDetection}
              disabled={pending}
              onChange={(on) =>
                start(async () => {
                  const res = await setLocaleDetectionAction({ siteId, on });
                  setNotice(res.ok ? { tone: "success", text: on ? "Language detection is on." : "Language detection is off." } : { tone: "error", text: res.error });
                  router.refresh();
                })
              }
            />
          </div>
        </Card>
      )}
    </div>
  );
}
