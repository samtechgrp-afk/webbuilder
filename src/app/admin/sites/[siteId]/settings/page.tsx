import type { Metadata } from "next";
import Link from "next/link";
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
    where: { postType: { key: "page" }, locale: "", slug: { not: "home" }, status: { not: "TRASHED" } },
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
      <section className="mt-6 flex items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-white px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">Languages</h2>
          <p className="text-xs text-zinc-500">Publish the site in more than one language, with prefixed addresses or a domain per language.</p>
        </div>
        <Link href={`/admin/sites/${t.site.id}/settings/languages`} className="rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50" data-languages-link="">
          Manage languages
        </Link>
      </section>
      <section className="mt-4 flex items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-white px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">Payments</h2>
          <p className="text-xs text-zinc-500">Connect Stripe Checkout, choose where the shop ships and the product page template.</p>
        </div>
        <Link href={`/admin/sites/${t.site.id}/settings/payments`} className="rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50" data-payments-link="">
          Payment settings
        </Link>
      </section>
    </main>
  );
}
