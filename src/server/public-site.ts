import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/lib/db";
import { isBuilderDocument } from "@/lib/builder/types";

/** Cache tag for everything a tenant's public site renders. Publishing expires it. */
export const siteCacheTag = (siteId: string) => `site:${siteId}`;

/**
 * Public read path. Resolves a tenant by subdomain or custom domain and
 * returns only *published* revisions. Drafts are never reachable from here.
 * Both reads are cached ("use cache") and tagged per site, so visitors hit
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

export async function getPublishedPage(siteId: string, slugParts: string[] | undefined) {
  "use cache";
  cacheLife("hours");
  cacheTag(siteCacheTag(siteId));
  const slug = slugParts?.length ? slugParts.join("/") : "home";
  const post = await prisma.post.findFirst({
    where: { siteId, slug, status: "PUBLISHED", postType: { usesBuilder: true }, publishedRevisionId: { not: null } },
    include: { publishedRevision: true, ogImage: true },
  });
  if (!post?.publishedRevision || !isBuilderDocument(post.publishedRevision.document)) return null;
  return { post, document: post.publishedRevision.document };
}
