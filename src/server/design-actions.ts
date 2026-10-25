"use server";

import { getTenant } from "@/lib/tenant";
import { run } from "./action-result";
import { applyDesignPreset, restoreTokenRevision, saveDesignTokens, type SaveTokensInput } from "./design/tokens-service";

/**
 * Design-system actions. The tenant comes from the session, and each service
 * call asserts `design.tokens` itself, so a Client Admin replaying one of
 * these requests gets "forbidden" and nothing is written.
 */

type WithSite<T> = T & { siteId: string };

export async function saveDesignTokensAction(input: WithSite<SaveTokensInput>) {
  return run(async () => saveDesignTokens(await getTenant(input.siteId), input));
}
export async function applyDesignPresetAction(input: WithSite<{ preset: string; baseVersion: number }>) {
  return run(async () => applyDesignPreset(await getTenant(input.siteId), input));
}
export async function restoreTokenRevisionAction(input: WithSite<{ revisionId: string; baseVersion: number }>) {
  return run(async () => restoreTokenRevision(await getTenant(input.siteId), input));
}
