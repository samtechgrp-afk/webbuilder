import type { Metadata } from "next";
import { headers } from "next/headers";
import { DefaultNotFound } from "@/components/site/DefaultLayouts";
import { SiteDocument } from "@/lib/builder/render";
import { LOCALE_HEADER, localeLinkBase } from "@/lib/i18n/locales";
import { SITE_ROOT_HEADER, siteLinkBase } from "@/lib/site-url";
import { getSiteLocales } from "@/server/i18n/locale-service";
import { getNotFoundPage, resolveSite, siteTokens } from "@/server/public-site";

/**
 * A client site's "page not found". The proxy rewrites every public URL that
 * doesn't resolve to live content here with HTTP status 404 (and forces 404
 * on direct visits too). Renders the page chosen as the site's 404 page in
 * Site settings, else a default on the site's design tokens.
 */
export const instant = false;

export const metadata: Metadata = { title: { absolute: "Page not found" }, robots: { index: false } };

export default async function SiteNotFound({ params }: PageProps<"/site-404/[site]">) {
  const { site: key } = await params;
  const row = await resolveSite(key);
  if (!row) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-2 text-zinc-700">
        <h1 className="text-xl font-semibold">Page not found</h1>
        <p className="text-sm text-zinc-500">There is no site at this address.</p>
      </main>
    );
  }
  const h = await headers();
  const siteBase = siteLinkBase(key, h.get(SITE_ROOT_HEADER) === "1");
  // The proxy names the language of the missing address; links stay in that language.
  const locales = await getSiteLocales(row.id);
  const host = decodeURIComponent(key).toLowerCase();
  const hostLocale = locales.find((l) => l.domain === host && !l.isDefault)?.code ?? null;
  const locale = locales.find((l) => l.code === (h.get(LOCALE_HEADER) ?? hostLocale) && !l.isDefault) ?? null;
  const linkBase = localeLinkBase(siteBase, locale, hostLocale);
  const tokens = siteTokens(row);
  const custom = await getNotFoundPage({ id: row.id, name: row.name, settings: row.settings, branding: row.branding }, linkBase, locale?.code ?? "");
  const lang = custom?.locale || locales.find((l) => l.isDefault)?.code;
  return custom ? (
    <SiteDocument doc={custom.document} data={custom.data} tokens={tokens} linkBase={linkBase} lang={lang} formAction={`/api/v1/sites/${encodeURIComponent(row.subdomain)}/forms`} />
  ) : (
    <DefaultNotFound siteName={row.name} tokens={tokens} linkBase={linkBase} lang={locale?.code ?? lang} />
  );
}
