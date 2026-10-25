import "server-only";
import { updateTag } from "next/cache";
import type { Prisma } from "@prisma/client";
import { parseDesignTokens } from "@/lib/design/schema";
import { PRESETS, type PresetKey } from "@/lib/design/presets";
import { applyPreset, type DesignTokens } from "@/lib/design/tokens";
import type { TenantContext } from "@/lib/tenant";
import { EditError } from "../content-service";
import { siteCacheTag } from "../public-site";

/**
 * Global design tokens. Only roles holding `design.tokens` (Designers) can
 * read the history or change anything here; Client Mode never reaches these
 * calls, and they refuse on their own if it tries.
 *
 * Each save is checked against the version the editor started from, writes
 * the tokens to Site.designTokens (which every renderer reads) and keeps a
 * revision so the whole design system can be rolled back.
 */

export interface TokenRevisionSummary {
  id: string;
  version: number;
  preset: string | null;
  message: string | null;
  authorName: string | null;
  createdAt: string;
}

export async function loadDesignTokens(t: TenantContext) {
  t.assert("design.tokens");
  const [site, revisions] = await Promise.all([
    t.db.site.findUniqueOrThrow({ where: { id: t.site.id }, select: { designTokens: true, designTokensVersion: true } }),
    listTokenRevisions(t),
  ]);
  return { tokens: (site.designTokens ?? {}) as DesignTokens, version: site.designTokensVersion, revisions };
}

export async function listTokenRevisions(t: TenantContext): Promise<TokenRevisionSummary[]> {
  t.assert("design.tokens");
  const rows = await t.db.designTokenRevision.findMany({
    orderBy: { version: "desc" },
    take: 30,
    include: { author: { select: { name: true, email: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    version: r.version,
    preset: r.preset,
    message: r.message,
    authorName: r.author?.name ?? r.author?.email ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
}

export interface SaveTokensInput {
  tokens: unknown;
  baseVersion: number;
  message?: string;
}

export async function saveDesignTokens(t: TenantContext, input: SaveTokensInput) {
  t.assert("design.tokens");
  const parsed = parseDesignTokens(input.tokens);
  if (!parsed.ok) throw new EditError(parsed.error, "invalid");
  return writeTokens(t, parsed.tokens, input.baseVersion, input.message?.slice(0, 200) || null);
}

/** Server-side preset application, for callers that don't hold a working copy. */
export async function applyDesignPreset(t: TenantContext, input: { preset: string; baseVersion: number }) {
  t.assert("design.tokens");
  const preset = PRESETS[input.preset as PresetKey];
  if (!preset) throw new EditError("Unknown preset", "invalid");
  const site = await t.db.site.findUniqueOrThrow({ where: { id: t.site.id }, select: { designTokens: true } });
  return writeTokens(t, applyPreset((site.designTokens ?? {}) as DesignTokens, preset.tokens), input.baseVersion, `Applied ${preset.label}`);
}

export async function restoreTokenRevision(t: TenantContext, input: { revisionId: string; baseVersion: number }) {
  t.assert("design.tokens");
  const rev = await t.db.designTokenRevision.findUnique({ where: { id: input.revisionId } });
  if (!rev) throw new EditError("That version no longer exists", "not_found");
  const parsed = parseDesignTokens(rev.tokens);
  if (!parsed.ok) throw new EditError(parsed.error, "invalid");
  return writeTokens(t, parsed.tokens, input.baseVersion, `Restored v${rev.version}`);
}

async function writeTokens(t: TenantContext, tokens: DesignTokens, baseVersion: number, message: string | null) {
  const json = tokens as Prisma.InputJsonValue;
  const version = await t.db.$transaction(async (tx) => {
    const site = await tx.site.findUniqueOrThrow({ where: { id: t.site.id }, select: { designTokens: true, designTokensVersion: true } });
    // Keep the tokens the site had before its first save, so it can always go back to them.
    if (site.designTokensVersion === 0 && !(await tx.designTokenRevision.count({ where: { siteId: t.site.id } }))) {
      await tx.designTokenRevision.create({
        data: { siteId: t.site.id, version: 0, tokens: site.designTokens as Prisma.InputJsonValue, message: "Original tokens" },
      });
    }
    // Conditional update: only one of two concurrent saves from the same version wins.
    const res = await tx.site.updateMany({
      where: { id: t.site.id, designTokensVersion: baseVersion },
      data: { designTokens: json, designTokensVersion: { increment: 1 } },
    });
    if (res.count === 0) {
      throw new EditError("Someone else changed the design system since you opened it. Reload to see their changes.", "conflict");
    }
    const next = baseVersion + 1;
    await tx.designTokenRevision.create({
      data: { siteId: t.site.id, version: next, tokens: json, preset: tokens.preset ?? null, message, authorId: t.user.id },
    });
    await tx.auditLog.create({ data: { siteId: t.site.id, userId: t.user.id, action: "design.tokens", data: { version: next, message } } });
    return next;
  });
  updateTag(siteCacheTag(t.site.id));
  return { version, tokens, revisions: await listTokenRevisions(t) };
}
