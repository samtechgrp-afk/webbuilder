import { prisma } from "@/lib/db";
import { splitLocalePath, type SiteLocaleInfo } from "@/lib/i18n/locales";
import { PRODUCT_BASE } from "@/lib/commerce/types";

/**
 * Does a public URL resolve to live content? The proxy asks this before
 * rendering so a miss can be answered with a real HTTP 404: with Partial
 * Prerendering the page's shell is already streaming (status 200) by the
 * time the page itself could call notFound().
 *
 * Mirrors the resolution order of src/app/sites/[site]/[[...slug]]: a
 * builder page at the full path, a CPT entry at /<prefix>/<slug>, an
 * active shop product at /products/<slug>, a CPT archive at /<prefix>. Only live content counts (a published revision and
 * not in the trash), so drafts, scheduled and trashed entries are 404s.
 * The site's designated 404 page is never served at its own address.
 *
 * On a multilingual site the first segment may select a language (/fr/…),
 * or the host may be a language's own domain. A path that exists only in
 * the default language either redirects to its translation (when the
 * translation lives at another slug) or falls back to the default content.
 */
const LIVE = { publishedRevisionId: { not: null }, status: { not: "TRASHED" as const } };

export interface RouteAlternate {
  localeCode: string;
  path: string;
}

export type RouteCheck =
  | { site: false }
  | {
      site: true;
      exists: boolean;
      locales: SiteLocaleInfo[];
      /** The language whose domain this host is. */
      hostLocale: string | null;
      /** The language the path asked for. */
      locale: string | null;
      prefixed: boolean;
      /** Site path (no prefix) of the translation to redirect to. */
      redirect?: string;
      /** The default-language version is shown because there's no translation. */
      fallback?: boolean;
      alternates: RouteAlternate[];
      subdomain: string;
      customDomain: string | null;
      localeDetection: boolean;
    };

type Hit = { postId: string } | { archive: string } | { product: string };

async function findContent(siteId: string, parts: string[], locale: string, hidden: string[]): Promise<Hit | null> {
  const slug = parts.length ? parts.join("/") : "home";
  const page = await prisma.post.findFirst({
    where: { siteId, locale, slug, postType: { key: "page" }, ...LIVE, ...(hidden.length ? { id: { notIn: hidden } } : {}) },
    select: { id: true },
  });
  if (page) return { postId: page.id };

  if (parts.length === 2) {
    const entry = await prisma.post.findFirst({
      where: { siteId, locale, slug: parts[1], postType: { routePrefix: parts[0], key: { notIn: ["page", "template"] } }, ...LIVE },
      select: { id: true },
    });
    if (entry) return { postId: entry.id };
    if (parts[0] === PRODUCT_BASE) {
      const product = await prisma.product.findFirst({ where: { siteId, slug: parts[1], status: "ACTIVE" }, select: { slug: true } });
      if (product) return { product: product.slug };
    }
  }
  if (parts.length === 1) {
    const archive = await prisma.postType.findFirst({
      where: { siteId, routePrefix: parts[0], hasArchive: true, key: { notIn: ["page", "template"] } },
      select: { routePrefix: true },
    });
    if (archive) return { archive: archive.routePrefix ?? parts[0] };
  }
  return null;
}

function entryPath(postType: { key: string; routePrefix: string | null }, slug: string) {
  if (postType.key === "page") return slug === "home" ? "/" : `/${slug}`;
  return `/${postType.routePrefix || postType.key}/${slug}`;
}

/** Live members of the hit's translation group (archives exist in every language). */
async function alternatesFor(siteId: string, hit: Hit, locales: SiteLocaleInfo[]): Promise<RouteAlternate[]> {
  if (!locales.length) return [];
  if ("archive" in hit) return locales.map((l) => ({ localeCode: l.code, path: `/${hit.archive}` }));
  if ("product" in hit) return locales.map((l) => ({ localeCode: l.code, path: `/${PRODUCT_BASE}/${hit.product}` }));
  const group = await prisma.postTranslation.findUnique({ where: { postId: hit.postId }, select: { translationId: true } });
  if (!group) return [];
  const members = await prisma.postTranslation.findMany({
    where: { siteId, translationId: group.translationId, post: LIVE },
    select: { localeCode: true, post: { select: { slug: true, locale: true, postType: { select: { key: true, routePrefix: true } } } } },
  });
  if (!members.some((m) => !m.post.locale)) return [];
  return members.map((m) => ({ localeCode: m.localeCode, path: entryPath(m.post.postType, m.post.slug) }));
}

async function notFoundGroup(postId: string) {
  const group = await prisma.postTranslation.findUnique({ where: { postId }, select: { translationId: true } });
  if (!group) return [postId];
  const members = await prisma.postTranslation.findMany({ where: { translationId: group.translationId }, select: { postId: true } });
  return [postId, ...members.map((m) => m.postId)];
}

export async function checkPublicRoute(key: string, slugParts: string[]): Promise<RouteCheck> {
  const host = decodeURIComponent(key).toLowerCase();
  const site = await prisma.site.findFirst({
    where: { OR: [{ subdomain: host }, { customDomain: host }, { locales: { some: { domain: host } } }], status: { not: "SUSPENDED" } },
    select: {
      id: true,
      settings: true,
      subdomain: true,
      customDomain: true,
      localeDetection: true,
      locales: { orderBy: [{ isDefault: "desc" }, { order: "asc" }, { createdAt: "asc" }], select: { code: true, label: true, prefix: true, isDefault: true, currency: true, domain: true } },
    },
  });
  if (!site) return { site: false };
  const notFoundPageId = ((site.settings ?? {}) as { notFoundPageId?: string | null }).notFoundPageId ?? null;
  // The 404 page (and its translations) is never served at its own address.
  const hidden = notFoundPageId ? await notFoundGroup(notFoundPageId) : [];
  const locales = site.locales;
  const hostLocale = locales.find((l) => l.domain === host && !l.isDefault)?.code ?? null;
  const { locale, rest, prefixed } = splitLocalePath(slugParts, locales, hostLocale);
  const stored = locale && !locale.isDefault ? locale.code : "";
  const base = { site: true as const, locales, hostLocale, locale: locale?.code ?? null, prefixed, subdomain: site.subdomain, customDomain: site.customDomain, localeDetection: site.localeDetection };

  const hit = await findContent(site.id, rest, stored, hidden);
  if (hit) return { ...base, exists: true, alternates: await alternatesFor(site.id, hit, locales) };
  if (stored) {
    const original = await findContent(site.id, rest, "", hidden);
    if (original) {
      const alternates = await alternatesFor(site.id, original, locales);
      const translated = alternates.find((a) => a.localeCode === stored);
      if (translated) return { ...base, exists: true, redirect: translated.path, alternates };
      return { ...base, exists: true, fallback: true, alternates };
    }
  }
  return { ...base, exists: false, alternates: [] };
}
