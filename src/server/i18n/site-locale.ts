import "server-only";
import { headers } from "next/headers";
import { groupAlternates, localeBase, localeHref, localeLinkBase, splitLocalePath, type SiteLocaleInfo } from "@/lib/i18n/locales";
import { SITE_ROOT_HEADER, siteLinkBase } from "@/lib/site-url";
import type { LanguageLink } from "@/lib/builder/render";
import { mainBaseUrl } from "../seo/public-url";
import { getSiteLocales } from "./locale-service";

/**
 * Which language a public request is in, and the bases its links use.
 * A single-language site gets `locale: null` and behaves exactly as before.
 */
export async function siteLocaleContext(site: { id: string; subdomain: string; customDomain: string | null }, key: string, slug: string[] | undefined) {
  const onOwnHost = (await headers()).get(SITE_ROOT_HEADER) === "1";
  const locales = await getSiteLocales(site.id);
  const host = decodeURIComponent(key).toLowerCase();
  const hostLocale = locales.find((l) => l.domain === host && !l.isDefault)?.code ?? null;
  const { locale, rest, prefixed } = splitLocalePath(slug, locales, hostLocale);
  const siteBase = siteLinkBase(key, onOwnHost);
  const mainBase = locales.length ? await mainBaseUrl(site, hostLocale) : "";
  return {
    locales,
    hostLocale,
    locale,
    rest,
    prefixed,
    /** Post.locale value for this language. */
    stored: locale && !locale.isDefault ? locale.code : "",
    siteBase,
    linkBase: localeLinkBase(siteBase, locale, hostLocale),
    mainBase,
  };
}

export type SiteLocaleContext = Awaited<ReturnType<typeof siteLocaleContext>>;

/** Public base URL of a language (for canonicals). */
export const baseFor = (ctx: SiteLocaleContext, locale: SiteLocaleInfo | null) => localeBase(ctx.mainBase, locale);

/**
 * The language switcher's links for the current content: each language's
 * version of it when there is one, otherwise that language's home page.
 */
export function languageLinks(ctx: SiteLocaleContext, alternates: { localeCode: string; path: string }[], current: string | null): LanguageLink[] {
  const hrefCtx = { siteBase: ctx.siteBase, hostLocale: ctx.hostLocale, mainOrigin: ctx.mainBase };
  return ctx.locales.map((l) => {
    const alt = alternates.find((a) => a.localeCode === l.code);
    return { code: l.code, label: l.label, href: localeHref(l, alt?.path ?? "/", hrefCtx), current: l.code === current, translated: !!alt };
  });
}

/** hreflang alternates for Next.js metadata, x-default included. */
export function metadataLanguages(ctx: SiteLocaleContext, alternates: { localeCode: string; path: string }[]) {
  const list = groupAlternates(alternates, ctx.locales, ctx.mainBase);
  return list.length > 1 ? Object.fromEntries(list.map((a) => [a.hreflang, a.href])) : undefined;
}
