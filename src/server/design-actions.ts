"use server";

import { getTenant } from "@/lib/tenant";
import { run } from "./action-result";
import { updateTag } from "next/cache";
import { addFontLink, deleteFonts, listFonts, updateFontFamily, type AddFontLinkInput } from "./design/font-service";
import { siteCacheTag } from "./public-site";
import { restoreTokenRevision, saveDesignTokens, type SaveTokensInput } from "./design/tokens-service";

/**
 * Design-system actions. The tenant comes from the session, and each service
 * call asserts `design.tokens` itself, so a Client Admin replaying one of
 * these requests gets "forbidden" and nothing is written.
 */

type WithSite<T> = T & { siteId: string };

export async function saveDesignTokensAction(input: WithSite<SaveTokensInput>) {
  return run(async () => saveDesignTokens(await getTenant(input.siteId), input));
}
export async function restoreTokenRevisionAction(input: WithSite<{ revisionId: string; baseVersion: number }>) {
  return run(async () => restoreTokenRevision(await getTenant(input.siteId), input));
}

// ── Custom fonts ────────────────────────────────────────────────────────────
// Uploads go through POST /api/sites/[siteId]/fonts (files are too big for an
// action body); links, renames and deletes are actions. Each change expires
// the public cache, since every live page embeds the font rules.

export async function addFontLinkAction(input: WithSite<AddFontLinkInput>) {
  return run(async () => {
    const t = await getTenant(input.siteId);
    const added = await addFontLink(t, input);
    updateTag(siteCacheTag(t.site.id));
    return { added, fonts: await listFonts(t) };
  });
}
export async function updateFontFamilyAction(input: WithSite<{ family: string; rename?: string | null; fallback?: string | null }>) {
  return run(async () => {
    const t = await getTenant(input.siteId);
    const res = await updateFontFamily(t, input);
    updateTag(siteCacheTag(t.site.id));
    return res;
  });
}
export async function deleteFontsAction(input: WithSite<{ ids: string[] }>) {
  return run(async () => {
    const t = await getTenant(input.siteId);
    const res = await deleteFonts(t, input);
    updateTag(siteCacheTag(t.site.id));
    return res;
  });
}
