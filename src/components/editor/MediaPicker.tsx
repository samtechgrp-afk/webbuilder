"use client";

import { useRef, useState } from "react";

export interface PickerAsset {
  id: string;
  url: string;
  altText: string | null;
  width: number | null;
  height: number | null;
  originalName: string;
  /** Missing on assets from older callers, which only listed images. */
  mimeType?: string;
}

const isKind = (a: PickerAsset, kind: "image" | "video" | "audio") => (a.mimeType ? a.mimeType.startsWith(`${kind}/`) : kind === "image");

/** The site's media library. Only this site's assets are listed or accepted. */
export function MediaPicker({
  siteId,
  assets,
  canUpload,
  currentId,
  onPick,
  onClose,
  onUploaded,
  accept = "image",
}: {
  siteId: string;
  assets: PickerAsset[];
  canUpload: boolean;
  currentId: string | null;
  onPick: (asset: PickerAsset) => void;
  onClose: () => void;
  onUploaded: (asset: PickerAsset) => void;
  accept?: "image" | "video" | "audio";
}) {
  const shown = assets.filter((a) => isKind(a, accept));
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    const body = new FormData();
    body.set("file", file);
    const res = await fetch(`/api/sites/${siteId}/media`, { method: "POST", body });
    const json = await res.json().catch(() => ({}));
    setUploading(false);
    if (!res.ok) return setError(json.error ?? "Upload failed");
    onUploaded(json.asset);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-6 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Media library"
        className="flex max-h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-zinc-200 px-5 py-3">
          <h2 className="text-sm font-semibold text-zinc-900">Media library</h2>
          <div className="flex items-center gap-2">
            {canUpload && (
              <>
                <input
                  ref={input}
                  type="file"
                  accept={accept === "video" ? "video/mp4,video/webm" : accept === "audio" ? "audio/mpeg,audio/mp4,audio/ogg,audio/wav,audio/webm,audio/aac" : "image/jpeg,image/png,image/webp,image/avif,image/gif"}
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
                />
                <button
                  type="button"
                  onClick={() => input.current?.click()}
                  disabled={uploading}
                  className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
                >
                  {uploading ? "Uploading…" : accept === "video" ? "Upload video" : accept === "audio" ? "Upload audio" : "Upload image"}
                </button>
              </>
            )}
            <button type="button" onClick={onClose} className="rounded-md px-2 py-1.5 text-xs text-zinc-500 hover:bg-zinc-100">
              Close
            </button>
          </div>
        </header>
        {error && <p className="bg-red-50 px-5 py-2 text-xs text-red-700">{error}</p>}
        <div className="grid grid-cols-3 gap-3 overflow-y-auto p-5 sm:grid-cols-4">
          {shown.map((a) => (
            <button
              key={a.id}
              type="button"
              data-asset-id={a.id}
              onClick={() => onPick(a)}
              className={`group overflow-hidden rounded-lg border text-left transition ${
                a.id === currentId ? "border-indigo-500 ring-2 ring-indigo-500/30" : "border-zinc-200 hover:border-zinc-400"
              }`}
            >
              {accept === "video" ? (
                <video src={a.url} muted preload="metadata" className="aspect-[4/3] w-full bg-zinc-900 object-cover" />
              ) : accept === "audio" ? (
                <span className="flex aspect-[4/3] w-full items-center justify-center bg-zinc-100 text-2xl" aria-hidden="true">♪</span>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.url} alt={a.altText ?? ""} className="aspect-[4/3] w-full object-cover" loading="lazy" />
              )}
              <span className="block truncate px-2 py-1.5 text-[11px] text-zinc-600">{a.altText || a.originalName}</span>
            </button>
          ))}
          {!shown.length && <p className="col-span-full py-10 text-center text-sm text-zinc-500">{accept === "video" ? "No videos yet. Upload an MP4 or WebM." : accept === "audio" ? "No audio yet. Upload an MP3, M4A, OGG or WAV." : "No images yet."}</p>}
        </div>
      </div>
    </div>
  );
}
