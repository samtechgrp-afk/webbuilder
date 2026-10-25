import "server-only";
import { cacheLife, cacheTag, updateTag } from "next/cache";
import { prisma } from "@/lib/db";
import { canonicalPointsElsewhere, resolveSeo, seoIssues, type EntrySeo, type ResolvedSeo, type SeoIssue } from "@/lib/seo/meta";
import { readSiteSeo, siteSeoSchema, type SiteSeo, type SiteSeoInput } from "@/lib/seo/settings";
import type { SitemapUrl } from "@/lib/seo/sitemap";
import type { TenantContext } from "@/lib/tenant";
import { EditError } from "../content-service";
import type { RevisionMeta } from "../cms/dynamic";
import { asJson } from "../cms/snapshot";
import { siteCacheTag } from "../public-site";

/**
 * SEO for a site: the defaults screen, the sitemap and the audit. All of it
 * follows the live-site rules from the 404 work: only published entries
 * that aren't in the trash, never the designated 404 page, and nothing
 * marked noindex, excluded by post type, or canonicalised elsewhere.
 */

const LIVE = { publishedRevisionId: { not: null }, status: { not: "TRASHED" as const } };

/** Root-relative path of an entry on its site. */
export function entryPath(postType: { key: string; routePrefix: string | null }, slug: string) {
  if (postType.key === "page") return slug === "home" ? "/" : `/${slug}`;
  return `/${postType.routePrefix ?? postType.key}/${slug}`;
}

export async function saveSiteSeo(t: TenantContext, raw: SiteSeoInput) {
  t.assert("site.settings");
  const parsed = siteSeoSchema.safeParse(raw);
  if (!parsed.success) throw new EditError(parsed.error.issues[0]?.message ?? "Invalid SEO settings", "invalid");
  const input = parsed.data;
  if (input.defaultOgImageId) {
    const img = await t.db.mediaAsset.findUnique({ where: { id: input.defaultOgImageId }, select: { mimeType: true } });
    if (!img?.mimeType.startsWith("image/") || img.mimeType === "image/svg+xml") throw new EditError("Pick a photo (not an SVG) from this site's media library as the share image", "invalid");
  }
  const types = input.excludedPostTypeIds.length ? await t.db.postType.count({ where: { id: { in: input.excludedPostTypeIds } } }) : 0;
  if (types !== input.excludedPostTypeIds.length) throw new EditError("A post type doesn't belong to this site", "invalid");
  const site = await prisma.site.findUniqueOrThrow({ where: { id: t.site.id }, select: { settings: true } });
  const seo: SiteSeo = { ...input, defaultOgImageId: input.defaultOgImageId || null };
  await prisma.site.update({ where: { id: t.site.id }, data: { settings: asJson({ ...(site.settings as object), seo }) } });
  await t.db.auditLog.create({ data: { siteId: t.site.id, userId: t.user.id, action: "seo.settings" } });
  updateTag(siteCacheTag(t.site.id));
  return {};
}

/** Every live entry with what it shows to search engines, from its published snapshot. */
async function liveEntries(siteId: string) {
  const site = await prisma.site.findUniqueOrThrow({ where: { id: siteId }, select: { name: true, settings: true } });
  const seo = readSiteSeo(site.settings);
  const notFoundPageId = ((site.settings ?? {}) as { notFoundPageId?: string | null }).notFoundPageId ?? null;
  const posts = await prisma.post.findMany({
    where: {
      siteId,
      ...LIVE,
      ...(notFoundPageId ? { id: { not: notFoundPageId } } : {}),
      postType: { key: { not: "template" } },
    },
    orderBy: [{ postType: { key: "asc" } }, { menuOrder: "asc" }, { publishedAt: "desc" }],
    select: {
      id: true,
      slug: true,
      title: true,
      publishedAt: true,
      updatedAt: true,
      postTypeId: true,
      postType: { select: { key: true, routePrefix: true, labelSingular: true } },
      publishedRevision: { select: { title: true, meta: true, createdAt: true } },
    },
  });
  const excluded = new Set(seo.excludedPostTypeIds ?? []);
  return {
    site: { name: site.name, seo },
    entries: posts.map((p) => {
      const meta = (p.publishedRevision?.meta ?? {}) as RevisionMeta;
      return {
        id: p.id,
        title: p.publishedRevision?.title ?? p.title,
        path: entryPath(p.postType, p.slug),
        isHome: p.postType.key === "page" && p.slug === "home",
        typeLabel: p.postType.labelSingular,
        excerpt: meta.excerpt ?? null,
        seo: (meta.seo ?? {}) as EntrySeo,
        excluded: excluded.has(p.postTypeId),
        lastmod: p.publishedRevision?.createdAt ?? p.publishedAt ?? p.updatedAt,
        hasImage: !!(meta.seo?.ogImageId || meta.featuredImageId || seo.defaultOgImageId),
      };
    }),
  };
}

/** URLs for /sitemap.xml. Cached per site and expired on every publish. */
export async function getSitemapUrls(siteId: string, base: string): Promise<SitemapUrl[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(siteCacheTag(siteId));
  const { site, entries } = await liveEntries(siteId);
  if (site.seo.discourageIndexing) return [];
  const urls: SitemapUrl[] = [];
  for (const e of entries) {
    const r = resolveSeo(e, site, base);
    if (!r.index || canonicalPointsElsewhere(r, base, e.path)) continue;
    urls.push({ loc: r.canonical, lastmod: e.lastmod, priority: e.isHome ? 1 : e.path.split("/").length > 2 ? 0.6 : 0.8 });
  }
  const archives = await prisma.postType.findMany({
    where: { siteId, hasArchive: true, key: { notIn: ["page", "template"] }, id: { notIn: site.seo.excludedPostTypeIds ?? [] } },
    select: { routePrefix: true, key: true },
  });
  for (const a of archives) urls.push({ loc: `${base.replace(/\/+$/, "")}/${a.routePrefix ?? a.key}`, changefreq: "weekly", priority: 0.7 });
  // Home first, then pages and archives, then entries (stable within each).
  return urls.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
}

export interface AuditRow {
  id: string;
  title: string;
  path: string;
  typeLabel: string;
  resolved: ResolvedSeo;
  issues: SeoIssue[];
}

/** The SEO audit: every live page and entry with what search engines see and what to fix. */
export async function seoAudit(t: TenantContext, base: string): Promise<AuditRow[]> {
  if (!t.can("content.edit") && !t.can("site.settings")) t.assert("site.settings");
  const { site, entries } = await liveEntries(t.site.id);
  const resolved = entries.map((e) => ({ e, r: resolveSeo(e, site, base) }));
  const titleCounts = new Map<string, number>();
  for (const { r } of resolved) titleCounts.set(r.title.toLowerCase(), (titleCounts.get(r.title.toLowerCase()) ?? 0) + 1);
  return resolved.map(({ e, r }) => ({ id: e.id, title: e.title, path: e.path, typeLabel: e.typeLabel, resolved: r, issues: seoIssues(r, { hasImage: e.hasImage, titleCounts }) }));
}

/** The first of the given images that still exists, for og:image. Cached with the site. */
export async function getShareImage(siteId: string, ids: (string | null | undefined)[]) {
  "use cache";
  cacheLife("hours");
  cacheTag(siteCacheTag(siteId));
  for (const id of ids) {
    if (!id) continue;
    const a = await prisma.mediaAsset.findFirst({ where: { id, siteId, mimeType: { startsWith: "image/", not: "image/svg+xml" } }, select: { url: true, width: true, height: true, altText: true } });
    if (a) return a;
  }
  return null;
}
