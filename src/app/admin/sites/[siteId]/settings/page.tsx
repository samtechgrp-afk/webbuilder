import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getTenant } from "@/lib/tenant";
import { SiteIdentityForm } from "./SiteIdentityForm";

export const metadata: Metadata = { title: "Site settings" };

export default async function SiteSettingsPage({ params }: PageProps<"/admin/sites/[siteId]/settings">) {
  const { siteId } = await params;
  const t = await getTenant(siteId);
  if (!t.can("site.settings")) notFound();
  const site = await prisma.site.findUniqueOrThrow({ where: { id: t.site.id }, select: { name: true, settings: true, branding: true } });
  const pages = await t.db.post.findMany({
    where: { postType: { key: "page" }, slug: { not: "home" }, status: { not: "TRASHED" } },
    orderBy: { title: "asc" },
    select: { id: true, title: true, slug: true, publishedRevisionId: true },
  });
  const assets = await t.db.mediaAsset.findMany({
    where: { mimeType: { startsWith: "image/" } },
    orderBy: { createdAt: "desc" },
    select: { id: true, url: true, title: true, altText: true, originalName: true, mimeType: true, width: true, height: true, sizeBytes: true },
  });

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="text-2xl font-semibold text-zinc-900">Site settings</h1>
      <p className="mb-6 text-sm text-zinc-500">The site&apos;s identity. Widgets bound to Site name, Site tagline or Site logo show these everywhere they appear.</p>
      <SiteIdentityForm
        siteId={t.site.id}
        initial={{
          name: site.name,
          tagline: ((site.settings ?? {}) as { tagline?: string }).tagline ?? "",
          logoAssetId: ((site.branding ?? {}) as { logoAssetId?: string | null }).logoAssetId ?? null,
          notFoundPageId: ((site.settings ?? {}) as { notFoundPageId?: string | null }).notFoundPageId ?? null,
        }}
        pages={pages.map((p) => ({ id: p.id, label: `${p.title} (/${p.slug})${p.publishedRevisionId ? "" : " · not published yet"}` }))}
        assets={assets}
        canUpload={t.can("media.upload")}
      />
    </main>
  );
}
