"use client";

import { useActionState, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Button, inputClass } from "@/components/cms/ui";
import { suggestSubdomain } from "@/lib/templates/subdomain";
import { createSiteFromTemplateAction, type CreateSiteState } from "@/server/template-actions";

export interface TemplateSummary {
  key: string;
  name: string;
  sector: string;
  description: string;
  highlights: string[];
  siteName: string;
  colors: Record<"background" | "surface" | "primary" | "onPrimary" | "heading" | "text" | "muted" | "border" | "accent", string>;
  fonts: { heading: string; body: string };
  radius: string;
  uppercase: boolean;
  hero: { eyebrow: string; title: string };
  pages: { slug: string; title: string }[];
  counts: { pages: number; entries: number; products: number };
}

const DEVICES = { desktop: { label: "Desktop", width: 1440 }, tablet: { label: "Tablet", width: 820 }, mobile: { label: "Mobile", width: 390 } } as const;
type Device = keyof typeof DEVICES;

export function TemplateGallery({ templates, sectors }: { templates: TemplateSummary[]; sectors: Record<string, string> }) {
  const [sector, setSector] = useState<string>("all");
  const [open, setOpen] = useState<TemplateSummary | null>(null);
  const shown = sector === "all" ? templates : templates.filter((t) => t.sector === sector);
  const counts = useMemo(() => Object.fromEntries(Object.keys(sectors).map((s) => [s, templates.filter((t) => t.sector === s).length])), [sectors, templates]);

  return (
    <>
      <div role="toolbar" aria-label="Filter by industry" className="mb-6 flex flex-wrap gap-2">
        {[["all", "All templates", templates.length] as const, ...Object.entries(sectors).map(([k, label]) => [k, label, counts[k]] as const)].map(([key, label, n]) => (
          <button
            key={key}
            type="button"
            data-sector-filter={key}
            aria-pressed={sector === key}
            onClick={() => setSector(key)}
            className={`rounded-full border px-3.5 py-1.5 text-sm transition ${sector === key ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400"}`}
          >
            {label} <span className="opacity-60">{n}</span>
          </button>
        ))}
      </div>
      <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" data-template-grid="">
        {shown.map((t) => (
          <li key={t.key} data-template-card={t.key} data-sector={t.sector} className="group flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
            <button type="button" onClick={() => setOpen(t)} className="text-left" aria-label={`Preview ${t.name}`} data-preview={t.key}>
              <Thumbnail t={t} />
            </button>
            <div className="flex flex-1 flex-col gap-2 p-4">
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-medium text-zinc-900">{t.name}</h2>
                <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">{sectors[t.sector]}</span>
              </div>
              <p className="text-sm text-zinc-600">{t.description}</p>
              <div className="mt-auto flex items-center justify-between pt-2">
                <span className="text-xs text-zinc-500">
                  {t.counts.pages} pages{t.counts.entries ? ` · ${t.counts.entries} entries` : ""}{t.counts.products ? ` · ${t.counts.products} products` : ""}
                </span>
                <Button size="sm" onClick={() => setOpen(t)}>Preview</Button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {open && <PreviewModal key={open.key} t={open} sectorLabel={sectors[open.sector]} onClose={() => setOpen(null)} />}
    </>
  );
}

/** A miniature of the template's hero drawn from its tokens, so 30 cards don't load 30 pages. */
function Thumbnail({ t }: { t: TemplateSummary }) {
  const c = t.colors;
  return (
    <div className="relative aspect-[16/10] overflow-hidden border-b border-zinc-200 p-4 transition group-hover:opacity-95" style={{ background: c.background, color: c.text, fontFamily: t.fonts.body }} aria-hidden>
      <div className="flex items-center justify-between text-[9px]" style={{ color: c.heading }}>
        <span style={{ fontFamily: t.fonts.heading, fontWeight: 700, fontSize: 11 }}>{t.siteName}</span>
        <span className="flex gap-2 opacity-70">
          {t.pages.slice(1, 4).map((p) => <span key={p.slug}>{p.title}</span>)}
        </span>
      </div>
      <div className="mt-[9%] flex flex-col gap-1.5">
        {t.hero.eyebrow && <span className="text-[8px] font-semibold uppercase tracking-[.14em]" style={{ color: c.accent }}>{t.hero.eyebrow}</span>}
        <span className="line-clamp-2 max-w-[85%] text-[19px] leading-[1.08]" style={{ fontFamily: t.fonts.heading, color: c.heading, textTransform: t.uppercase ? "uppercase" : undefined, letterSpacing: "-0.02em" }}>{t.hero.title}</span>
        <span className="mt-1.5 flex gap-1.5">
          <span className="px-2.5 py-1 text-[8px] font-semibold" style={{ background: c.primary, color: c.onPrimary, borderRadius: t.radius }}>Get started</span>
          <span className="px-2.5 py-1 text-[8px] font-semibold" style={{ border: `1px solid ${c.border}`, color: c.heading, borderRadius: t.radius }}>Learn more</span>
        </span>
      </div>
      <div className="absolute inset-x-4 bottom-0 flex h-[22%] gap-2">
        {[0, 1, 2].map((i) => <span key={i} className="flex-1 rounded-t-md" style={{ background: i === 1 ? c.primary : c.surface, opacity: i === 1 ? 0.85 : 1, border: `1px solid ${c.border}` }} />)}
      </div>
    </div>
  );
}

function PreviewModal({ t, sectorLabel, onClose }: { t: TemplateSummary; sectorLabel: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const [device, setDevice] = useState<Device>("desktop");
  const [page, setPage] = useState(t.pages[0].slug);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [name, setName] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [touched, setTouched] = useState(false);
  const [state, action, pending] = useActionState<CreateSiteState, FormData>(createSiteFromTemplateAction, null);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    // Hidden routes stay mounted; a modal left open there would keep the next page inert.
    return () => d?.close();
  }, []);
  useLayoutEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const width = DEVICES[device].width;
  const scale = size.w ? Math.min(1, (size.w - 32) / width) : 1;
  const src = `/admin/sites/new/preview/${t.key}${page === "home" ? "" : `/${page}`}`;

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={onClose}
      aria-label={`${t.name} preview`}
      data-preview-modal={t.key}
      className="m-0 h-dvh max-h-none w-dvw max-w-none bg-zinc-100 p-0 backdrop:bg-zinc-900/50"
    >
      <div className="flex h-full flex-col">
        <div className="flex flex-wrap items-center gap-3 border-b border-zinc-200 bg-white px-4 py-2.5">
          <div className="mr-auto min-w-0">
            <p className="truncate font-medium text-zinc-900">{t.name}</p>
            <p className="text-xs text-zinc-500">{sectorLabel}</p>
          </div>
          <label className="flex items-center gap-2 text-sm text-zinc-600">
            Page
            <select value={page} onChange={(e) => setPage(e.target.value)} className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm" data-preview-page="">
              {t.pages.map((p) => <option key={p.slug} value={p.slug}>{p.title}</option>)}
            </select>
          </label>
          <div role="radiogroup" aria-label="Device" className="flex rounded-lg border border-zinc-300 bg-white p-0.5">
            {(Object.keys(DEVICES) as Device[]).map((d) => (
              <button key={d} type="button" role="radio" aria-checked={device === d} data-device={d} onClick={() => setDevice(d)} className={`rounded-md px-3 py-1 text-sm ${device === d ? "bg-zinc-900 text-white" : "text-zinc-600 hover:text-zinc-900"}`}>
                {DEVICES[d].label}
              </button>
            ))}
          </div>
          <Button tone="ghost" onClick={() => ref.current?.close()} aria-label="Close preview" data-close-preview="">✕</Button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <div ref={viewport} className="relative min-h-[50vh] flex-1 overflow-hidden">
            {size.w > 0 && (
              <div className="absolute top-4 left-1/2 overflow-hidden rounded-lg border border-zinc-300 bg-white shadow-lg" style={{ width: width * scale, height: size.h - 32, transform: "translateX(-50%)" }}>
                <iframe
                  key={src}
                  src={src}
                  title={`${t.name}: ${t.pages.find((p) => p.slug === page)?.title} on ${DEVICES[device].label.toLowerCase()}`}
                  data-preview-frame={device}
                  style={{ width, height: (size.h - 32) / scale, transform: `scale(${scale})`, transformOrigin: "0 0", border: 0 }}
                />
              </div>
            )}
          </div>
          <aside className="w-full shrink-0 overflow-y-auto border-t border-zinc-200 bg-white p-5 lg:w-80 lg:border-t-0 lg:border-l">
            <p className="text-sm text-zinc-600">{t.description}</p>
            <ul className="mt-3 space-y-1 text-sm text-zinc-700">
              {t.highlights.map((h) => <li key={h}>✓ {h}</li>)}
            </ul>
            <form action={action} className="mt-6 space-y-4" data-create-form="">
              <input type="hidden" name="template" value={t.key} />
              <div>
                <label htmlFor="site-name" className="mb-1 block text-sm font-medium text-zinc-800">Site name</label>
                <input
                  id="site-name"
                  name="name"
                  required
                  maxLength={60}
                  value={name}
                  placeholder={t.siteName}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (!touched) setSubdomain(suggestSubdomain(e.target.value));
                  }}
                  className={inputClass}
                  aria-invalid={state?.field === "name" || undefined}
                />
              </div>
              <div>
                <label htmlFor="site-subdomain" className="mb-1 block text-sm font-medium text-zinc-800">Address</label>
                <div className="flex items-center gap-1.5">
                  <input
                    id="site-subdomain"
                    name="subdomain"
                    required
                    maxLength={40}
                    value={subdomain}
                    onChange={(e) => {
                      setTouched(true);
                      setSubdomain(e.target.value.toLowerCase());
                    }}
                    className={inputClass}
                    aria-invalid={state?.field === "subdomain" || undefined}
                    aria-describedby="subdomain-hint"
                  />
                </div>
                <p id="subdomain-hint" className="mt-1 text-xs text-zinc-500">Your site starts at {subdomain || "your-site"}.{typeof window === "undefined" ? "" : window.location.host}. Add a custom domain later.</p>
              </div>
              {state?.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" data-create-error="">{state.error}</p>}
              <Button type="submit" tone="primary" className="w-full" disabled={pending} data-create-site="">
                {pending ? "Creating your site…" : "Use this template"}
              </Button>
              <p className="text-xs text-zinc-500">Creates {t.counts.pages} pages{t.counts.entries ? `, ${t.counts.entries} sample entries` : ""}{t.counts.products ? ` and ${t.counts.products} products` : ""}, then opens the home page in the builder.</p>
            </form>
          </aside>
        </div>
      </div>
    </dialog>
  );
}
