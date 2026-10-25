import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/lib/db";
import { tenantDb } from "@/lib/tenant-db";
import { isBuilderDocument } from "@/lib/builder/types";
import { ENTRY_INCLUDE, buildDynamicPosts, loadDynamicData, publishedSource, type RevisionMeta } from "./cms/dynamic";

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
    where: { OR: [{ subdomain: host }, { customDomain: host }], status: { not: "SUSPENDED" } },
  });
  if (site) cacheTag(siteCacheTag(site.id));
  return site;
}

const LIVE = { publishedRevisionId: { not: null }, status: { not: "TRASHED" as const } };

type SiteLike = { id: string; name: string; settings: unknown; branding: unknown };

export async function getPublishedPage(site: SiteLike, slugParts: string[] | undefined, linkBase: string) {
  "use cache";
  cacheLife("hours");
  cacheTag(siteCacheTag(site.id));
  const slug = slugParts?.length ? slugParts.join("/") : "home";
  const post = await prisma.post.findFirst({
    where: { siteId: site.id, slug, postType: { key: "page" }, ...LIVE },
    include: { ...ENTRY_INCLUDE, publishedRevision: true, ogImage: true },
  });
  if (!post?.publishedRevision || !isBuilderDocument(post.publishedRevision.document)) return null;
  const document = post.publishedRevision.document;
  const data = await loadDynamicData(site.id, document, site, publishedSource(post), linkBase);
  return { post, seo: ((post.publishedRevision.meta ?? {}) as RevisionMeta).seo, document, data };
}

/**
 * A single CPT entry at /<routePrefix>/<slug>. Rendered with the post type's
 * published single template when there is one, otherwise with the default
 * entry layout.
 */
export async function getPublishedEntry(site: SiteLike, prefix: string, slug: string, linkBase: string) {
  "use cache";
  cacheLife("hours");
  cacheTag(siteCacheTag(site.id));
  const postType = await prisma.postType.findFirst({
    where: { siteId: site.id, routePrefix: prefix, key: { notIn: ["page", "template"] } },
    include: { singleTemplate: { include: { publishedRevision: true } } },
  });
  if (!postType) return null;
  const post = await prisma.post.findFirst({
    where: { siteId: site.id, postTypeId: postType.id, slug, ...LIVE },
    include: { ...ENTRY_INCLUDE, publishedRevision: true, ogImage: true },
  });
  const source = post && publishedSource(post);
  if (!post || !source) return null;
  const db = tenantDb(site.id);
  const [entry] = await buildDynamicPosts(db, [source]);
  const tplDoc = postType.singleTemplate?.publishedRevision?.document;
  const template = isBuilderDocument(tplDoc) ? tplDoc : null;
  const data = template ? await loadDynamicData(site.id, template, site, source, linkBase) : null;
  return { post, postType, entry, template, data, seo: ((post.publishedRevision?.meta ?? {}) as RevisionMeta).seo };
}

/** Archive listing at /<routePrefix> for post types with an archive. */
export async function getPublishedArchive(site: SiteLike, prefix: string) {
  "use cache";
  cacheLife("hours");
  cacheTag(siteCacheTag(site.id));
  const postType = await prisma.postType.findFirst({ where: { siteId: site.id, routePrefix: prefix, hasArchive: true, key: { notIn: ["page", "template"] } } });
  if (!postType) return null;
  const posts = await prisma.post.findMany({
    where: { siteId: site.id, postTypeId: postType.id, ...LIVE },
    orderBy: [{ menuOrder: "asc" }, { publishedAt: "desc" }],
    take: 48,
    include: { ...ENTRY_INCLUDE, publishedRevision: true },
  });
  const entries = await buildDynamicPosts(tenantDb(site.id), posts.map(publishedSource).filter((x) => !!x));
  return { postType, entries };
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
    prisma.post.count({ where: { siteId, postTypeId: postType.id, ...LIVE } }),
    prisma.post.findMany({
      where: { siteId, postTypeId: postType.id, ...LIVE },
      orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
      skip: (page - 1) * take,
      take,
      include: { ...ENTRY_INCLUDE, publishedRevision: true, terms: { include: { term: { select: { name: true, slug: true, taxonomy: { select: { key: true } } } } } } },
    }),
  ]);
  const entries = await buildDynamicPosts(tenantDb(siteId), posts.map(publishedSource).filter((x) => !!x));
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
