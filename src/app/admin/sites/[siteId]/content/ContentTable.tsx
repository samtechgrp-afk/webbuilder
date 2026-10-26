"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Notice, StatusBadge } from "@/components/cms/ui";
import { bulkEntriesAction } from "@/server/cms-actions";
import { RevisionDrawer } from "./RevisionDrawer";

export interface ContentRow {
  id: string;
  title: string;
  slug: string;
  status: string;
  authorName: string;
  updatedAt: string;
  publishedAt: string | null;
  scheduledAt: string | null;
  isLive: boolean;
  hasPendingChanges: boolean;
  lockedBy: string | null;
  terms: string[];
  canEdit: boolean;
}

type Action = "publish" | "draft" | "trash" | "restore" | "delete" | "duplicate";

const ACTION_LABEL: Record<Action, string> = {
  publish: "Publish",
  draft: "Unpublish (back to draft)",
  duplicate: "Duplicate",
  trash: "Move to trash",
  restore: "Restore",
  delete: "Delete permanently",
};

const fmt = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

export function ContentTable({
  siteId,
  liveBase,
  postType,
  rows,
  trash,
  perms,
  sort,
  translations = false,
}: {
  siteId: string;
  liveBase: string;
  /** Rows are translations: they open in the side-by-side translation drawer. */
  translations?: boolean;
  postType: { key: string; label: string; plural: string; usesBuilder: boolean; routePrefix: string | null };
  rows: ContentRow[];
  trash: boolean;
  perms: { publish: boolean; create: boolean; restore: boolean; visual: boolean };
  sort: { key: string; dir: "asc" | "desc"; hrefs: Record<string, string> };
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [action, setAction] = useState<Action | "">("");
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string; details?: string[] } | null>(null);
  const [history, setHistory] = useState<ContentRow | null>(null);

  const actions: Action[] = trash
    ? (["restore", ...(perms.publish ? (["delete"] as const) : [])] as Action[])
    : ([...(perms.publish ? (["publish", "draft"] as const) : []), ...(perms.create ? (["duplicate"] as const) : []), "trash"] as Action[]);

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const apply = (ids: string[], act: Action) => {
    if (act === "delete" && !confirm(`Delete ${ids.length} ${ids.length === 1 ? "entry" : "entries"} permanently? This can't be undone.`)) return;
    start(async () => {
      const res = await bulkEntriesAction({ siteId, ids, action: act });
      if (!res.ok) return setNotice({ tone: "error", text: res.error });
      const verb = { publish: "published", draft: "moved to drafts", trash: "moved to the trash", restore: "restored", delete: "deleted", duplicate: "duplicated" }[act];
      setNotice({
        tone: res.skipped.length && !res.done ? "error" : "success",
        text: `${res.done} ${res.done === 1 ? "entry" : "entries"} ${verb}.${res.skipped.length ? ` ${res.skipped.length} skipped.` : ""}`,
        details: res.skipped.map((s) => `${s.title}: ${s.reason}`),
      });
      setSelected(new Set());
      setAction("");
      router.refresh();
    });
  };

  const liveUrl = (r: ContentRow) => `${liveBase}${postType.key === "page" ? (r.slug === "home" ? "" : `/${r.slug}`) : `/${postType.routePrefix ?? postType.key}/${r.slug}`}`;

  const sortHeader = (k: string, label: string) => <SortHeader sort={sort} k={k}>{label}</SortHeader>;

  return (
    <div className="space-y-3">
      {notice && (
        <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>
          <p>{notice.text}</p>
          {!!notice.details?.length && (
            <ul className="mt-1 list-disc pl-5 text-xs">
              {notice.details.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          )}
        </Notice>
      )}

      <div className="flex items-center gap-2">
        <label htmlFor="bulk-action" className="sr-only">Bulk action</label>
        <select
          id="bulk-action"
          value={action}
          onChange={(e) => setAction(e.target.value as Action)}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm"
        >
          <option value="">Bulk actions</option>
          {actions.map((a) => (
            <option key={a} value={a}>
              {ACTION_LABEL[a]}
            </option>
          ))}
        </select>
        <Button size="sm" disabled={!action || !selected.size || pending} onClick={() => action && apply([...selected], action)} data-bulk-apply="">
          {pending ? "Working…" : "Apply"}
        </Button>
        {selected.size > 0 && <span className="text-sm text-zinc-500">{selected.size} selected</span>}
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <caption className="sr-only">
            {postType.plural}, sorted by {sort.key} {sort.dir === "asc" ? "ascending" : "descending"}
          </caption>
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th scope="col" className="w-10 px-3 py-2.5">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={allSelected}
                  onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))}
                  className="h-4 w-4 rounded border-zinc-300"
                />
              </th>
              {sortHeader("title", "Title")}
              {sortHeader("status", "Status")}
              {sortHeader("author", "Author")}
              {sortHeader("updated", "Updated")}
              <th scope="col" className="px-3 py-2.5 text-right font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.map((r) => (
              <tr key={r.id} data-row={r.slug} className={selected.has(r.id) ? "bg-indigo-50/40" : "hover:bg-zinc-50"}>
                <td className="px-3 py-3">
                  <input type="checkbox" aria-label={`Select ${r.title}`} checked={selected.has(r.id)} onChange={() => toggle(r.id)} className="h-4 w-4 rounded border-zinc-300" />
                </td>
                <td className="px-3 py-3">
                  {r.canEdit && !trash ? (
                    <Link href={translations ? `/admin/sites/${siteId}/translations?edit=${r.id}` : `/admin/sites/${siteId}/content/${r.id}`} className="font-medium text-zinc-900 hover:underline">
                      {r.title}
                    </Link>
                  ) : (
                    <span className="font-medium text-zinc-900">{r.title}</span>
                  )}
                  <p className="mt-0.5 text-xs text-zinc-500">
                    /{postType.key === "page" ? (r.slug === "home" ? "" : r.slug) : `${postType.routePrefix ?? postType.key}/${r.slug}`}
                    {r.terms.length > 0 && <span> · {r.terms.join(", ")}</span>}
                    {r.lockedBy && <span className="text-amber-700"> · {r.lockedBy} is editing</span>}
                  </p>
                </td>
                <td className="px-3 py-3">
                  <StatusBadge status={r.status} />
                  {r.status === "SCHEDULED" && r.scheduledAt && <p className="mt-1 text-xs text-zinc-500">{fmt(r.scheduledAt)}</p>}
                  {r.hasPendingChanges && r.status === "PUBLISHED" && <p className="mt-1 text-xs text-amber-700">Unpublished changes</p>}
                </td>
                <td className="px-3 py-3 text-zinc-600">{r.authorName}</td>
                <td className="px-3 py-3 text-zinc-600">
                  <time dateTime={r.updatedAt}>{fmt(r.updatedAt)}</time>
                </td>
                <td className="px-3 py-3">
                  <div className="flex justify-end gap-1">
                    {!trash && !translations && postType.usesBuilder && perms.visual && r.canEdit && (
                      <Link href={`/admin/sites/${siteId}/pages/${r.id}/edit`} className="rounded-md px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100">
                        Edit visually
                      </Link>
                    )}
                    {r.isLive && !trash && (
                      <a href={liveUrl(r)} target="_blank" rel="noreferrer" className="rounded-md px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100">
                        View<span className="sr-only"> {r.title} live (opens in a new tab)</span>
                      </a>
                    )}
                    {r.canEdit && (
                      <button type="button" onClick={() => setHistory(r)} className="rounded-md px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100" data-history={r.slug}>
                        History<span className="sr-only"> of {r.title}</span>
                      </button>
                    )}
                    {trash ? (
                      <button type="button" onClick={() => apply([r.id], "restore")} className="rounded-md px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100">
                        Restore<span className="sr-only"> {r.title}</span>
                      </button>
                    ) : (
                      r.canEdit && (
                        <button type="button" onClick={() => apply([r.id], "trash")} className="rounded-md px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50">
                          Trash<span className="sr-only"> {r.title}</span>
                        </button>
                      )
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={6} className="px-3 py-12 text-center text-zinc-500">
                  {trash ? "The trash is empty." : `No ${postType.plural.toLowerCase()} match.`}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <RevisionDrawer
        siteId={siteId}
        entry={history}
        canRestore={perms.restore}
        onClose={() => setHistory(null)}
        onRestored={(msg) => {
          setHistory(null);
          setNotice({ tone: "success", text: msg });
          router.refresh();
        }}
      />
    </div>
  );
}

function SortHeader({ sort, k, children }: { sort: { key: string; dir: "asc" | "desc"; hrefs: Record<string, string> }; k: string; children: React.ReactNode }) {
  return (
    <th scope="col" aria-sort={sort.key === k ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} className="px-3 py-2.5 text-left font-medium">
      <Link href={sort.hrefs[k]} className="inline-flex items-center gap-1 hover:text-zinc-900">
        {children}
        <span aria-hidden className={sort.key === k ? "text-zinc-900" : "text-zinc-300"}>{sort.key === k && sort.dir === "asc" ? "▲" : "▼"}</span>
      </Link>
    </th>
  );
}
