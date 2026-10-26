import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/cms/ui";
import { prisma } from "@/lib/db";
import { absoluteUrl } from "@/lib/seo/meta";
import { readSiteSeo } from "@/lib/seo/settings";
import { getTenant } from "@/lib/tenant";
import { publicBaseUrl } from "@/server/seo/public-url";
import { seoAudit } from "@/server/seo/seo-service";
import { SeoSettingsForm } from "./SeoSettingsForm";

export const metadata: Metadata = { title: "SEO" };

/**
 * SEO for one site: an audit of every live page (anyone who edits content
 * can fix what it flags) and the site-wide defaults (site settings holders).
 */
export default async function SeoPage({ params }: PageProps<"/admin/sites/[siteId]/seo">) {
  const { siteId } = await params;
  const t = await getTenant(siteId);
  const canSettings = t.can("site.settings");
  if (!canSettings && !t.can("content.edit")) notFound();

  const site = await prisma.site.findUniqueOrThrow({ where: { id: t.site.id }, select: { subdomain: true, customDomain: true, settings: true } });
  const base = await publicBaseUrl(site);
  const rows = await seoAudit(t, base);
  const seo = readSiteSeo(site.settings);
  const [postTypes, assets] = canSettings
    ? await Promise.all([
        t.db.postType.findMany({ where: { key: { not: "template" } }, orderBy: { labelPlural: "asc" }, select: { id: true, labelPlural: true } }),
        t.db.mediaAsset.findMany({
          where: { mimeType: { startsWith: "image/", not: "image/svg+xml" } },
          orderBy: { createdAt: "desc" },
          select: { id: true, url: true, title: true, altText: true, originalName: true, mimeType: true, width: true, height: true, sizeBytes: true },
        }),
      ])
    : [[], []];
  const issues = rows.reduce((n, r) => n + r.issues.filter((i) => i.severity !== "info").length, 0);

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">SEO</h1>
        <p className="text-sm text-zinc-500">
          What search engines and social cards show for each live page. Files for crawlers:{" "}
          <a className="underline" href={absoluteUrl(base, "/sitemap.xml")} target="_blank" rel="noreferrer">
            sitemap.xml
          </a>{" "}
          ·{" "}
          <a className="underline" href={absoluteUrl(base, "/robots.txt")} target="_blank" rel="noreferrer">
            robots.txt
          </a>
        </p>
      </div>

      <Card title={`Audit · ${rows.length} live pages · ${issues} to fix`}>
        <div className="-mx-5 -mb-5 overflow-x-auto">
          <table className="w-full text-left text-sm" data-seo-audit="">
            <thead className="border-b border-zinc-200 text-xs text-zinc-500">
              <tr>
                <th className="px-5 py-2 font-medium">Page</th>
                <th className="px-3 py-2 font-medium">Search result</th>
                <th className="px-5 py-2 font-medium">Checks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map((r) => (
                <tr key={r.id} data-seo-row={r.path} className="align-top">
                  <td className="w-56 px-5 py-3">
                    <Link href={`/admin/sites/${t.site.id}/content/${r.id}`} className="font-medium text-zinc-900 hover:underline">
                      {r.title}
                    </Link>
                    <p className="text-xs text-zinc-500">
                      {r.typeLabel} · {r.path}
                    </p>
                  </td>
                  <td className="max-w-md px-3 py-3">
                    <p className="truncate text-xs text-emerald-800">{r.resolved.canonical}</p>
                    <p className="truncate text-[15px] text-indigo-800">{r.resolved.title}</p>
                    <p className="line-clamp-2 text-xs text-zinc-600">{r.resolved.description ?? <span className="italic text-zinc-400">No description</span>}</p>
                  </td>
                  <td className="w-80 px-5 py-3">
                    {r.issues.length === 0 ? (
                      <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">All good</span>
                    ) : (
                      <ul className="space-y-1">
                        {r.issues.map((i) => (
                          <li
                            key={i.code}
                            data-issue={i.code}
                            className={`rounded px-2 py-0.5 text-xs ${i.severity === "error" ? "bg-red-50 text-red-800" : i.severity === "warning" ? "bg-amber-50 text-amber-900" : "bg-zinc-100 text-zinc-600"}`}
                          >
                            {i.message}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {canSettings && (
        <SeoSettingsForm
          siteId={t.site.id}
          siteName={t.site.name}
          initial={{
            titleTemplate: seo.titleTemplate ?? "",
            homeTitle: seo.homeTitle ?? "",
            defaultDescription: seo.defaultDescription ?? "",
            defaultOgImageId: seo.defaultOgImageId ?? null,
            twitterHandle: seo.twitterHandle ?? "",
            googleVerification: seo.googleVerification ?? "",
            bingVerification: seo.bingVerification ?? "",
            discourageIndexing: !!seo.discourageIndexing,
            excludedPostTypeIds: seo.excludedPostTypeIds ?? [],
          }}
          postTypes={postTypes.map((p) => ({ id: p.id, label: p.labelPlural }))}
          assets={assets}
          canUpload={t.can("media.upload")}
        />
      )}
    </main>
  );
}
