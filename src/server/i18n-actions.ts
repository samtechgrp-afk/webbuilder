"use server";

import { cookies } from "next/headers";
import type { LocaleInput } from "@/lib/i18n/locales";
import { getTenant } from "@/lib/tenant";
import { run } from "./action-result";
import { addLocale, deleteLocale, readSiteLocales, setLocaleDetection, updateLocale } from "./i18n/locale-service";
import { createTranslation, saveTranslation, type TranslationInput } from "./i18n/translation-service";

/**
 * Server actions for languages and translations. The tenant always comes
 * from the session; the services check permissions themselves.
 */

type WithSite<T> = T & { siteId: string };

export async function addLocaleAction(input: WithSite<{ locale: LocaleInput }>) {
  return run(async () => addLocale(await getTenant(input.siteId), input.locale));
}
export async function updateLocaleAction(input: WithSite<{ id: string; locale: LocaleInput }>) {
  return run(async () => updateLocale(await getTenant(input.siteId), input.id, input.locale));
}
export async function deleteLocaleAction(input: WithSite<{ id: string }>) {
  return run(async () => deleteLocale(await getTenant(input.siteId), input.id));
}
export async function setLocaleDetectionAction(input: WithSite<{ on: boolean }>) {
  return run(async () => setLocaleDetection(await getTenant(input.siteId), input.on));
}
export async function createTranslationAction(input: WithSite<{ sourceId: string; locale: string }>) {
  return run(async () => createTranslation(await getTenant(input.siteId), input));
}
export async function saveTranslationAction(input: WithSite<{ translation: TranslationInput }>) {
  return run(async () => saveTranslation(await getTenant(input.siteId), input.translation));
}

/** The language the admin's content lists show, remembered per site in a cookie. */
export async function setAdminLocaleAction(input: WithSite<{ locale: string }>) {
  return run(async () => {
    const t = await getTenant(input.siteId);
    const locales = await readSiteLocales(t.site.id);
    const l = locales.find((x) => x.code === input.locale);
    const jar = await cookies();
    if (!l || l.isDefault) jar.delete({ name: adminLocaleCookie(t.site.id), path: "/admin" });
    else jar.set(adminLocaleCookie(t.site.id), l.code, { path: "/admin", sameSite: "lax", httpOnly: true, maxAge: 60 * 60 * 24 * 180 });
    return {};
  });
}

const adminLocaleCookie = (siteId: string) => `wb_admin_locale_${siteId}`;
