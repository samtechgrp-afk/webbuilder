"use client";

import { useEffect, useState, useTransition } from "react";
import { Button, Dialog, Notice } from "@/components/cms/ui";
import { entryRevisionsAction, restoreEntryAction } from "@/server/cms-actions";

interface Revision {
  id: string;
  version: number;
  kind: string;
  title: string;
  message: string | null;
  createdAt: string;
  authorName: string;
  isLive: boolean;
  isScheduled: boolean;
}

const KIND: Record<string, string> = {
  DRAFT: "Saved draft",
  SUBMITTED: "Submitted for review",
  PUBLISHED: "Published",
  RESTORED: "Restored",
  SCHEDULED: "Scheduled",
  AUTOSAVE: "Autosave",
};

/** Side drawer with an entry's full history and one-click rollback. */
export function RevisionDrawer({
  siteId,
  entry,
  canRestore,
  onClose,
  onRestored,
}: {
  siteId: string;
  entry: { id: string; title: string } | null;
  canRestore: boolean;
  onClose: () => void;
  onRestored: (message: string) => void;
}) {
  const [revisions, setRevisions] = useState<Revision[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  // Reset when a different entry opens (synced-state pattern, no effect needed).
  if ((entry?.id ?? null) !== loadedFor) {
    setLoadedFor(entry?.id ?? null);
    setRevisions(null);
    setError(null);
  }

  useEffect(() => {
    if (!entry) return;
    let cancelled = false;
    entryRevisionsAction({ siteId, postId: entry.id }).then((res) => {
      if (cancelled) return;
      if (res.ok) setRevisions(res.revisions);
      else setError(res.error);
    });
    return () => {
      cancelled = true;
    };
  }, [entry, siteId]);

  return (
    <Dialog side open={!!entry} onClose={onClose} title={entry ? `History · ${entry.title}` : "History"}>
      {error && <Notice tone="error">{error}</Notice>}
      {!revisions && !error && <p className="text-sm text-zinc-500">Loading revisions…</p>}
      {revisions && (
        <ol className="relative space-y-4 border-l border-zinc-200 pl-5" aria-label="Revisions, newest first">
          {revisions.map((r, i) => (
            <li key={r.id} className="relative" data-revision={r.version}>
              <span aria-hidden className={`absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-white ${r.isLive ? "bg-emerald-500" : r.isScheduled ? "bg-sky-500" : "bg-zinc-300"}`} />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-900">
                    v{r.version} · {KIND[r.kind] ?? r.kind}
                    {r.isLive && <span className="ml-2 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-800">Live</span>}
                    {r.isScheduled && <span className="ml-2 rounded-full bg-sky-50 px-1.5 py-0.5 text-[11px] font-medium text-sky-800">Scheduled</span>}
                    {i === 0 && <span className="ml-2 rounded-full bg-zinc-100 px-1.5 py-0.5 text-[11px] font-medium text-zinc-700">Current</span>}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {r.authorName} · <time dateTime={r.createdAt}>{new Date(r.createdAt).toLocaleString()}</time>
                  </p>
                  {r.message && <p className="mt-1 text-xs text-zinc-600">{r.message}</p>}
                  {r.title !== entry?.title && <p className="mt-1 text-xs text-zinc-500">Title: {r.title}</p>}
                </div>
                {canRestore && i > 0 && (
                  <Button
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        const res = await restoreEntryAction({ siteId, postId: entry!.id, revisionId: r.id });
                        if (!res.ok) return setError(res.error);
                        onRestored(`Restored version ${r.version} as a new draft (v${res.version}). Publish it when you're ready.`);
                      })
                    }
                  >
                    Restore<span className="sr-only"> version {r.version}</span>
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Dialog>
  );
}
