"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type DragEvent } from "react";
import { AssetThumb } from "@/components/cms/MediaField";
import { Button, Dialog, EmptyState, Field, Notice, formatBytes, inputClass } from "@/components/cms/ui";
import { deleteAssetsAction, tagAssetsAction, updateAssetAction } from "@/server/cms-actions";

interface Asset {
  id: string;
  url: string;
  title: string | null;
  altText: string | null;
  caption: string | null;
  description: string | null;
  tags: string[];
  originalName: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  sizeBytes: number;
  variants: number[];
  createdAt: string;
  uploadedById: string | null;
  uploadedBy: string | null;
}

const KINDS = [
  { key: "all", label: "All" },
  { key: "image", label: "Images" },
  { key: "video", label: "Videos" },
  { key: "document", label: "Documents" },
] as const;

const ACCEPT = "image/jpeg,image/png,image/webp,image/avif,image/gif,image/svg+xml,video/mp4,video/webm,.pdf,.doc,.docx,.xls,.xlsx,.pptx,.txt,.csv,.zip";

/** The site's media library: upload, browse, search, edit metadata, tag and delete. */
export function MediaLibrary({
  siteId,
  kind,
  q,
  view,
  counts,
  perms,
  assets,
}: {
  siteId: string;
  kind: string;
  q: string;
  view: "grid" | "list";
  counts: Record<string, number>;
  perms: { upload: boolean; manage: boolean; userId: string };
  assets: Asset[];
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Asset | null>(null);
  const [uploads, setUploads] = useState<{ name: string; state: "uploading" | "done" | "error"; error?: string }[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [tag, setTag] = useState("");
  const [pending, start] = useTransition();

  const base = `/admin/sites/${siteId}/media`;
  const href = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ ...(kind !== "all" ? { kind } : {}), ...(q ? { q } : {}), ...(view !== "grid" ? { view } : {}), ...patch });
    for (const [k, v] of [...p.entries()]) if (!v || (k === "kind" && v === "all") || (k === "view" && v === "grid")) p.delete(k);
    return `${base}?${p}`;
  };
  const canManage = (a: Asset) => perms.manage || (perms.upload && a.uploadedById === perms.userId);

  async function upload(files: File[]) {
    if (!files.length) return;
    setUploads(files.map((f) => ({ name: f.name, state: "uploading" })));
    // One at a time keeps memory flat for large batches; results stream into the list.
    for (const [i, file] of files.entries()) {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch(`/api/sites/${siteId}/media`, { method: "POST", body });
      const json = await res.json().catch(() => ({}));
      setUploads((u) => u.map((x, j) => (j === i ? (res.ok ? { ...x, state: "done" } : { ...x, state: "error", error: json.error ?? "Upload failed" }) : x)));
    }
    router.refresh();
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (perms.upload) upload(Array.from(e.dataTransfer.files));
  };

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const remove = (ids: string[]) => {
    if (!confirm(`Delete ${ids.length} file${ids.length === 1 ? "" : "s"}? This can't be undone.`)) return;
    start(async () => {
      const res = await deleteAssetsAction({ siteId, ids });
      if (!res.ok) return setNotice({ tone: "error", text: res.error });
      setNotice({ tone: "success", text: `Deleted ${res.deleted} file${res.deleted === 1 ? "" : "s"}.` });
      setSelected(new Set());
      setEditing(null);
      router.refresh();
    });
  };

  return (
    <main className="mx-auto max-w-7xl px-6 py-8" onDragOver={(e) => perms.upload && (e.preventDefault(), setDragOver(true))} onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setDragOver(false)} onDrop={onDrop}>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Media</h1>
          <p className="text-sm text-zinc-500">Images become WebP with responsive sizes. SVGs are cleaned of scripts before they&apos;re stored.</p>
        </div>
        {perms.upload && (
          <>
            <input ref={input} type="file" multiple accept={ACCEPT} className="sr-only" tabIndex={-1} onChange={(e) => e.target.files && upload(Array.from(e.target.files))} data-library-upload="" />
            <Button tone="primary" onClick={() => input.current?.click()}>Upload files</Button>
          </>
        )}
      </div>

      {perms.upload && (
        <div
          className={`mb-5 rounded-xl border-2 border-dashed px-6 py-6 text-center text-sm transition ${dragOver ? "border-[var(--accent)] bg-zinc-100 text-zinc-900" : "border-zinc-300 bg-white text-zinc-500"}`}
          aria-hidden={!dragOver}
        >
          Drop files anywhere on this page to upload them.
        </div>
      )}

      <div className="mb-4 space-y-2" aria-live="polite">
        {notice && <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</Notice>}
        {uploads.length > 0 && (
          <Notice tone={uploads.some((u) => u.state === "error") ? "error" : "info"} onDismiss={() => setUploads([])}>
            <ul className="space-y-0.5">
              {uploads.map((u, i) => (
                <li key={i}>
                  {u.state === "uploading" ? "Uploading" : u.state === "done" ? "Uploaded" : "Failed"} {u.name}
                  {u.error ? `: ${u.error}` : ""}
                </li>
              ))}
            </ul>
          </Notice>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Filter by type" className="flex gap-1 text-sm">
          {KINDS.map((k) => (
            <Link key={k.key} href={href({ kind: k.key })} aria-current={kind === k.key ? "true" : undefined} className={`rounded-md px-2.5 py-1 ${kind === k.key ? "bg-white font-medium text-zinc-900 shadow-sm ring-1 ring-zinc-200" : "text-zinc-600 hover:text-zinc-900"}`}>
              {k.label} <span className="text-zinc-400">({counts[k.key]})</span>
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <form role="search" action={base} className="flex gap-2">
            {kind !== "all" && <input type="hidden" name="kind" value={kind} />}
            {view !== "grid" && <input type="hidden" name="view" value={view} />}
            <label htmlFor="media-search" className="sr-only">Search media</label>
            <input id="media-search" name="q" defaultValue={q} placeholder="Search name, alt text or tag" className="w-60 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm" />
          </form>
          <div className="flex rounded-lg border border-zinc-300 bg-white p-0.5" role="group" aria-label="View">
            <Link href={href({ view: "grid" })} aria-current={view === "grid" ? "true" : undefined} className={`rounded-md px-2.5 py-1 text-sm ${view === "grid" ? "bg-zinc-900 text-white" : "text-zinc-600"}`}>Grid</Link>
            <Link href={href({ view: "list" })} aria-current={view === "list" ? "true" : undefined} className={`rounded-md px-2.5 py-1 text-sm ${view === "list" ? "bg-zinc-900 text-white" : "text-zinc-600"}`}>List</Link>
          </div>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm">
          <span className="font-medium">{selected.size} selected</span>
          {perms.manage && (
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                start(async () => {
                  const res = await tagAssetsAction({ siteId, ids: [...selected], tag });
                  if (!res.ok) return setNotice({ tone: "error", text: res.error });
                  setNotice({ tone: "success", text: `Tagged ${res.tagged} files “${tag}”.` });
                  setTag("");
                  router.refresh();
                });
              }}
            >
              <label htmlFor="bulk-tag" className="sr-only">Tag</label>
              <input id="bulk-tag" value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Add tag" className="w-32 rounded-md border border-zinc-300 px-2 py-1 text-sm" />
              <Button size="sm" type="submit" disabled={!tag.trim() || pending}>Tag</Button>
            </form>
          )}
          <Button size="sm" tone="danger" disabled={pending || [...selected].some((id) => !canManage(assets.find((a) => a.id === id)!))} onClick={() => remove([...selected])}>
            Delete
          </Button>
          <Button size="sm" tone="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}

      {!assets.length ? (
        <EmptyState title={q ? "Nothing matches that search" : "No files yet"}>{perms.upload && !q ? "Drop files here or use Upload files." : null}</EmptyState>
      ) : view === "grid" ? (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5" aria-label="Media files">
          {assets.map((a) => (
            <li key={a.id} className={`group relative overflow-hidden rounded-xl border bg-white ${selected.has(a.id) ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/30" : "border-zinc-200"}`} data-asset={a.originalName}>
              <button type="button" onClick={() => setEditing(a)} className="block w-full text-left" aria-label={`Edit details for ${a.title || a.originalName}`}>
                <AssetThumb asset={a} className="aspect-[4/3] w-full" />
                <span className="block px-3 py-2">
                  <span className="block truncate text-sm text-zinc-800">{a.title || a.originalName}</span>
                  <span className="block text-xs text-zinc-500">
                    {a.width && a.height ? `${a.width}×${a.height} · ` : ""}
                    {formatBytes(a.sizeBytes)}
                    {a.mimeType.startsWith("image/") && !a.altText && <span className="text-amber-700"> · no alt text</span>}
                  </span>
                </span>
              </button>
              <label className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-md bg-white/90 shadow-sm">
                <input type="checkbox" checked={selected.has(a.id)} onChange={() => toggle(a.id)} aria-label={`Select ${a.title || a.originalName}`} className="h-4 w-4" />
              </label>
            </li>
          ))}
        </ul>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
          <table className="w-full min-w-[720px] text-sm">
            <caption className="sr-only">Media files</caption>
            <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th scope="col" className="w-10 px-3 py-2.5"><span className="sr-only">Select</span></th>
                <th scope="col" className="px-3 py-2.5 font-medium">File</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Type</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Size</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Alt text</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Uploaded</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {assets.map((a) => (
                <tr key={a.id} className="hover:bg-zinc-50" data-asset={a.originalName}>
                  <td className="px-3 py-2">
                    <input type="checkbox" checked={selected.has(a.id)} onChange={() => toggle(a.id)} aria-label={`Select ${a.title || a.originalName}`} className="h-4 w-4" />
                  </td>
                  <td className="px-3 py-2">
                    <button type="button" onClick={() => setEditing(a)} className="flex items-center gap-3 text-left">
                      <AssetThumb asset={a} className="h-10 w-14 rounded" />
                      <span>
                        <span className="block font-medium text-zinc-900">{a.title || a.originalName}</span>
                        <span className="block text-xs text-zinc-500">{a.originalName}</span>
                      </span>
                    </button>
                  </td>
                  <td className="px-3 py-2 text-zinc-600">{a.mimeType}</td>
                  <td className="px-3 py-2 text-zinc-600">{formatBytes(a.sizeBytes)}</td>
                  <td className="max-w-xs truncate px-3 py-2 text-zinc-600">{a.altText ?? (a.mimeType.startsWith("image/") ? <span className="text-amber-700">Missing</span> : "—")}</td>
                  <td className="px-3 py-2 text-zinc-600">{new Date(a.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AssetDrawer
        siteId={siteId}
        asset={editing}
        canEdit={editing ? canManage(editing) : false}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setNotice({ tone: "success", text: "Details saved." });
          setEditing(null);
          router.refresh();
        }}
        onDelete={(id) => remove([id])}
      />
    </main>
  );
}

function AssetDrawer({ siteId, asset, canEdit, onClose, onSaved, onDelete }: { siteId: string; asset: Asset | null; canEdit: boolean; onClose: () => void; onSaved: () => void; onDelete: (id: string) => void }) {
  const [form, setForm] = useState({ title: "", altText: "", caption: "", description: "", tags: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [loaded, setLoaded] = useState<string | null>(null);
  if ((asset?.id ?? null) !== loaded) {
    setLoaded(asset?.id ?? null);
    setError(null);
    if (asset) setForm({ title: asset.title ?? "", altText: asset.altText ?? "", caption: asset.caption ?? "", description: asset.description ?? "", tags: asset.tags.join(", ") });
  }
  const isImage = asset?.mimeType.startsWith("image/");

  return (
    <Dialog
      side
      open={!!asset}
      onClose={onClose}
      title="File details"
      footer={
        asset && canEdit ? (
          <>
            <Button tone="danger" disabled={pending} onClick={() => onDelete(asset.id)} className="mr-auto">Delete</Button>
            <Button onClick={onClose}>Cancel</Button>
            <Button
              tone="primary"
              disabled={pending}
              data-save-asset=""
              onClick={() =>
                start(async () => {
                  const res = await updateAssetAction({ siteId, id: asset.id, ...form, tags: form.tags.split(",").map((x) => x.trim()).filter(Boolean) });
                  if (!res.ok) return setError(res.error);
                  onSaved();
                })
              }
            >
              Save
            </Button>
          </>
        ) : undefined
      }
    >
      {asset && (
        <div className="space-y-4">
          <AssetThumb asset={asset} className="max-h-64 w-full rounded-lg bg-zinc-50 object-contain" />
          <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-xs">
            <dt className="text-zinc-500">File</dt>
            <dd className="truncate text-zinc-800">{asset.originalName}</dd>
            <dt className="text-zinc-500">Type</dt>
            <dd className="text-zinc-800">{asset.mimeType}</dd>
            <dt className="text-zinc-500">Size</dt>
            <dd className="text-zinc-800">{formatBytes(asset.sizeBytes)}{asset.width && asset.height ? ` · ${asset.width}×${asset.height}` : ""}</dd>
            {asset.variants.length > 0 && (
              <>
                <dt className="text-zinc-500">Responsive sizes</dt>
                <dd className="text-zinc-800">{asset.variants.map((w) => `${w}w`).join(", ")}</dd>
              </>
            )}
            <dt className="text-zinc-500">Uploaded</dt>
            <dd className="text-zinc-800">{new Date(asset.createdAt).toLocaleString()}{asset.uploadedBy ? ` by ${asset.uploadedBy}` : ""}</dd>
            <dt className="text-zinc-500">URL</dt>
            <dd className="truncate"><a href={asset.url} target="_blank" rel="noreferrer" className="text-indigo-700 underline">{asset.url}</a></dd>
          </dl>
          {error && <Notice tone="error">{error}</Notice>}
          {!canEdit && <Notice tone="info">You can only edit files you uploaded.</Notice>}
          <fieldset disabled={!canEdit} className="space-y-4">
            <Field label="Title">{(a) => <input {...a} name="title" className={inputClass} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />}</Field>
            {isImage && (
              <Field label="Alt text" hint="Describe the image for people who can't see it. Leave empty only if it's purely decorative.">
                {(a) => <textarea {...a} name="altText" rows={2} maxLength={300} className={inputClass} value={form.altText} onChange={(e) => setForm({ ...form, altText: e.target.value })} />}
              </Field>
            )}
            <Field label="Caption">{(a) => <input {...a} name="caption" className={inputClass} value={form.caption} onChange={(e) => setForm({ ...form, caption: e.target.value })} />}</Field>
            <Field label="Description">{(a) => <textarea {...a} rows={3} className={inputClass} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />}</Field>
            <Field label="Tags" hint="Comma separated">{(a) => <input {...a} name="tags" className={inputClass} value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />}</Field>
          </fieldset>
        </div>
      )}
    </Dialog>
  );
}
