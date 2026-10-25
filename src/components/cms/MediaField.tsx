"use client";

import { useRef, useState } from "react";
import { Button, Dialog, formatBytes } from "./ui";

export interface LibraryAsset {
  id: string;
  url: string;
  title: string | null;
  altText: string | null;
  originalName: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  sizeBytes: number;
}

export type MediaKind = "image" | "file" | "document" | "video";

const accepts = (kind: MediaKind, mime: string) =>
  kind === "image" ? mime.startsWith("image/") : kind === "video" ? mime.startsWith("video/") : kind === "document" ? !mime.startsWith("image/") && !mime.startsWith("video/") : true;

const UPLOAD_ACCEPT: Record<MediaKind, string> = {
  image: "image/jpeg,image/png,image/webp,image/avif,image/gif,image/svg+xml",
  video: "video/mp4,video/webm",
  document: ".pdf,.doc,.docx,.xls,.xlsx,.pptx,.txt,.csv,.zip",
  file: "image/*,video/mp4,video/webm,.pdf,.doc,.docx,.xls,.xlsx,.pptx,.txt,.csv,.zip",
};

export function AssetThumb({ asset, className = "" }: { asset: LibraryAsset; className?: string }) {
  if (asset.mimeType.startsWith("image/")) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={asset.url} alt={asset.altText ?? ""} className={`object-cover ${className}`} loading="lazy" />;
  }
  const ext = asset.url.split(".").pop()?.toUpperCase() ?? "FILE";
  return (
    <div className={`flex items-center justify-center bg-zinc-100 text-xs font-semibold text-zinc-500 ${className}`} aria-hidden>
      {asset.mimeType.startsWith("video/") ? "▶ " : ""}
      {ext}
    </div>
  );
}

/** Library picker for one or many files, with upload. Only this site's assets are listed. */
export function MediaPickerDialog({
  open,
  siteId,
  assets,
  kind,
  multiple,
  initial,
  canUpload,
  onClose,
  onDone,
  onUploaded,
}: {
  open: boolean;
  siteId: string;
  assets: LibraryAsset[];
  kind: MediaKind;
  multiple?: boolean;
  initial: string[];
  canUpload: boolean;
  onClose: () => void;
  onDone: (ids: string[]) => void;
  onUploaded: (asset: LibraryAsset) => void;
}) {
  const [picked, setPicked] = useState<string[]>(initial);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const [openedWith, setOpenedWith] = useState(open);
  if (open !== openedWith) {
    setOpenedWith(open);
    if (open) setPicked(initial);
  }

  const list = assets.filter((a) => accepts(kind, a.mimeType) && (!q || `${a.title} ${a.originalName} ${a.altText}`.toLowerCase().includes(q.toLowerCase())));

  async function upload(files: FileList) {
    setBusy(true);
    setError(null);
    for (const file of Array.from(files)) {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch(`/api/sites/${siteId}/media`, { method: "POST", body });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Upload failed");
        break;
      }
      onUploaded(json.asset);
      setPicked((p) => (multiple ? [...p, json.asset.id] : [json.asset.id]));
    }
    setBusy(false);
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      wide
      title={multiple ? "Choose files" : kind === "image" ? "Choose an image" : "Choose a file"}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button tone="primary" disabled={!picked.length && !initial.length} onClick={() => onDone(picked)} data-media-done="">
            {multiple ? `Use ${picked.length} selected` : "Use selected"}
          </Button>
        </>
      }
    >
      <div className="mb-4 flex items-center gap-2">
        <label htmlFor="media-q" className="sr-only">Search media</label>
        <input id="media-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or alt text" className="flex-1 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm" />
        {canUpload && (
          <>
            <input ref={input} type="file" multiple={multiple} accept={UPLOAD_ACCEPT[kind]} className="sr-only" tabIndex={-1} onChange={(e) => e.target.files?.length && upload(e.target.files)} data-media-upload="" />
            <Button size="sm" disabled={busy} onClick={() => input.current?.click()}>
              {busy ? "Uploading…" : "Upload"}
            </Button>
          </>
        )}
      </div>
      {error && <p role="alert" className="mb-3 text-sm text-red-700">{error}</p>}
      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {list.map((a) => {
          const on = picked.includes(a.id);
          return (
            <li key={a.id}>
              <button
                type="button"
                aria-pressed={on}
                data-pick={a.id}
                onClick={() => setPicked((p) => (multiple ? (on ? p.filter((x) => x !== a.id) : [...p, a.id]) : [a.id]))}
                className={`w-full overflow-hidden rounded-lg border text-left transition ${on ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/30" : "border-zinc-200 hover:border-zinc-400"}`}
              >
                <AssetThumb asset={a} className="aspect-[4/3] w-full" />
                <span className="block truncate px-2 py-1.5 text-[11px] text-zinc-600">{a.title || a.originalName}</span>
              </button>
            </li>
          );
        })}
        {!list.length && <li className="col-span-full py-10 text-center text-sm text-zinc-500">Nothing here yet.</li>}
      </ul>
    </Dialog>
  );
}

/** A form control holding asset ids: one image, a gallery, or a file. */
export function MediaField({
  id,
  siteId,
  value,
  onChange,
  assets,
  kind,
  multiple,
  disabled,
  canUpload,
  onUploaded,
  label,
}: {
  id?: string;
  siteId: string;
  value: string[];
  onChange: (ids: string[]) => void;
  assets: LibraryAsset[];
  kind: MediaKind;
  multiple?: boolean;
  disabled?: boolean;
  canUpload: boolean;
  onUploaded: (asset: LibraryAsset) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const byId = new Map(assets.map((a) => [a.id, a]));
  const chosen = value.map((x) => byId.get(x)).filter((a): a is LibraryAsset => !!a);
  const move = (i: number, d: -1 | 1) => {
    const next = [...value];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };
  return (
    <div className="space-y-2" id={id}>
      {chosen.length > 0 && (
        <ul className={multiple ? "grid grid-cols-3 gap-2 sm:grid-cols-5" : ""} aria-label={`${label}: selected`}>
          {chosen.map((a, i) => (
            <li key={`${a.id}-${i}`} className={`group relative overflow-hidden rounded-lg border border-zinc-200 bg-white ${multiple ? "" : "flex items-center gap-3 p-2"}`}>
              <AssetThumb asset={a} className={multiple ? "aspect-square w-full" : "h-16 w-20 rounded-md"} />
              {!multiple && (
                <div className="min-w-0 flex-1 text-xs">
                  <p className="truncate font-medium text-zinc-800">{a.title || a.originalName}</p>
                  <p className="text-zinc-500">
                    {a.width && a.height ? `${a.width}×${a.height} · ` : ""}
                    {formatBytes(a.sizeBytes)}
                  </p>
                  {a.mimeType.startsWith("image/") && !a.altText && <p className="text-amber-700">No alt text. Add it in the media library.</p>}
                </div>
              )}
              {!disabled && (
                <div className={multiple ? "absolute inset-x-1 bottom-1 flex justify-between opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100" : "flex gap-1"}>
                  {multiple && i > 0 && <Button size="sm" onClick={() => move(i, -1)} aria-label={`Move ${a.title ?? "image"} earlier`}>←</Button>}
                  <Button size="sm" tone="danger" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label={`Remove ${a.title || a.originalName}`}>
                    ✕
                  </Button>
                  {multiple && i < chosen.length - 1 && <Button size="sm" onClick={() => move(i, 1)} aria-label={`Move ${a.title ?? "image"} later`}>→</Button>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {!disabled && (
        <Button size="sm" onClick={() => setOpen(true)}>
          {chosen.length ? (multiple ? "Add or reorder" : "Replace") : multiple ? "Add images" : kind === "image" ? "Choose image" : "Choose file"}
          <span className="sr-only"> for {label}</span>
        </Button>
      )}
      <MediaPickerDialog
        open={open}
        siteId={siteId}
        assets={assets}
        kind={kind}
        multiple={multiple}
        initial={value}
        canUpload={canUpload}
        onClose={() => setOpen(false)}
        onUploaded={onUploaded}
        onDone={(ids) => {
          onChange(ids);
          setOpen(false);
        }}
      />
    </div>
  );
}
