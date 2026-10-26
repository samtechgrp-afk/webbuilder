import "server-only";
import { cacheLife, cacheTag, updateTag } from "next/cache";
import { prisma } from "@/lib/db";
import { localeInputSchema, type LocaleInput, type SiteLocaleInfo } from "@/lib/i18n/locales";
import type { TenantContext } from "@/lib/tenant";
import { EditError } from "../content-service";
import { siteCacheTag } from "../public-site";

/**
 * A site's languages. The first language added becomes the default and
 * keeps the clean URLs every existing page already has; the others get a
 * URL prefix (/fr) or their own domain. Only people with `site.settings`
 * (designers) add, edit or remove languages.
 */

const LOCALE_SELECT = { code: true, label: true, prefix: true, isDefault: true, currency: true, domain: true } as const;
const LOCALE_ORDER = [{ isDefault: "desc" as const }, { order: "asc" as const }, { createdAt: "asc" as const }];

/** Public, cached: the site's languages, default first. Empty for a single-language site. */
export async function getSiteLocales(siteId: string): Promise<SiteLocaleInfo[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(siteCacheTag(siteId));
  return prisma.siteLocale.findMany({ where: { siteId }, orderBy: LOCALE_ORDER, select: LOCALE_SELECT });
}

/** Uncached, for admin screens and the proxy. */
export const readSiteLocales = (siteId: string): Promise<SiteLocaleInfo[]> =>
  prisma.siteLocale.findMany({ where: { siteId }, orderBy: LOCALE_ORDER, select: LOCALE_SELECT });

export async function listLocales(t: TenantContext) {
  const [rows, counts, site] = await Promise.all([
    t.db.siteLocale.findMany({ orderBy: LOCALE_ORDER }),
    t.db.post.groupBy({ by: ["locale"], where: { status: { not: "TRASHED" }, postType: { key: { not: "template" } } }, _count: { _all: true } }),
    prisma.site.findUniqueOrThrow({ where: { id: t.site.id }, select: { localeDetection: true } }),
  ]);
  const byLocale = new Map(counts.map((c) => [c.locale, c._count._all]));
  return {
    localeDetection: site.localeDetection,
    locales: rows.map((l) => ({ id: l.id, code: l.code, label: l.label, prefix: l.prefix, isDefault: l.isDefault, currency: l.currency, domain: l.domain, entries: byLocale.get(l.isDefault ? "" : l.code) ?? 0 })),
  };
}

/** Top-level paths a prefix can't take: platform paths, SEO files, post type prefixes and page slugs. */
async function assertPrefixFree(t: TenantContext, prefix: string) {
  if (["admin", "login", "logout", "api", "uploads", "sites", "site-404", "_next", "home"].includes(prefix)) throw new EditError(`"${prefix}" is reserved; pick another URL prefix`, "invalid");
  const [postType, page] = await Promise.all([
    t.db.postType.findFirst({ where: { OR: [{ routePrefix: prefix }, { key: prefix }] }, select: { labelPlural: true } }),
    t.db.post.findFirst({ where: { slug: { in: [prefix], mode: "insensitive" }, postType: { key: "page" }, locale: "" }, select: { title: true } }),
  ]);
  if (postType) throw new EditError(`/${prefix} is already the address of ${postType.labelPlural}`, "invalid");
  if (page) throw new EditError(`/${prefix} is already the address of the page "${page.title}"`, "invalid");
}

async function assertDomainFree(domain: string | null | undefined, exceptId?: string) {
  if (!domain) return;
  const root = (process.env.ROOT_DOMAIN ?? "localhost:3000").toLowerCase();
  if (domain === root || domain.endsWith(`.${root}`)) throw new EditError("Use a domain you own, not a platform address", "invalid");
  const [site, locale] = await Promise.all([
    prisma.site.findFirst({ where: { customDomain: domain }, select: { id: true } }),
    prisma.siteLocale.findFirst({ where: { domain, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true } }),
  ]);
  if (site || locale) throw new EditError("That domain is already connected to a site", "invalid");
}

function parse(raw: LocaleInput) {
  const parsed = localeInputSchema.safeParse(raw);
  if (!parsed.success) throw new EditError(parsed.error.issues[0]?.message ?? "Invalid language", "invalid");
  return parsed.data;
}

export async function addLocale(t: TenantContext, raw: LocaleInput) {
  t.assert("site.settings");
  const input = parse(raw);
  const existing = await t.db.siteLocale.findMany({ select: { code: true, prefix: true, order: true } });
  if (existing.length >= 20) throw new EditError("A site can have up to 20 languages", "invalid");
  if (existing.some((l) => l.code === input.code)) throw new EditError(`${input.code} is already one of this site's languages`, "invalid");
  const isDefault = existing.length === 0;
  if (!isDefault) {
    if (existing.some((l) => l.prefix === input.prefix)) throw new EditError(`Another language already uses /${input.prefix}`, "invalid");
    await assertPrefixFree(t, input.prefix);
  }
  await assertDomainFree(input.domain);
  const row = await t.db.siteLocale.create({
    data: { siteId: t.site.id, code: input.code, label: input.label, prefix: input.prefix, currency: input.currency, domain: isDefault ? null : (input.domain ?? null), isDefault, order: Math.max(0, ...existing.map((l) => l.order)) + 1 },
  });
  await t.db.auditLog.create({ data: { siteId: t.site.id, userId: t.user.id, action: "locale.add", targetId: row.id, data: { code: row.code } } });
  updateTag(siteCacheTag(t.site.id));
  return { id: row.id };
}

export async function updateLocale(t: TenantContext, id: string, raw: LocaleInput) {
  t.assert("site.settings");
  const input = parse(raw);
  const row = await t.db.siteLocale.findUnique({ where: { id } });
  if (!row) throw new EditError("Language not found", "not_found");
  const others = await t.db.siteLocale.findMany({ where: { id: { not: id } }, select: { code: true, prefix: true } });
  if (others.some((l) => l.code === input.code)) throw new EditError(`${input.code} is already one of this site's languages`, "invalid");
  if (!row.isDefault && input.prefix !== row.prefix) {
    if (others.some((l) => l.prefix === input.prefix)) throw new EditError(`Another language already uses /${input.prefix}`, "invalid");
    await assertPrefixFree(t, input.prefix);
  }
  if (!row.isDefault && input.domain !== row.domain) await assertDomainFree(input.domain, id);

  await t.db.$transaction(async (tx) => {
    await tx.siteLocale.update({
      where: { id },
      data: { code: input.code, label: input.label, prefix: row.isDefault ? row.prefix : input.prefix, currency: input.currency, domain: row.isDefault ? null : (input.domain ?? null) },
    });
    if (input.code !== row.code) {
      // Translation groups always name the real code; entries in the default language store "".
      await tx.postTranslation.updateMany({ where: { localeCode: row.code }, data: { localeCode: input.code } });
      if (!row.isDefault) await tx.post.updateMany({ where: { locale: row.code }, data: { locale: input.code } });
    }
    await tx.auditLog.create({ data: { siteId: t.site.id, userId: t.user.id, action: "locale.update", targetId: id, data: { code: input.code } } });
  });
  updateTag(siteCacheTag(t.site.id));
  return {};
}

export async function deleteLocale(t: TenantContext, id: string) {
  t.assert("site.settings");
  const row = await t.db.siteLocale.findUnique({ where: { id } });
  if (!row) throw new EditError("Language not found", "not_found");
  if (row.isDefault) {
    if ((await t.db.siteLocale.count()) > 1) throw new EditError("Remove the other languages before the default one", "invalid");
  } else {
    const entries = await t.db.post.count({ where: { locale: row.code } });
    if (entries) throw new EditError(`${row.label} still has ${entries} ${entries === 1 ? "translation" : "translations"}. Delete them (and empty the trash) first.`, "invalid");
  }
  await t.db.$transaction(async (tx) => {
    await tx.postTranslation.deleteMany({ where: { localeCode: row.code } });
    await tx.siteLocale.delete({ where: { id } });
    await tx.auditLog.create({ data: { siteId: t.site.id, userId: t.user.id, action: "locale.delete", targetId: id, data: { code: row.code } } });
  });
  updateTag(siteCacheTag(t.site.id));
  return {};
}

export async function setLocaleDetection(t: TenantContext, on: boolean) {
  t.assert("site.settings");
  await prisma.site.update({ where: { id: t.site.id }, data: { localeDetection: on } });
  updateTag(siteCacheTag(t.site.id));
  return {};
}
