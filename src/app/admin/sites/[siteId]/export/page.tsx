import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTenant } from "@/lib/tenant";
import { defaultBaseUrl, listExports, type ExportManifest } from "@/server/export/export-service";
import { ExportPanel } from "./ExportPanel";

export const metadata: Metadata = { title: "Export" };

/** Designer-only: compile the live site to a static bundle and download it. */
export default async function ExportPage({ params }: PageProps<"/admin/sites/[siteId]/export">) {
  const { siteId } = await params;
  const t = await getTenant(siteId);
  if (!t.can("site.settings")) notFound();
  const jobs = await listExports(t);

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="text-2xl font-semibold text-zinc-900">Export</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Compile every live page of {t.site.name} into plain HTML with its styles, fonts and media, ready for any static host. Drafts and trashed content are never included.
      </p>
      <ExportPanel
        siteId={t.site.id}
        defaultBaseUrl={defaultBaseUrl(t.site)}
        jobs={jobs.map((j) => ({
          id: j.id,
          status: j.status,
          baseUrl: j.baseUrl,
          total: j.total,
          progress: j.progress,
          pageCount: j.pageCount,
          sizeBytes: j.sizeBytes,
          error: j.error,
          manifest: j.manifest as ExportManifest,
          createdAt: j.createdAt.toISOString(),
          finishedAt: j.finishedAt?.toISOString() ?? null,
          by: j.createdBy?.name ?? j.createdBy?.email ?? null,
        }))}
      />
    </main>
  );
}
