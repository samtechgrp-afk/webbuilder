import "server-only";
import { cookies } from "next/headers";
import type { SiteLocaleInfo } from "@/lib/i18n/locales";

/** The language the admin chose in the locale switcher for this site (default when unset or gone). */
export async function adminLocale(siteId: string, locales: SiteLocaleInfo[]): Promise<SiteLocaleInfo | null> {
  const code = (await cookies()).get(`wb_admin_locale_${siteId}`)?.value;
  return locales.find((l) => l.code === code) ?? locales.find((l) => l.isDefault) ?? null;
}
