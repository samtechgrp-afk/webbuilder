"use client";

import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, GripVertical, ImagePlus, Images, LoaderCircle, Trash2, Upload } from "lucide-react";
import { Dialog } from "@/components/cms/ui";
import type { GalleryImage } from "@/lib/builder/types";
import type { PickerAsset } from "./MediaPicker";

const ACCEPT = "image/jpeg,image/png,image/webp,image/avif,image/gif";
const RASTER = new Set(ACCEPT.split(","));

const fromAsset = (a: PickerAsset): GalleryImage => ({ assetId: a.id, src: a.url, alt: a.altText ?? "", width: a.width ?? undefined, height: a.height ?? undefined });

/**
 * The gallery manager behind "image-gallery" content fields (the Tilted grid
 * hero's images). Edits a draft: upload several files at once (drop or
 * browse), add from the site's media library, drag or nudge to reorder,
 * write alt text, remove. Nothing changes on the page until Save.
 *
 * Uploads go through the same endpoint as the rest of the editor
 * (/api/sites/[siteId]/media), so they land in the site's media library and
 * in whichever storage the deployment uses (Cloudflare R2 in production).
 * The server re-resolves every image against the library on save.
 */
export function ImageGalleryModal({
  open,
  onClose,
  title = "Manage gallery",
  images,
  onSave,
  siteId,
  assets,
  canUpload,
  onAssetUploaded,
  max = 30,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  images: GalleryImage[];
  onSave: (images: GalleryImage[]) => void;
  siteId: string;
  assets: PickerAsset[];
  canUpload: boolean;
  onAssetUploaded: (asset: PickerAsset) => void;
  max?: number;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={title} wide>
      {/* Remounted on every open, so the draft always starts from the saved list. */}
      {open ? <Manager images={images} onSave={onSave} onClose={onClose} siteId={siteId} assets={assets} canUpload={canUpload} onAssetUploaded={onAssetUploaded} max={max} /> : null}
    </Dialog>
  );
}

function Manager({
  images,
  onSave,
  onClose,
  siteId,
  assets,
  canUpload,
  onAssetUploaded,
  max,
}: {
  images: GalleryImage[];
  onSave: (images: GalleryImage[]) => void;
  onClose: () => void;
  siteId: string;
  assets: PickerAsset[];
  canUpload: boolean;
  onAssetUploaded: (asset: PickerAsset) => void;
  max: number;
}) {
  const [draft, setDraft] = useState<GalleryImage[]>(images);
  const [tab, setTab] = useState<"gallery" | "library">("gallery");
  const [picked, setPicked] = useState<string[]>([]);
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropOver, setDropOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const room = max - draft.length;
  const library = assets.filter((a) => (a.mimeType ? a.mimeType.startsWith("image/") : true));
  const changed = JSON.stringify(draft) !== JSON.stringify(images);

  const move = (from: number, to: number) =>
    setDraft((list) => {
      if (to < 0 || to >= list.length || from === to) return list;
      const next = [...list];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });

  async function upload(files: File[]) {
    const problems: string[] = [];
    const usable = files.filter((f) => {
      if (RASTER.has(f.type)) return true;
      problems.push(`${f.name}: use a JPG, PNG, WebP, AVIF or GIF image`);
      return false;
    });
    const batch = usable.slice(0, Math.max(0, room));
    if (usable.length > batch.length) problems.push(`Only ${max} images fit in one gallery; ${usable.length - batch.length} skipped`);
    setErrors(problems);
    if (!batch.length) return;
    setUploading({ done: 0, total: batch.length });
    // One at a time: images are converted to WebP on the server, and order should match the selection.
    for (const [i, file] of batch.entries()) {
      const body = new FormData();
      body.set("file", file);
      try {
        const res = await fetch(`/api/sites/${siteId}/media`, { method: "POST", body });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.asset) {
          problems.push(`${file.name}: ${json.error ?? (res.status === 413 ? "file is too large" : "upload failed")}`);
        } else {
          onAssetUploaded(json.asset as PickerAsset);
          setDraft((list) => (list.length < max ? [...list, fromAsset(json.asset as PickerAsset)] : list));
        }
      } catch {
        problems.push(`${file.name}: upload failed, check your connection`);
      }
      setUploading({ done: i + 1, total: batch.length });
    }
    setUploading(null);
    setErrors([...problems]);
  }

  function addPicked() {
    const chosen = picked.map((id) => library.find((a) => a.id === id)).filter((a): a is PickerAsset => !!a);
    setDraft((list) => [...list, ...chosen.slice(0, max - list.length).map(fromAsset)]);
    setPicked([]);
    setTab("gallery");
  }

  const busy = !!uploading;

  return (
    <div className="space-y-4" data-gallery-manager="">
      <div className="flex items-center justify-between gap-3">
        <div role="tablist" aria-label="Gallery views" className="inline-flex rounded-lg bg-zinc-100 p-0.5 text-sm">
          {(
            [
              ["gallery", `In this gallery (${draft.length})`, Images],
              ["library", "Media library", ImagePlus],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium ${tab === key ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-600 hover:text-zinc-900"}`}
            >
              <Icon size={14} aria-hidden />
              {label}
            </button>
          ))}
        </div>
        <span className="text-xs text-zinc-500">
          {draft.length} of {max}
        </span>
      </div>

      {errors.length > 0 && (
        <ul role="alert" className="space-y-0.5 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          {errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}

      {tab === "gallery" ? (
        <>
          {canUpload && (
            <div
              onDragOver={(e) => {
                if (dragFrom !== null || !e.dataTransfer.types.includes("Files")) return;
                e.preventDefault();
                setDropOver(true);
              }}
              onDragLeave={() => setDropOver(false)}
              onDrop={(e) => {
                if (dragFrom !== null || !e.dataTransfer.files.length) return;
                e.preventDefault();
                setDropOver(false);
                void upload(Array.from(e.dataTransfer.files));
              }}
              className={`flex flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition ${dropOver ? "border-indigo-500 bg-indigo-50" : "border-zinc-300 bg-zinc-50"}`}
            >
              {busy ? <LoaderCircle size={22} className="animate-spin text-indigo-600" aria-hidden /> : <Upload size={22} className="text-zinc-400" aria-hidden />}
              <p className="text-sm text-zinc-700">
                {busy ? `Uploading ${Math.min(uploading.done + 1, uploading.total)} of ${uploading.total}…` : "Drop images here, or"}
              </p>
              <input
                ref={input}
                type="file"
                accept={ACCEPT}
                multiple
                className="hidden"
                data-gallery-upload=""
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  e.target.value = "";
                  void upload(files);
                }}
              />
              {!busy && (
                <button
                  type="button"
                  disabled={room <= 0}
                  onClick={() => input.current?.click()}
                  className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
                >
                  Choose files
                </button>
              )}
              <p className="text-[11px] text-zinc-500">JPG, PNG, WebP, AVIF or GIF. Converted to WebP and saved to your media library.</p>
            </div>
          )}

          {draft.length ? (
            <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Gallery order">
              {draft.map((img, i) => (
                <li
                  key={`${img.assetId}-${i}`}
                  draggable
                  data-gallery-item={i}
                  onDragStart={(e) => {
                    setDragFrom(i);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragOver={(e) => {
                    if (dragFrom === null) return;
                    e.preventDefault();
                    if (dragFrom !== i) {
                      move(dragFrom, i);
                      setDragFrom(i);
                    }
                  }}
                  onDragEnd={() => setDragFrom(null)}
                  className={`group overflow-hidden rounded-lg border bg-white ${dragFrom === i ? "border-indigo-500 opacity-60" : "border-zinc-200"}`}
                >
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.src} alt="" className="aspect-video w-full bg-zinc-100 object-cover" draggable={false} />
                    <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-0.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                      <GripVertical size={11} aria-hidden />
                      {i + 1}
                    </span>
                    <div className="absolute top-1.5 right-1.5 flex gap-1">
                      <IconButton label={`Move image ${i + 1} earlier`} disabled={i === 0} onClick={() => move(i, i - 1)}>
                        <ArrowLeft size={13} />
                      </IconButton>
                      <IconButton label={`Move image ${i + 1} later`} disabled={i === draft.length - 1} onClick={() => move(i, i + 1)}>
                        <ArrowRight size={13} />
                      </IconButton>
                      <IconButton label={`Remove image ${i + 1}`} danger onClick={() => setDraft((list) => list.filter((_, j) => j !== i))}>
                        <Trash2 size={13} />
                      </IconButton>
                    </div>
                  </div>
                  <input
                    aria-label={`Alt text for image ${i + 1}`}
                    placeholder="Describe the image"
                    value={img.alt}
                    maxLength={300}
                    onChange={(e) => setDraft((list) => list.map((x, j) => (j === i ? { ...x, alt: e.target.value } : x)))}
                    className="block w-full border-0 border-t border-zinc-200 px-2 py-1.5 text-xs text-zinc-800 outline-none placeholder:text-zinc-400 focus:bg-indigo-50/50"
                  />
                </li>
              ))}
            </ol>
          ) : (
            <p className="rounded-lg bg-zinc-50 py-8 text-center text-sm text-zinc-500">
              No images yet. Until you add some, the hero shows soft gradient placeholders.
            </p>
          )}
          {draft.length > 0 && <p className="text-[11px] text-zinc-500">Drag to reorder. Images play along the band in this order and repeat when the list is short.</p>}
        </>
      ) : (
        <>
          {library.length ? (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {library.map((a) => {
                const on = picked.includes(a.id);
                return (
                  <button
                    key={a.id}
                    type="button"
                    data-asset-id={a.id}
                    aria-pressed={on}
                    onClick={() => setPicked((p) => (on ? p.filter((x) => x !== a.id) : [...p, a.id]))}
                    className={`relative overflow-hidden rounded-lg border text-left transition ${on ? "border-indigo-500 ring-2 ring-indigo-500/30" : "border-zinc-200 hover:border-zinc-400"}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={a.url} alt={a.altText ?? ""} className="aspect-[4/3] w-full object-cover" loading="lazy" />
                    {on && (
                      <span className="absolute top-1.5 right-1.5 grid size-5 place-items-center rounded-full bg-indigo-600 text-[10px] font-semibold text-white">
                        {picked.indexOf(a.id) + 1}
                      </span>
                    )}
                    <span className="block truncate px-2 py-1.5 text-[11px] text-zinc-600">{a.altText || a.originalName}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="rounded-lg bg-zinc-50 py-8 text-center text-sm text-zinc-500">The media library has no images yet. Upload some on the other tab.</p>
          )}
          <div className="flex items-center justify-end gap-2">
            <span className="text-xs text-zinc-500">{picked.length ? `${picked.length} selected, added in the order you picked them` : "Pick one or more images"}</span>
            <button
              type="button"
              disabled={!picked.length || room <= 0}
              onClick={addPicked}
              className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
            >
              <Check size={13} aria-hidden />
              Add to gallery
            </button>
          </div>
        </>
      )}

      <div className="flex justify-end gap-2 border-t border-zinc-200 pt-4">
        <button type="button" onClick={onClose} className="rounded-md px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100">
          Cancel
        </button>
        <button
          type="button"
          disabled={busy || !changed}
          onClick={() => {
            onSave(draft.map((img) => ({ ...img, alt: img.alt.trim() })));
            onClose();
          }}
          className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          Save gallery
        </button>
      </div>
    </div>
  );
}

function IconButton({ label, onClick, disabled, danger, children }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`grid size-6 place-items-center rounded bg-white/90 shadow-sm disabled:opacity-40 ${danger ? "text-red-600 hover:bg-red-50" : "text-zinc-700 hover:bg-white"}`}
    >
      {children}
    </button>
  );
}
