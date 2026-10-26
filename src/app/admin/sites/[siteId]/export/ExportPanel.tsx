"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button, Card, Field, Notice, formatBytes, inputClass } from "@/components/cms/ui";
import { deleteExportAction, startExportAction } from "@/server/export-actions";
import type { ExportManifest } from "@/server/export/export-service";

interface Job {
  id: string;
  status: "QUEUED" | "RUNNING" | "DONE" | "FAILED";
  baseUrl: string;
  total: number;
  progress: number;
  pageCount: number;
  sizeBytes: number;
  error: string | null;
  manifest: ExportManifest;
  createdAt: string;
  finishedAt: string | null;
  by: string | null;
}

export function ExportPanel({ siteId, defaultBaseUrl, jobs }: { siteId: string; defaultBaseUrl: string; jobs: Job[] }) {
  const router = useRouter();
  const [baseUrl, setBaseUrl] = useState(defaultBaseUrl);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const active = jobs.some((j) => j.status === "QUEUED" || j.status === "RUNNING");

  // Poll while an export runs; it works in the background, so leaving the page is fine.
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => router.refresh(), 1000);
    return () => clearInterval(timer);
  }, [active, router]);

  return (
    <div className="space-y-6">
      <Card title="New export">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const res = await startExportAction({ siteId, baseUrl });
              setNotice(res.ok ? { tone: "success", text: "Export started. It runs in the background; you can leave this page." } : { tone: "error", text: res.error });
              router.refresh();
            });
          }}
        >
          {notice && (
            <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>
              {notice.text}
            </Notice>
          )}
          <Field label="Hosting address" hint="Where you'll upload the bundle. Canonical links, share cards and the sitemap point here.">
            {(a) => <input {...a} type="url" required className={inputClass} value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://www.example.com" />}
          </Field>
          <Button tone="primary" type="submit" disabled={pending || active} data-start-export="">
            {active ? "Export running…" : pending ? "Starting…" : "Export static site"}
          </Button>
        </form>
      </Card>

      <Card title="Exports">
        {jobs.length === 0 ? (
          <p className="text-sm text-zinc-500">No exports yet.</p>
        ) : (
          <ol className="-mx-5 -my-5 divide-y divide-zinc-100">
            {jobs.map((j) => (
              <li key={j.id} className="px-5 py-4" data-export={j.status.toLowerCase()}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-900">
                      {new Date(j.createdAt).toLocaleString()} <span className="font-normal text-zinc-500">· {j.by ?? "Unknown"} · for {j.baseUrl}</span>
                    </p>
                    {j.status === "DONE" && (
                      <p className="text-xs text-zinc-500">
                        {j.pageCount} pages · {j.manifest.files?.length ?? 0} files · {formatBytes(j.sizeBytes)}
                      </p>
                    )}
                    {j.status === "FAILED" && <p className="text-xs text-red-700">Failed: {j.error}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    {j.status === "DONE" && (
                      <a href={`/api/sites/${siteId}/exports/${j.id}`} className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-700" data-download-export="">
                        Download .zip
                      </a>
                    )}
                    {(j.status === "DONE" || j.status === "FAILED") && (
                      <Button
                        size="sm"
                        tone="ghost"
                        disabled={pending}
                        onClick={() =>
                          start(async () => {
                            const res = await deleteExportAction({ siteId, id: j.id });
                            if (!res.ok) setNotice({ tone: "error", text: res.error });
                            router.refresh();
                          })
                        }
                      >
                        Delete
                      </Button>
                    )}
                  </div>
                </div>
                {(j.status === "QUEUED" || j.status === "RUNNING") && (
                  <div className="mt-3" role="progressbar" aria-label="Export progress" aria-valuemin={0} aria-valuemax={j.total || 1} aria-valuenow={j.progress}>
                    <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100">
                      <div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${j.total ? Math.round((j.progress / j.total) * 100) : 5}%` }} />
                    </div>
                    <p className="mt-1 text-xs text-zinc-500">{j.status === "QUEUED" ? "Starting…" : `Compiling page ${Math.min(j.progress + 1, j.total)} of ${j.total}`}</p>
                  </div>
                )}
                {j.status === "DONE" && !!j.manifest.warnings?.length && (
                  <details className="mt-2 text-xs text-amber-800">
                    <summary className="cursor-pointer">{j.manifest.warnings.length} warning{j.manifest.warnings.length === 1 ? "" : "s"}</summary>
                    <ul className="mt-1 list-disc pl-5">
                      {j.manifest.warnings.map((w) => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
