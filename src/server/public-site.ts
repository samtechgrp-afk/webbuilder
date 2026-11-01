import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/lib/db";
import { tenantDb } from "@/lib/tenant-db";
import { isBuilderDocument, type BuilderDocument } from "@/lib/builder/types";
import { composeDocument } from "@/lib/i18n/translate";
import { withFontFaces } from "@/lib/design/fonts";
import type { DesignTokens } from "@/lib/design/tokens";
import { ENTRY_INCLUDE, buildDynamicPosts, entryPath, inLocale, liveOriginal, loadDynamicData, localizedSources, type RevisionMeta } from "./cms/dynamic";

/** Cache tag for everything a tenant's public site renders. Publishing expires it. */
export const siteCacheTag = (siteId: string) => `site:${siteId}`;

/**
 * Public read path. Resolves a tenant by subdomain or custom domain and
 * returns only *published* revisions. Drafts are never reachable from here.
 * Every read is cached ("use cache") and tagged per site, so visitors hit
 * the cache and a publish refreshes exactly one tenant.
 */
export async function resolveSite(key: string) {
  "use cache";
  cacheLife("hours");
  const host = decodeURIComponent(key).toLowerCase();
  const site = await prisma.site.findFirst({
    where: { OR: [{ subdomain: host }, { customDomain: host }, { locales: { some: { domain: host } } }], status: { not: "SUSPENDED" } },
    // Custom fonts render with the tokens (see siteTokens), so a font change expires this read too.
    include: { fonts: { orderBy: { createdAt: "asc" }, select: { id: true, family: true, source: true, url: true, format: true, weight: true, style: true, fallback: true } } },
  });
  if (site) cacheTag(siteCacheTag(site.id));
  return site;
}

/** A resolved site's design tokens with its custom fonts attached, ready for the renderers. */
export function siteTokens(row: { designTokens: unknown; fonts?: Parameters<typeof withFontFaces>[1] }): DesignTokens {
  return withFontFaces((row.designTokens ?? {}) as DesignTokens, row.fonts);
}

const LIVE = { publishedRevisionId: { not: null }, status: { not: "TRASHED" as const } };

type SiteLike = { id: string; name: string; settings: unknown; branding: unknown };

/**
 * The document a live page renders: its own, or for a translation the
 * original's live layout with the translation's text and media laid over
 * it (so structure and styles never drift between languages).
 */
async function liveDocument(siteId: string, post: { locale: string; translation: { translationId: string } | null; publishedRevision: { document: unknown } | null }): Promise<BuilderDocument | null> {
  const own = post.publishedRevision?.document;
  if (!post.locale) return isBuilderDocument(own) ? own : null;
  const original = await liveOriginal(tenantDb(siteId), post);
  const base = original?.publishedRevision?.document;
  return isBuilderDocument(base) ? composeDocument(base, own) : null;
}

/** `locale` is the stored value: "" for the default language, else the locale code. */
export async function getPublishedPage(site: SiteLike, slugParts: string[] | undefined, linkBase: string, locale = "") {
  "use cache";
  cacheLife("hours");
  cacheTag(siteCacheTag(site.id));
  const slug = slugParts?.length ? slugParts.join("/") : "home";
  const post = await prisma.post.findFirst({
    where: { siteId: site.id, locale, slug, postType: { key: "page" }, ...LIVE },
    include: { ...ENTRY_INCLUDE, publishedRevision: true, ogImage: true },
  });
  if (!post?.publishedRevision) return null;
  const document = await liveDocument(site.id, post);
  if (!document) return null;
  const db = tenantDb(site.id);
  const [source] = await localizedSources(db, [post]);
  const data = await loadDynamicData(site.id, document, site, source, linkBase, locale);
  return { post, seo: ((post.publishedRevision.meta ?? {}) as RevisionMeta).seo, document, data, alternates: await liveGroup(site.id, post.id) };
}

/** The site's designated 404 page (in `locale` when it's translated), rendered by /site-404 with HTTP status 404. */
export async function getNotFoundPage(site: SiteLike, linkBase: string, locale = "") {
  "use cache";
  cacheLife("hours");
  cacheTag(siteCacheTag(site.id));
  const id = ((site.settings ?? {}) as { notFoundPageId?: string | null }).notFoundPageId;
  if (!id) return null;
  const include = { ...ENTRY_INCLUDE, publishedRevision: true } as const;
  const original = await prisma.post.findFirst({ where: { id, siteId: site.id, postType: { key: "page" }, ...LIVE }, include });
  if (!original) return null;
  const translated =
    locale && original.translation
      ? await prisma.post.findFirst({ where: { siteId: site.id, locale, translation: { translationId: original.translation.translationId }, ...LIVE }, include })
      : null;
  const post = translated ?? original;
  const document = await liveDocument(site.id, post);
  if (!document) return null;
  const [source] = await localizedSources(tenantDb(site.id), [post]);
  return { document, locale: translated ? locale : "", data: await loadDynamicData(site.id, document, site, source, linkBase, translated ? locale : "") };
}

/**
 * A single CPT entry at /<routePrefix>/<slug>. Rendered with the post type's
 * published single template when there is one, otherwise with the default
 * entry layout.
 */
export async function getPublishedEntry(site: SiteLike, prefix: string, slug: string, linkBase: string, locale = "") {
  "use cache";
  cacheLife("hours");
  cacheTag(siteCacheTag(site.id));
  const postType = await prisma.postType.findFirst({
    where: { siteId: site.id, routePrefix: prefix, key: { notIn: ["page", "template"] } },
    include: { singleTemplate: { include: { publishedRevision: true } } },
  });
  if (!postType) return null;
  const post = await prisma.post.findFirst({
    where: { siteId: site.id, postTypeId: postType.id, locale, slug, ...LIVE },
    include: { ...ENTRY_INCLUDE, publishedRevision: true, ogImage: true },
  });
  if (!post) return null;
  const db = tenantDb(site.id);
  const [source] = await localizedSources(db, [post]);
  if (!source) return null;
  const [entry] = await buildDynamicPosts(db, [source]);
  const tplDoc = postType.singleTemplate?.publishedRevision?.document;
  const template = isBuilderDocument(tplDoc) ? tplDoc : null;
  const data = template ? await loadDynamicData(site.id, template, site, source, linkBase, locale) : null;
  return { post, postType, entry, template, data, seo: ((post.publishedRevision?.meta ?? {}) as RevisionMeta).seo, alternates: await liveGroup(site.id, post.id) };
}

/** Archive listing at /<routePrefix> for post types with an archive; in another language, translated where possible. */
export async function getPublishedArchive(site: SiteLike, prefix: string, locale = "") {
  "use cache";
  cacheLife("hours");
  cacheTag(siteCacheTag(site.id));
  const postType = await prisma.postType.findFirst({ where: { siteId: site.id, routePrefix: prefix, hasArchive: true, key: { notIn: ["page", "template"] } } });
  if (!postType) return null;
  const posts = await prisma.post.findMany({
    where: { siteId: site.id, postTypeId: postType.id, locale: "", ...LIVE },
    orderBy: [{ menuOrder: "asc" }, { publishedAt: "desc" }],
    take: 48,
    include: { ...ENTRY_INCLUDE, publishedRevision: true },
  });
  const db = tenantDb(site.id);
  const entries = await buildDynamicPosts(db, (await inLocale(db, posts, locale)).filter((x) => !!x));
  return { postType, entries };
}

/**
 * The live members of a post's translation group with their site paths,
 * for hreflang alternates. Empty for an entry that has no translations.
 */
export async function liveGroup(siteId: string, postId: string): Promise<{ localeCode: string; path: string }[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(siteCacheTag(siteId));
  const group = await prisma.postTranslation.findUnique({ where: { postId }, select: { translationId: true } });
  if (!group) return [];
  const members = await prisma.postTranslation.findMany({
    where: { siteId, translationId: group.translationId, post: LIVE },
    select: { localeCode: true, post: { select: { slug: true, locale: true, postType: { select: { key: true, routePrefix: true } } } } },
  });
  // Translations only go live on top of a live original.
  if (!members.some((m) => !m.post.locale)) return [];
  return members.length > 1 ? members.map((m) => ({ localeCode: m.localeCode, path: entryPath(m.post.postType, m.post.slug) })) : [];
}

/** Published entries of an API-enabled post type, for /api/v1/sites/<site>/<type>. */
export async function getApiEntries(siteId: string, typeKey: string, page: number) {
  "use cache";
  cacheLife("minutes");
  cacheTag(siteCacheTag(siteId));
  const postType = await prisma.postType.findFirst({ where: { siteId, key: typeKey, apiEnabled: true } });
  if (!postType) return null;
  const take = 50;
  const [total, posts] = await Promise.all([
    prisma.post.count({ where: { siteId, postTypeId: postType.id, locale: "", ...LIVE } }),
    prisma.post.findMany({
      where: { siteId, postTypeId: postType.id, locale: "", ...LIVE },
      orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
      skip: (page - 1) * take,
      take,
      include: { ...ENTRY_INCLUDE, publishedRevision: true, terms: { include: { term: { select: { name: true, slug: true, taxonomy: { select: { key: true } } } } } } },
    }),
  ]);
  const entries = await buildDynamicPosts(tenantDb(siteId), (await localizedSources(tenantDb(siteId), posts)).filter((x) => !!x));
  return {
    postType: { key: postType.key, label: postType.labelPlural },
    total,
    page,
    pages: Math.max(1, Math.ceil(total / take)),
    items: entries.map((e, i) => ({
      id: e.id,
      title: e.title,
      slug: e.slug,
      url: e.url,
      date: e.date,
      excerpt: e.excerpt,
      author: e.authorName,
      featuredImage: e.featuredImage,
      content: e.content,
      terms: posts[i].terms.map((pt) => ({ taxonomy: pt.term.taxonomy.key, name: pt.term.name, slug: pt.term.slug })),
      fields: Object.fromEntries(Object.entries(e.fields).map(([k, f]) => [k, { label: f.label, text: f.text, url: f.url, image: f.image, gallery: f.gallery, price: f.price }])),
    })),
  };
}

export interface SearchHit {
  id: string;
  title: string;
  excerpt: string | null;
  url: string;
  kind: string;
}

/**
 * The site search page (/search?q=…): live pages and entries of one language
 * whose published title or excerpt contains the words. Hidden pages (noindex),
 * templates and the 404 page are left out.
 */
export async function searchSite(site: SiteLike, query: string, locale = ""): Promise<SearchHit[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag(siteCacheTag(site.id));
  const words = query.trim().split(/\s+/).filter(Boolean).slice(0, 6).map((w) => w.slice(0, 60));
  if (!words.length) return [];
  const notFoundPageId = ((site.settings ?? {}) as { notFoundPageId?: string | null }).notFoundPageId;
  const posts = await prisma.post.findMany({
    where: {
      siteId: site.id,
      locale,
      noIndex: false,
      postType: { key: { not: "template" } },
      ...LIVE,
      ...(notFoundPageId ? { NOT: { id: notFoundPageId } } : {}),
      AND: words.map((w) => ({ OR: [{ publishedRevision: { title: { contains: w, mode: "insensitive" as const } } }, { excerpt: { contains: w, mode: "insensitive" as const } }] })),
    },
    orderBy: [{ publishedAt: "desc" }],
    take: 30,
    select: { id: true, slug: true, excerpt: true, publishedRevision: { select: { title: true } }, postType: { select: { key: true, routePrefix: true, labelSingular: true } } },
  });
  return posts.map((p) => ({
    id: p.id,
    title: p.publishedRevision?.title ?? p.slug,
    excerpt: p.excerpt,
    url: entryPath(p.postType, p.slug),
    kind: p.postType.key === "page" ? "Page" : p.postType.labelSingular,
  }));
}
