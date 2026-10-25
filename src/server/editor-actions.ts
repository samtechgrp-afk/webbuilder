"use server";

import type { BuilderDocument, LoopQuery } from "@/lib/builder/types";
import { getTenant } from "@/lib/tenant";
import { run } from "./action-result";
import { loopItems } from "./cms/dynamic";
import {
  acquireEditLock,
  releaseEditLock,
  restoreRevision,
  saveDocument,
  type SaveIntent,
} from "./content-service";

export async function savePage(input: {
  siteId: string;
  postId: string;
  document: BuilderDocument;
  baseVersion: number;
  intent: SaveIntent;
  message?: string;
}) {
  return run(async () => saveDocument(await getTenant(input.siteId), input));
}

export async function restorePageRevision(input: { siteId: string; postId: string; revisionId: string }) {
  return run(async () => restoreRevision(await getTenant(input.siteId), input));
}

export async function heartbeatEditLock(input: { siteId: string; postId: string }) {
  return run(async () => {
    const result = await acquireEditLock(await getTenant(input.siteId), input.postId);
    return { lock: result };
  });
}

export async function leaveEditor(input: { siteId: string; postId: string }) {
  return run(async () => {
    await releaseEditLock(await getTenant(input.siteId), input.postId);
    return {};
  });
}

/** Live canvas preview for a loop grid: the published entries its query returns. */
export async function previewLoop(input: { siteId: string; query: LoopQuery }) {
  return run(async () => {
    const t = await getTenant(input.siteId);
    if (!t.can("design.layout") && !t.can("content.edit")) return { items: [] };
    return { items: await loopItems(t.db, input.query) };
  });
}
