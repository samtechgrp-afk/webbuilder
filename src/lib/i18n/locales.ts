import { z } from "zod";

/**
 * Locale rules shared by the proxy, the public site, SEO, the export engine
 * and the GraphQL API. Pure, so it's unit-tested without a server.
 *
 * - The default locale serves clean paths (/about). Its entries are stored
 *   with `Post.locale = ""`, so a site that adds languages later keeps
 *   every existing URL and slug.
 * - Other locales are prefixed (/fr/about), or served at the root of their
 *   own domain (aurelia.fr/about).
 */

export interface SiteLocaleInfo {
  code: string;
  label: string;
  prefix: string;
  isDefault: boolean;
  currency: string;
  domain: string | null;
}

export const LOCALE_CODE_RE = /^[a-z]{2,3}(-[A-Z][a-z]{3})?(-([A-Z]{2}|\d{3}))?$/;
export const LOCALE_PREFIX_RE = /^[a-z]{2,3}(-[a-z0-9]{2,4})?$/;

export const localeInputSchema = z.object({
  code: z.string().trim().regex(LOCALE_CODE_RE, "Use a language tag such as en-US, fr-FR or pt-BR"),
  label: z.string().trim().min(1, "Give the language a name, such as Français").max(40),
  prefix: z.string().trim().toLowerCase().regex(LOCALE_PREFIX_RE, "URL prefixes are 2 or 3 lowercase letters, optionally with a region, such as fr or fr-ca"),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Use a 3-letter currency code such as EUR"),
  domain: z
    .string()
    .trim()
    .toLowerCase()
    .max(253)
    .regex(/^(?=.{1,253}$)([a-z0-9](-?[a-z0-9])*\.)+[a-z]{2,}$/, "Enter a domain such as aurelia.fr, without https://")
    .nullish()
    .or(z.literal("").transform(() => null)),
});
export type LocaleInput = z.input<typeof localeInputSchema>;

/** "fr-FR" → "fr", "pt-BR" → "pt-br" when "pt" is taken. */
export function suggestPrefix(code: string, taken: string[] = []) {
  const lang = code.split("-")[0].toLowerCase();
  return taken.includes(lang) ? code.toLowerCase() : lang;
}

export const defaultLocale = (locales: SiteLocaleInfo[]) => locales.find((l) => l.isDefault) ?? null;

/** The value stored in Post.locale for a locale code. */
export const storedLocale = (code: string | null | undefined, locales: SiteLocaleInfo[]) => (!code || defaultLocale(locales)?.code === code ? "" : code);

/** The locale code of an entry (its stored value, with "" meaning the default). */
export const entryLocale = (stored: string, locales: SiteLocaleInfo[]) => stored || defaultLocale(locales)?.code || "";

/**
 * Splits a site path into its locale and the rest. On a locale's own domain
 * every path is in that locale; otherwise a leading segment that is a
 * non-default locale's prefix selects it, and anything else is the default.
 */
export function splitLocalePath(parts: string[] | undefined, locales: SiteLocaleInfo[], hostLocale?: string | null): { locale: SiteLocaleInfo | null; rest: string[]; prefixed: boolean } {
  const segs = parts ?? [];
  if (hostLocale) {
    const l = locales.find((x) => x.code === hostLocale);
    if (l) return { locale: l, rest: segs, prefixed: false };
  }
  const first = segs[0]?.toLowerCase();
  const prefixed = first ? locales.find((l) => !l.isDefault && l.prefix === first) : undefined;
  if (prefixed) return { locale: prefixed, rest: segs.slice(1), prefixed: true };
  return { locale: defaultLocale(locales), rest: segs, prefixed: false };
}

/** The path of `sitePath` in `locale`, relative to the site base ("/fr/about"); domains are handled by `localeHref`. */
export function localePath(locale: SiteLocaleInfo | null, sitePath: string) {
  if (!locale || locale.isDefault) return sitePath;
  return `/${locale.prefix}${sitePath === "/" ? "" : sitePath}` || "/";
}

/**
 * A full link to `sitePath` in `locale`. A locale with its own domain links
 * there (unless that's the host we're on); others live under `siteBase`
 * (the site's root on this host, or its absolute main origin when the
 * current host is another locale's domain).
 */
export function localeHref(locale: SiteLocaleInfo | null, sitePath: string, ctx: { siteBase: string; hostLocale?: string | null; mainOrigin?: string }) {
  if (locale?.domain) return ctx.hostLocale === locale.code ? sitePath : `https://${locale.domain}${sitePath === "/" ? "" : sitePath}` || "/";
  const base = ctx.hostLocale ? (ctx.mainOrigin ?? "") : ctx.siteBase;
  const path = localePath(locale, sitePath);
  return `${base}${path === "/" && base ? "" : path}` || "/";
}

/** Link base for root-relative links inside a page in `locale` (so "/shop" in a French page means "/fr/shop"). */
export function localeLinkBase(siteBase: string, locale: SiteLocaleInfo | null, hostLocale?: string | null) {
  if (!locale || locale.isDefault || hostLocale === locale.code) return siteBase;
  return `${siteBase}/${locale.prefix}`;
}

/** The best site locale for an Accept-Language header, or null. Exact tags beat language-only matches; q=0 means "not this". */
export function matchAcceptLanguage(header: string | null | undefined, locales: SiteLocaleInfo[]): SiteLocaleInfo | null {
  if (!header || !locales.length) return null;
  const prefs = header
    .split(",")
    .map((part, i) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => /^\s*q=([\d.]+)\s*$/.exec(p)?.[1]).find(Boolean);
      return { tag: tag.trim().toLowerCase(), q: q === undefined ? 1 : Number(q), i };
    })
    .filter((p) => p.tag && p.tag !== "*" && p.q > 0 && Number.isFinite(p.q))
    .sort((a, b) => b.q - a.q || a.i - b.i);
  for (const p of prefs) {
    const exact = locales.find((l) => l.code.toLowerCase() === p.tag);
    if (exact) return exact;
    const lang = p.tag.split("-")[0];
    const loose = locales.find((l) => l.code.toLowerCase().split("-")[0] === lang);
    if (loose) return loose;
  }
  return null;
}

/** hreflang value for a locale: its full tag. */
export const hreflang = (code: string) => code;

export interface Alternate {
  hreflang: string;
  href: string;
}

/** Alternates for a translation group, plus x-default pointing at the default-locale version when there is one. */
export function withXDefault(alternates: (Alternate & { isDefault?: boolean })[]): Alternate[] {
  const out = alternates.map(({ hreflang: h, href }) => ({ hreflang: h, href }));
  const def = alternates.find((a) => a.isDefault);
  if (def && out.length > 1) out.push({ hreflang: "x-default", href: def.href });
  return out;
}

/** An HTTP Link header value announcing alternates. */
export function linkHeader(alternates: Alternate[]) {
  return alternates.map((a) => `<${encodeURI(decodeURI(a.href))}>; rel="alternate"; hreflang="${a.hreflang}"`).join(", ");
}

/** The public base URL of `locale`: its own domain, or the main base plus its prefix. */
export function localeBase(mainBase: string, locale: SiteLocaleInfo | null) {
  const b = mainBase.replace(/\/+$/, "");
  if (!locale) return b;
  if (locale.domain) return `https://${locale.domain}`;
  return locale.isDefault ? b : `${b}/${locale.prefix}`;
}

/** BCP 47 tags of a group's live members as absolute alternates, x-default included. */
export function groupAlternates(members: { localeCode: string; path: string }[], locales: SiteLocaleInfo[], mainBase: string): Alternate[] {
  const rows = members
    .map((m) => ({ m, l: locales.find((x) => x.code === m.localeCode) }))
    .filter((x): x is { m: (typeof members)[number]; l: SiteLocaleInfo } => !!x.l)
    .sort((a, b) => Number(b.l.isDefault) - Number(a.l.isDefault) || locales.indexOf(a.l) - locales.indexOf(b.l));
  return withXDefault(rows.map(({ m, l }) => ({ hreflang: hreflang(l.code), href: joinUrl(localeBase(mainBase, l), m.path), isDefault: l.isDefault })));
}

const joinUrl = (base: string, path: string) => (path === "/" || !path ? `${base}/` : `${base}${path}`);

/** Remembers a visitor's language once Accept-Language detection has redirected them. */
export const LOCALE_COOKIE = "wb_locale";
/** Tells /site-404 which language the missing address was in. */
export const LOCALE_HEADER = "x-site-locale";
