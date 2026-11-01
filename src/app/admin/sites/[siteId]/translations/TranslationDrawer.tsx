"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { MediaField, type LibraryAsset } from "@/components/cms/MediaField";
import { RichTextEditor } from "@/components/cms/RichTextEditor";
import { Button, Notice, StatusBadge, inputClass } from "@/components/cms/ui";
import type { ImageValue, LinkValue, PriceValue } from "@/lib/builder/types";
import type { ContentField } from "@/lib/builder/widgets";
import { localePath } from "@/lib/i18n/locales";
import type { getTranslationEditor } from "@/server/i18n/translation-service";
import { saveTranslationAction } from "@/server/i18n-actions";

type EditorData = NonNullable<Awaited<ReturnType<typeof getTranslationEditor>>>;
type Overrides = Record<string, Record<string, unknown>>;
type Violation = { nodeId: string; message: string };

/**
 * The side-by-side translation drawer: the original, read-only, on the
 * left; the translation's inputs on the right. Only text, images, links,
 * prices and SEO are offered, because that's all a translation can hold.
 */
export function TranslationDrawer({ siteId, siteKey, data, assets: initialAssets, canUpload, closeHref }: { siteId: string; siteKey: string; data: EditorData; assets: LibraryAsset[]; canUpload: boolean; closeHref: string }) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const { translation: tr, source, locale } = data;
  const [assets, setAssets] = useState(initialAssets);
  const [v, setV] = useState({ title: tr.title, slug: tr.slug, excerpt: tr.excerpt, content: tr.content, seoTitle: tr.seoTitle, seoDescription: tr.seoDescription });
  const [overrides, setOverrides] = useState<Overrides>(data.overrides);
  const [fields, setFields] = useState<Record<string, unknown>>(Object.fromEntries(data.fields.map((f) => [f.key, f.value])));
  // Kept across refreshes (the drawer isn't remounted), so the next save builds on this one.
  const [version, setVersion] = useState(tr.version);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string; violations?: Violation[] } | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!ref.current?.open) ref.current?.showModal();
  }, []);

  const setOverride = (nodeId: string, key: string, value: unknown) =>
    setOverrides((o) => {
      const node = { ...(o[nodeId] ?? {}) };
      if (value === null || value === undefined || value === "") delete node[key];
      else node[key] = value;
      const next = { ...o, [nodeId]: node };
      if (!Object.keys(node).length) delete next[nodeId];
      return next;
    });

  const save = (intent: "draft" | "publish") =>
    start(async () => {
      const res = await saveTranslationAction({
        siteId,
        translation: { postId: tr.id, baseVersion: version, intent, ...v, ...(source.usesBuilder ? { content: undefined, overrides } : { overrides: {} }), fields: Object.fromEntries(data.fields.filter((f) => !f.locked).map((f) => [f.key, fields[f.key] ?? null])) },
      });
      if (!res.ok) return setNotice({ tone: "error", text: res.error, violations: res.violations });
      setVersion(res.version);
      setNotice({ tone: "success", text: intent === "publish" ? `Published. The ${locale?.label ?? ""} page is live.` : "Draft saved." });
      router.refresh();
    });

  const sitePath = source.isHome ? "/" : source.routePrefix ? `/${source.routePrefix}/${v.slug}` : `/${v.slug}`;
  const publicPath = `/sites/${siteKey}${localePath(locale, sitePath) === "/" ? "" : localePath(locale, sitePath)}`;
  const nodeLabel = (id: string) => data.nodes.find((n) => n.id === id)?.name;

  return (
    <dialog
      ref={ref}
      aria-labelledby="tr-title"
      onClose={() => router.push(closeHref)}
      className="fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-dvh w-full max-w-6xl bg-white p-0 shadow-2xl backdrop:bg-zinc-950/40 open:flex open:flex-col"
      data-translation-drawer=""
    >
      <header className="flex flex-wrap items-center gap-3 border-b border-zinc-200 px-6 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
            {source.typeLabel} · {data.defaultLocale?.label ?? "Original"} → {locale?.label}
          </p>
          <h2 id="tr-title" className="truncate text-base font-semibold text-zinc-900">
            {source.title}
          </h2>
        </div>
        <StatusBadge status={tr.status} />
        <a href={`${publicPath}?preview=1`} target="_blank" rel="noreferrer" className="rounded-md px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100">
          Preview ↗
        </a>
        {tr.live && (
          <a href={publicPath} target="_blank" rel="noreferrer" className="rounded-md px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100">
            View live ↗
          </a>
        )}
        <Link href={closeHref} className="rounded-md px-2 py-1 text-lg leading-none text-zinc-500 hover:bg-zinc-100" aria-label="Close">
          ×
        </Link>
      </header>

      <div className="grid grid-cols-2 border-b border-zinc-100 bg-zinc-50 px-6 py-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
        <p>{data.defaultLocale?.label ?? "Original"} (read-only)</p>
        <p>{locale?.label}</p>
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto px-6 py-4">
        {notice && (
          <div className="mb-3">
            <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>
              {notice.text}
              {notice.violations?.length ? (
                <ul className="mt-1 list-disc pl-5" data-violations="">
                  {notice.violations.map((x, i) => (
                    <li key={i}>
                      {nodeLabel(x.nodeId) ? `${nodeLabel(x.nodeId)}: ` : ""}
                      {x.message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </Notice>
          </div>
        )}
        {!source.live && <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">The original isn&apos;t published yet. This translation goes live once both are published.</p>}

        <Section title="Page">
          <Row label="Title" source={source.title}>
            <input aria-label="Translated title" name="title" className={inputClass} value={v.title} maxLength={200} onChange={(e) => setV({ ...v, title: e.target.value })} />
          </Row>
          <Row label="Address" source={source.path}>
            <div className="flex items-center gap-1 text-sm text-zinc-500">
              <span className="shrink-0">{localePath(locale, source.routePrefix ? `/${source.routePrefix}/` : "/").replace(/\/?$/, "/")}</span>
              <input aria-label="Translated slug" name="slug" className={inputClass} value={source.isHome ? "" : v.slug} disabled={source.isHome} placeholder={source.isHome ? "Home page" : ""} onChange={(e) => setV({ ...v, slug: e.target.value.toLowerCase() })} />
            </div>
          </Row>
          {!source.usesBuilder && (
            <>
              <Row label="Excerpt" source={source.excerpt || "—"}>
                <textarea aria-label="Translated excerpt" className={inputClass} rows={2} maxLength={500} value={v.excerpt} onChange={(e) => setV({ ...v, excerpt: e.target.value })} />
              </Row>
              <Row label="Body" source={<div className="prose prose-sm max-h-80 overflow-y-auto" dangerouslySetInnerHTML={{ __html: source.content || "<p>—</p>" }} />}>
                <RichTextEditor label="Translated body" value={v.content} onChange={(content) => setV((x) => ({ ...x, content }))} />
              </Row>
            </>
          )}
        </Section>

        {data.nodes.length > 0 && (
          <Section title="Text, images and links" hint="Leave a field empty to show the original. Layout and styles come from the original page and change for every language at once.">
            {data.nodes.map((n) =>
              n.fields.map((f) => (
                <Row key={`${n.id}.${f.key}`} label={`${n.name}${n.fields.length > 1 ? ` · ${f.label}` : ""}`} source={<SourceValue field={f} value={n.source[f.key]} />} locked={n.locked}>
                  <OverrideInput siteId={siteId} field={f} source={n.source[f.key]} value={overrides[n.id]?.[f.key]} disabled={n.locked} assets={assets} canUpload={canUpload} onUploaded={(a) => setAssets((l) => [a, ...l])} onChange={(val) => setOverride(n.id, f.key, val)} testId={`${n.id}.${f.key}`} />
                </Row>
              )),
            )}
          </Section>
        )}

        {data.fields.length > 0 && (
          <Section title="Custom fields" hint="Only text, links and media are translated. Prices, numbers, choices and relations are shared by every language.">
            {data.fields.map((f) => (
              <Row key={f.key} label={f.label} source={<FieldSource type={f.type} value={f.source} assets={assets} />} locked={f.locked}>
                <FieldOverride siteId={siteId} type={f.type} label={f.label} value={fields[f.key]} disabled={f.locked} assets={assets} canUpload={canUpload} onUploaded={(a) => setAssets((l) => [a, ...l])} onChange={(val) => setFields((x) => ({ ...x, [f.key]: val }))} />
              </Row>
            ))}
          </Section>
        )}

        <Section title="Search and social">
          <Row label="SEO title" source={source.seoTitle || "—"}>
            <input aria-label="Translated SEO title" className={inputClass} maxLength={70} value={v.seoTitle} onChange={(e) => setV({ ...v, seoTitle: e.target.value })} />
          </Row>
          <Row label="Meta description" source={source.seoDescription || "—"}>
            <textarea aria-label="Translated meta description" className={inputClass} rows={2} maxLength={170} value={v.seoDescription} onChange={(e) => setV({ ...v, seoDescription: e.target.value })} />
          </Row>
        </Section>
      </div>

      <footer className="flex items-center justify-end gap-2 border-t border-zinc-200 px-6 py-3">
        <Button disabled={pending} onClick={() => save("draft")} data-save-translation="">
          {pending ? "Saving…" : "Save draft"}
        </Button>
        {data.canPublish && (
          <Button tone="primary" disabled={pending} onClick={() => save("publish")} data-publish-translation="">
            Publish
          </Button>
        )}
      </footer>
    </dialog>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="py-3">
      <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
      {hint && <p className="text-xs text-zinc-500">{hint}</p>}
      <div className="mt-2 divide-y divide-zinc-100">{children}</div>
    </section>
  );
}

function Row({ label, source, locked, children }: { label: string; source: ReactNode; locked?: boolean; children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-6 py-3">
      <div className="min-w-0">
        <p className="mb-1 text-xs font-medium text-zinc-500">{label}</p>
        <div className="text-sm text-zinc-800 [overflow-wrap:anywhere]">{source}</div>
      </div>
      <div className="min-w-0">
        <p className="mb-1 text-xs font-medium text-zinc-500">
          {label}
          {locked && <span className="ml-1.5 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600">Locked by the designer</span>}
        </p>
        {children}
      </div>
    </div>
  );
}

function SourceValue({ field, value }: { field: ContentField; value: unknown }) {
  if (value == null || value === "") return <span className="text-zinc-400">—</span>;
  switch (field.kind) {
    case "image": {
      const img = value as ImageValue;
      // eslint-disable-next-line @next/next/no-img-element
      return img.src ? <img src={img.src} alt={img.alt} className="h-20 rounded object-cover" /> : <span className="text-zinc-400">No image</span>;
    }
    case "gallery":
      return <span>{(value as ImageValue[]).length} images</span>;
    case "html":
      return <div className="prose prose-sm max-h-60 overflow-y-auto" dangerouslySetInnerHTML={{ __html: String(value) }} />;
    case "items":
      return (
        <ol className="list-decimal space-y-1 pl-4">
          {(Array.isArray(value) ? (value as Record<string, unknown>[]) : []).map((it, i) => (
            <li key={i}>{(field.itemFields ?? []).filter((f) => f.kind === "text" || f.kind === "multiline").map((f) => String(it?.[f.key] ?? "")).filter(Boolean).join(" · ")}</li>
          ))}
        </ol>
      );
    case "link": {
      const l = value as LinkValue;
      return (
        <span>
          {l.label} <span className="text-zinc-400">→ {l.href}</span>
        </span>
      );
    }
    case "price": {
      const p = value as PriceValue;
      return <span>{new Intl.NumberFormat("en-US", { style: "currency", currency: p.currency }).format(p.amount)}</span>;
    }
    default:
      return <span className="whitespace-pre-line">{String(value)}</span>;
  }
}

function OverrideInput({
  siteId,
  field,
  source,
  value,
  disabled,
  assets,
  canUpload,
  onUploaded,
  onChange,
  testId,
}: {
  siteId: string;
  field: ContentField;
  source: unknown;
  value: unknown;
  disabled: boolean;
  assets: LibraryAsset[];
  canUpload: boolean;
  onUploaded: (a: LibraryAsset) => void;
  onChange: (v: unknown) => void;
  testId: string;
}) {
  switch (field.kind) {
    case "text":
      return <input aria-label={`Translated ${field.label}`} data-override={testId} className={inputClass} disabled={disabled} maxLength={field.maxLength} value={(value as string) ?? ""} placeholder={String(source ?? "")} onChange={(e) => onChange(e.target.value)} />;
    case "html":
      return (
        <div data-override={testId}>
          <RichTextEditor label={`Translated ${field.label}`} value={(value as string) ?? ""} disabled={disabled} onChange={(html) => onChange(html || null)} minHeight={120} />
        </div>
      );
    case "video":
    case "audio":
    case "icon":
    case "number":
    case "datetime":
      return null;
    case "items": {
      const src = Array.isArray(source) ? (source as Record<string, unknown>[]) : [];
      const cur = Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
      const fields = (field.itemFields ?? []).filter((f) => f.kind === "text" || f.kind === "multiline" || f.kind === "link");
      const set = (i: number, key: string, v: unknown) => {
        const next = src.map((_, j) => ({ ...(cur[j] ?? {}) }));
        next[i][key] = v;
        const empty = next.every((it) => Object.values(it).every((x) => x === "" || x == null || (typeof x === "object" && !(x as LinkValue).label && !(x as LinkValue).href)));
        onChange(empty ? null : next);
      };
      return (
        <div className="space-y-3" data-override={testId}>
          {src.map((it, i) => (
            <div key={i} className="space-y-1.5 rounded-md border border-zinc-200 p-2">
              {fields.map((f) =>
                f.kind === "link" ? (
                  <input
                    key={f.key}
                    aria-label={`Translated ${field.itemLabel ?? "item"} ${i + 1} ${f.label}`}
                    className={inputClass}
                    disabled={disabled}
                    maxLength={80}
                    value={((cur[i]?.[f.key] as LinkValue | undefined)?.label) ?? ""}
                    placeholder={((it?.[f.key] as LinkValue | undefined)?.label) ?? ""}
                    onChange={(e) => {
                      const s = (it?.[f.key] as LinkValue | undefined) ?? { label: "", href: "" };
                      set(i, f.key, e.target.value ? { ...s, label: e.target.value } : null);
                    }}
                  />
                ) : f.kind === "multiline" ? (
                  <textarea key={f.key} aria-label={`Translated ${field.itemLabel ?? "item"} ${i + 1} ${f.label}`} className={inputClass} rows={2} disabled={disabled} maxLength={f.maxLength} value={String(cur[i]?.[f.key] ?? "")} placeholder={String(it?.[f.key] ?? "")} onChange={(e) => set(i, f.key, e.target.value)} />
                ) : (
                  <input key={f.key} aria-label={`Translated ${field.itemLabel ?? "item"} ${i + 1} ${f.label}`} className={inputClass} disabled={disabled} maxLength={f.maxLength} value={String(cur[i]?.[f.key] ?? "")} placeholder={String(it?.[f.key] ?? "")} onChange={(e) => set(i, f.key, e.target.value)} />
                ),
              )}
            </div>
          ))}
        </div>
      );
    }
    case "multiline":
      return <textarea aria-label={`Translated ${field.label}`} data-override={testId} className={inputClass} rows={3} disabled={disabled} maxLength={field.maxLength} value={(value as string) ?? ""} placeholder={String(source ?? "")} onChange={(e) => onChange(e.target.value)} />;
    case "link": {
      const src = (source as LinkValue | null) ?? { label: "", href: "" };
      const cur = value as LinkValue | undefined;
      const set = (patch: Partial<LinkValue>) => {
        const next = { label: cur?.label ?? "", href: cur?.href ?? "", ...patch };
        onChange(!next.label && !next.href ? null : { label: next.label || src.label, href: next.href || src.href, newTab: src.newTab });
      };
      return (
        <div className="grid grid-cols-2 gap-2" data-override={testId}>
          <input aria-label={`Translated ${field.label} label`} className={inputClass} disabled={disabled} value={cur?.label ?? ""} placeholder={src.label} maxLength={80} onChange={(e) => set({ label: e.target.value })} />
          <input aria-label={`Translated ${field.label} address`} className={inputClass} disabled={disabled} value={cur?.href ?? ""} placeholder={src.href} onChange={(e) => set({ href: e.target.value })} />
        </div>
      );
    }
    case "price": {
      const src = source as PriceValue | null;
      const cur = value as PriceValue | undefined;
      return (
        <div className="flex gap-2" data-override={testId}>
          <input
            aria-label={`Translated ${field.label} amount`}
            type="number"
            min={0}
            step="0.01"
            className={inputClass}
            disabled={disabled}
            value={cur?.amount ?? ""}
            placeholder={src ? String(src.amount) : ""}
            onChange={(e) => onChange(e.target.value === "" ? null : { amount: Number(e.target.value), currency: cur?.currency ?? src?.currency ?? "USD", compareAt: null })}
          />
          <input aria-label={`Translated ${field.label} currency`} className={`${inputClass} w-24`} disabled={disabled || !cur} maxLength={3} value={cur?.currency ?? ""} placeholder={src?.currency ?? ""} onChange={(e) => cur && onChange({ ...cur, currency: e.target.value.toUpperCase() })} />
        </div>
      );
    }
    case "image": {
      const cur = value as ImageValue | undefined;
      return (
        <div className="space-y-2" data-override={testId}>
          <MediaField siteId={siteId} label={`Translated ${field.label}`} kind="image" disabled={disabled} value={cur?.assetId ? [cur.assetId] : []} assets={assets} canUpload={canUpload} onUploaded={onUploaded} onChange={(ids) => onChange(ids[0] ? { assetId: ids[0], src: "", alt: cur?.alt ?? "" } : null)} />
          {cur?.assetId && <input aria-label={`Translated ${field.label} alt text`} className={inputClass} disabled={disabled} value={cur.alt} placeholder="Alt text in this language" maxLength={300} onChange={(e) => onChange({ ...cur, alt: e.target.value })} />}
        </div>
      );
    }
    case "gallery": {
      const cur = (value as ImageValue[] | undefined) ?? [];
      return (
        <div data-override={testId}>
          <MediaField siteId={siteId} label={`Translated ${field.label}`} kind="image" multiple disabled={disabled} value={cur.map((x) => x.assetId!).filter(Boolean)} assets={assets} canUpload={canUpload} onUploaded={onUploaded} onChange={(ids) => onChange(ids.length ? ids.map((assetId) => ({ assetId, src: "", alt: "" })) : null)} />
        </div>
      );
    }
  }
}

function FieldSource({ type, value, assets }: { type: string; value: unknown; assets: LibraryAsset[] }) {
  if (value == null || value === "" || (Array.isArray(value) && !value.length)) return <span className="text-zinc-400">—</span>;
  if (type === "RICH_TEXT") return <div className="prose prose-sm max-h-60 overflow-y-auto" dangerouslySetInnerHTML={{ __html: String(value) }} />;
  if (type === "IMAGE" || type === "FILE" || type === "GALLERY") {
    const ids = (Array.isArray(value) ? value : [value]) as string[];
    return <span>{ids.map((id) => assets.find((a) => a.id === id)?.title || assets.find((a) => a.id === id)?.originalName || "File").join(", ")}</span>;
  }
  return <span className="whitespace-pre-line">{String(value)}</span>;
}

function FieldOverride({
  siteId,
  type,
  label,
  value,
  disabled,
  assets,
  canUpload,
  onUploaded,
  onChange,
}: {
  siteId: string;
  type: string;
  label: string;
  value: unknown;
  disabled: boolean;
  assets: LibraryAsset[];
  canUpload: boolean;
  onUploaded: (a: LibraryAsset) => void;
  onChange: (v: unknown) => void;
}) {
  switch (type) {
    case "TEXTAREA":
      return <textarea aria-label={`Translated ${label}`} className={inputClass} rows={3} disabled={disabled} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value || null)} />;
    case "RICH_TEXT":
      return <RichTextEditor label={`Translated ${label}`} disabled={disabled} value={(value as string) ?? ""} onChange={(html) => onChange(html || null)} minHeight={120} />;
    case "IMAGE":
    case "FILE":
      return <MediaField siteId={siteId} label={`Translated ${label}`} kind={type === "IMAGE" ? "image" : "file"} disabled={disabled} value={typeof value === "string" ? [value] : []} assets={assets} canUpload={canUpload} onUploaded={onUploaded} onChange={(ids) => onChange(ids[0] ?? null)} />;
    case "GALLERY":
      return <MediaField siteId={siteId} label={`Translated ${label}`} kind="image" multiple disabled={disabled} value={Array.isArray(value) ? (value as string[]) : []} assets={assets} canUpload={canUpload} onUploaded={onUploaded} onChange={(ids) => onChange(ids.length ? ids : null)} />;
    default:
      return <input aria-label={`Translated ${label}`} className={inputClass} disabled={disabled} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value || null)} />;
  }
}
