"use server";

import type { Violation } from "@/lib/builder/policy";
import type { BuilderDocument } from "@/lib/builder/types";
import { Forbidden, getTenant } from "@/lib/tenant";
import { TenantViolation } from "@/lib/tenant-db";
import {
  EditError,
  acquireEditLock,
  releaseEditLock,
  restoreRevision,
  saveDocument,
  type SaveIntent,
} from "./content-service";

export type ActionResult<T> =
  | ({ ok: true } & T)
  | { ok: false; error: string; code?: string; violations?: Violation[] };

async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, ...(await fn()) };
  } catch (err) {
    if (err instanceof EditError) return { ok: false, error: err.message, code: err.code, violations: err.violations };
    if (err instanceof Forbidden) return { ok: false, error: "You don't have permission to do that.", code: "forbidden" };
    if (err instanceof TenantViolation) return { ok: false, error: "That request crossed a site boundary.", code: "forbidden" };
    throw err; // redirect()/notFound() and real bugs
  }
}

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
