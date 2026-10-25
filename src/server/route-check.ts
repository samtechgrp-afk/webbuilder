import { prisma } from "@/lib/db";

/**
 * Does a public URL resolve to live content? The proxy asks this before
 * rendering so a miss can be answered with a real HTTP 404: with Partial
 * Prerendering the page's shell is already streaming (status 200) by the
 * time the page itself could call notFound().
 *
 * Mirrors the resolution order of src/app/sites/[site]/[[...slug]]: a
 * builder page at the full path, a CPT entry at /<prefix>/<slug>, a CPT
 * archive at /<prefix>. Only live content counts (a published revision and
 * not in the trash), so drafts, scheduled and trashed entries are 404s.
 * The site's designated 404 page is never served at its own address.
 */
const LIVE = { publishedRevisionId: { not: null }, status: { not: "TRASHED" as const } };

export type RouteCheck = { site: false } | { site: true; exists: boolean };

export async function checkPublicRoute(key: string, slugParts: string[]): Promise<RouteCheck> {
  const host = decodeURIComponent(key).toLowerCase();
  const site = await prisma.site.findFirst({
    where: { OR: [{ subdomain: host }, { customDomain: host }], status: { not: "SUSPENDED" } },
    select: { id: true, settings: true },
  });
  if (!site) return { site: false };
  const notFoundPageId = ((site.settings ?? {}) as { notFoundPageId?: string | null }).notFoundPageId ?? undefined;

  const slug = slugParts.length ? slugParts.join("/") : "home";
  const page = await prisma.post.findFirst({
    where: { siteId: site.id, slug, postType: { key: "page" }, ...LIVE, ...(notFoundPageId ? { id: { not: notFoundPageId } } : {}) },
    select: { id: true },
  });
  if (page) return { site: true, exists: true };

  if (slugParts.length === 2) {
    const entry = await prisma.post.findFirst({
      where: { siteId: site.id, slug: slugParts[1], postType: { routePrefix: slugParts[0], key: { notIn: ["page", "template"] } }, ...LIVE },
      select: { id: true },
    });
    if (entry) return { site: true, exists: true };
  }
  if (slugParts.length === 1) {
    const archive = await prisma.postType.findFirst({
      where: { siteId: site.id, routePrefix: slugParts[0], hasArchive: true, key: { notIn: ["page", "template"] } },
      select: { id: true },
    });
    if (archive) return { site: true, exists: true };
  }
  return { site: true, exists: false };
}
