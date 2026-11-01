"use client";

import { useRef, useState, useTransition } from "react";
import { Link2, LoaderCircle, Trash2, Type, Upload } from "lucide-react";
import { Dialog } from "@/components/cms/ui";
import { FALLBACKS, MAX_FONT_BYTES, cleanFontUrl, familiesFromCssUrl, fontFacesCss, fontFamilyOptions, fontFileFormat, type ManagedFont } from "@/lib/design/fonts";
import { addFontLinkAction, deleteFontsAction, updateFontFamilyAction } from "@/server/design-actions";

const ACCEPT = ".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2";
const FONT_FILE = /\.(ttf|otf|woff2?)$/i;
const FALLBACK_LABELS: Record<keyof typeof FALLBACKS, string> = {
  "sans-serif": "Sans-serif",
  serif: "Serif",
  monospace: "Monospace",
  display: "Display",
  handwriting: "Handwriting",
};

const inputCls = "w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20";

/**
 * The font manager: upload .ttf/.otf (and .woff/.woff2) files to the site's
 * storage, link a font host's stylesheet such as Google Fonts, and remove
 * fonts. Every family added here appears in the Font pickers of the
 * inspector and the design system, on the canvas and on the live site.
 * Designers only; the server checks `design.tokens` on every call.
 */
export function FontManagerModal({
  open,
  onClose,
  siteId,
  fonts,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  siteId: string;
  fonts: ManagedFont[];
  onChange: (fonts: ManagedFont[]) => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Fonts" wide>
      {open ? <Manager siteId={siteId} fonts={fonts} onChange={onChange} /> : null}
    </Dialog>
  );
}

function Manager({ siteId, fonts, onChange }: { siteId: string; fonts: ManagedFont[]; onChange: (fonts: ManagedFont[]) => void }) {
  const families = fontFamilyOptions(fonts);
  const [errors, setErrors] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const removeFamily = (family: string) =>
    start(async () => {
      if (!window.confirm(`Remove ${family}? Text set in it falls back to the next font in its stack.`)) return;
      const res = await deleteFontsAction({ siteId, ids: fonts.filter((f) => f.family === family).map((f) => f.id) });
      if (!res.ok) return setErrors([res.error]);
      onChange(res.fonts);
      setStatus(`${family} removed.`);
    });

  const setFallback = (family: string, fallback: string) =>
    start(async () => {
      const res = await updateFontFamilyAction({ siteId, family, fallback });
      if (!res.ok) return setErrors([res.error]);
      onChange(res.fonts);
    });

  return (
    <div className="space-y-6" data-font-manager="">
      {/* Loads the families for the previews below. */}
      <style dangerouslySetInnerHTML={{ __html: fontFacesCss(fonts) }} />
      {errors.length > 0 && (
        <ul role="alert" className="space-y-0.5 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          {errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
      <p role="status" className="sr-only">
        {status}
      </p>

      <section aria-labelledby="fonts-yours">
        <h3 id="fonts-yours" className="mb-2 text-sm font-semibold text-zinc-900">
          Your fonts <span className="font-normal text-zinc-500">({families.length})</span>
        </h3>
        {families.length === 0 ? (
          <p className="rounded-lg border border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-zinc-500">
            No custom fonts yet. Upload font files or add a Google Fonts link below, then pick the family in any Font field.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200">
            {families.map((f) => {
              const first = fonts.find((x) => x.family === f.family)!;
              return (
                <li key={f.family} className="flex items-center gap-3 px-3 py-2.5" data-font-family={f.family}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xl leading-tight text-zinc-900" style={{ fontFamily: f.value }} data-font-preview="">
                      {f.family} · The quick brown fox
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-zinc-500">
                      {f.source === "UPLOAD" ? "Uploaded" : hostLabel(first.url)}
                      {f.faces.length ? ` · ${f.faces.join(" · ")}` : ""}
                    </p>
                  </div>
                  <label className="shrink-0 text-[11px] text-zinc-500">
                    <span className="sr-only">Fallback for {f.family}</span>
                    <select
                      className="rounded-md border border-zinc-300 bg-white px-1.5 py-1 text-xs text-zinc-800"
                      value={first.fallback}
                      disabled={pending}
                      onChange={(e) => setFallback(f.family, e.target.value)}
                      title="Shown while the font loads, or if it can't"
                    >
                      {Object.entries(FALLBACK_LABELS).map(([k, label]) => (
                        <option key={k} value={k}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => removeFamily(f.family)}
                    aria-label={`Remove ${f.family}`}
                    className="shrink-0 rounded-md p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                  >
                    <Trash2 size={15} aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <UploadFonts siteId={siteId} onUploaded={onChange} onErrors={setErrors} onStatus={setStatus} />
        <LinkFont siteId={siteId} onAdded={onChange} onErrors={setErrors} onStatus={setStatus} />
      </div>
    </div>
  );
}

function hostLabel(url: string) {
  try {
    const host = new URL(url).hostname;
    return host === "fonts.googleapis.com" ? "Google Fonts" : host === "fonts.bunny.net" ? "Bunny Fonts" : host === "api.fontshare.com" ? "Fontshare" : `Linked from ${host}`;
  } catch {
    return "Linked";
  }
}

function UploadFonts({ siteId, onUploaded, onErrors, onStatus }: { siteId: string; onUploaded: (fonts: ManagedFont[]) => void; onErrors: (e: string[]) => void; onStatus: (s: string) => void }) {
  const [family, setFamily] = useState("");
  const [fallback, setFallback] = useState("sans-serif");
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const [dropOver, setDropOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function upload(files: File[]) {
    const problems: string[] = [];
    const usable = files.filter((f) => {
      if (!FONT_FILE.test(f.name)) problems.push(`${f.name}: upload a .ttf, .otf, .woff or .woff2 file`);
      else if (f.size > MAX_FONT_BYTES) problems.push(`${f.name}: font files must be under ${MAX_FONT_BYTES / 1024 / 1024} MB`);
      else return true;
      return false;
    });
    onErrors(problems);
    if (!usable.length) return;
    setUploading({ done: 0, total: usable.length });
    let added = 0;
    for (const [i, file] of usable.entries()) {
      const body = new FormData();
      body.set("file", file);
      if (family.trim()) body.set("family", family.trim());
      body.set("fallback", fallback);
      try {
        const res = await fetch(`/api/sites/${siteId}/fonts`, { method: "POST", body });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.fonts) problems.push(`${file.name}: ${json.error ?? (res.status === 413 ? "file is too large" : "upload failed")}`);
        else {
          added++;
          onUploaded(json.fonts as ManagedFont[]);
        }
      } catch {
        problems.push(`${file.name}: upload failed, check your connection`);
      }
      setUploading({ done: i + 1, total: usable.length });
    }
    setUploading(null);
    onErrors([...problems]);
    if (added) onStatus(`${added} font file${added === 1 ? "" : "s"} added.`);
    if (input.current) input.current.value = "";
  }

  return (
    <section aria-labelledby="fonts-upload" className="space-y-2">
      <h3 id="fonts-upload" className="flex items-center gap-1.5 text-sm font-semibold text-zinc-900">
        <Upload size={14} aria-hidden /> Upload font files
      </h3>
      <div
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          setDropOver(true);
        }}
        onDragLeave={() => setDropOver(false)}
        onDrop={(e) => {
          if (!e.dataTransfer.files.length) return;
          e.preventDefault();
          setDropOver(false);
          void upload(Array.from(e.dataTransfer.files));
        }}
        className={`flex flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-5 text-center transition ${dropOver ? "border-indigo-500 bg-indigo-50" : "border-zinc-300 bg-zinc-50"}`}
      >
        {uploading ? <LoaderCircle size={20} className="animate-spin text-indigo-600" aria-hidden /> : <Type size={20} className="text-zinc-400" aria-hidden />}
        <p className="text-sm text-zinc-700">{uploading ? `Uploading ${Math.min(uploading.done + 1, uploading.total)} of ${uploading.total}…` : "Drop .ttf or .otf files here, or"}</p>
        <input ref={input} type="file" accept={ACCEPT} multiple className="sr-only" id="font-file-input" data-font-upload="" onChange={(e) => e.target.files && void upload(Array.from(e.target.files))} />
        <label htmlFor="font-file-input" className={`cursor-pointer rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-700 ${uploading ? "pointer-events-none opacity-50" : ""}`}>
          Choose files
        </label>
        <p className="text-[11px] text-zinc-500">One file per weight or style · up to {MAX_FONT_BYTES / 1024 / 1024} MB each · .woff2 works too</p>
      </div>
      <label className="block">
        <span className="mb-0.5 block text-[11px] text-zinc-600">Family name (optional, read from the file)</span>
        <input className={inputCls} value={family} onChange={(e) => setFamily(e.target.value)} placeholder="e.g. Brand Sans" data-font-upload-family="" />
      </label>
      <FallbackSelect value={fallback} onChange={setFallback} />
    </section>
  );
}

function LinkFont({ siteId, onAdded, onErrors, onStatus }: { siteId: string; onAdded: (fonts: ManagedFont[]) => void; onErrors: (e: string[]) => void; onStatus: (s: string) => void }) {
  const [url, setUrl] = useState("");
  const [family, setFamily] = useState("");
  const [fallback, setFallback] = useState("sans-serif");
  const [pending, start] = useTransition();
  const parsed = cleanFontUrl(url);
  const detected = parsed && !fontFileFormat(parsed) ? familiesFromCssUrl(parsed) : [];

  function add(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const res = await addFontLinkAction({ siteId, url, family: family.trim() || null, fallback });
      if (!res.ok) return onErrors([res.error]);
      onErrors([]);
      onAdded(res.fonts);
      onStatus(`Added ${res.added.map((f) => f.family).join(", ")}.`);
      setUrl("");
      setFamily("");
    });
  }

  return (
    <form onSubmit={add} aria-labelledby="fonts-link" className="space-y-2">
      <h3 id="fonts-link" className="flex items-center gap-1.5 text-sm font-semibold text-zinc-900">
        <Link2 size={14} aria-hidden /> Add from a link
      </h3>
      <label className="block">
        <span className="mb-0.5 block text-[11px] text-zinc-600">Stylesheet or font file URL</span>
        <input
          className={inputCls}
          type="url"
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://fonts.googleapis.com/css2?family=Lobster&display=swap"
          data-font-link-url=""
        />
      </label>
      <p className="text-[11px] text-zinc-500">
        {detected.length ? `Adds ${detected.join(", ")}.` : "Google Fonts, Bunny Fonts and Fontshare links name their families. For other hosts, type the family the stylesheet declares."}
      </p>
      <label className="block">
        <span className="mb-0.5 block text-[11px] text-zinc-600">Family name {detected.length ? "(optional)" : ""}</span>
        <input className={inputCls} value={family} onChange={(e) => setFamily(e.target.value)} placeholder={detected[0] ?? "e.g. Lobster"} data-font-link-family="" />
      </label>
      <FallbackSelect value={fallback} onChange={setFallback} />
      <button type="submit" disabled={pending || !url.trim()} className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-40" data-font-link-add="">
        {pending ? "Adding…" : "Add font"}
      </button>
    </form>
  );
}

function FallbackSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[11px] text-zinc-600">Fallback while loading</span>
      <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}>
        {Object.entries(FALLBACK_LABELS).map(([k, label]) => (
          <option key={k} value={k}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}
