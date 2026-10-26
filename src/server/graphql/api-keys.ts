import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { ApiKeyScope } from "@prisma/client";
import { getCurrentUser, type SessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ALL_PERMISSIONS, hasPermission, type Permission } from "@/lib/rbac";

/**
 * API keys and request identity for the GraphQL endpoint.
 *
 * Keys look like `wbk_ro_<secret>` (read-only) or `wbk_rw_<secret>`
 * (read-write). Only a SHA-256 hash is stored, and a key only ever matches
 * the site it was created on, so a leaked Site A key can't read Site B.
 */

const KEY_RE = /^wbk_(ro|rw)_[A-Za-z0-9]{32}$/;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

export function generateKey(scope: ApiKeyScope) {
  const bytes = randomBytes(32);
  const secret = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
  const key = `wbk_${scope === "READ_WRITE" ? "rw" : "ro"}_${secret}`;
  return { key, prefix: key.slice(0, 11), keyHash: hashKey(key) };
}

/** Who is asking. Decides what the resolvers may return. */
export interface Viewer {
  kind: "public" | "key" | "session";
  /** May read drafts and working copies. */
  canPreview: boolean;
  /** May create and update drafts through mutations. */
  canWrite: boolean;
  keyId?: string;
  /** The person mutations are recorded against (the key's creator, or the signed-in user). */
  user?: SessionUser;
  /** Permissions mutations run with. */
  permissions: readonly Permission[];
}

/** What a read-write key may do: write and submit drafts, never publish, never touch designer-only fields. */
export const KEY_WRITE_PERMISSIONS: Permission[] = ["post.create", "post.editAny", "post.submit", "content.edit"];

export class AuthError extends Error {
  constructor(
    message: string,
    public status: 401 | 403 | 404,
  ) {
    super(message);
  }
}

function bearer(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth) {
    const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
    if (!m) throw new AuthError("Use Authorization: Bearer <api key>", 401);
    return m[1].trim();
  }
  return request.headers.get("x-api-key")?.trim() || null;
}

export async function resolveViewer(request: Request, site: { id: string; graphqlEnabled: boolean; graphqlPublic: boolean }): Promise<Viewer> {
  const key = bearer(request);
  if (key) {
    if (!site.graphqlEnabled) throw new AuthError("The GraphQL API is turned off for this site", 404);
    if (!KEY_RE.test(key)) throw new AuthError("Invalid API key", 401);
    const row = await prisma.apiKey.findUnique({ where: { keyHash: hashKey(key) }, include: { createdBy: { select: { id: true, email: true, name: true, isPlatformAdmin: true } } } });
    if (!row || row.siteId !== site.id || row.revokedAt) throw new AuthError("Invalid API key", 401);
    if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000) {
      await prisma.apiKey.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } });
    }
    const write = row.scope === "READ_WRITE";
    return {
      kind: "key",
      keyId: row.id,
      canPreview: write,
      canWrite: write && !!row.createdBy,
      user: row.createdBy ?? undefined,
      permissions: write ? KEY_WRITE_PERMISSIONS : [],
    };
  }

  // A signed-in member (the Developer playground, a headless preview on the same origin).
  const user = await getCurrentUser();
  if (user) {
    const permissions = user.isPlatformAdmin
      ? ALL_PERMISSIONS
      : ((await prisma.membership.findUnique({ where: { userId_siteId: { userId: user.id, siteId: site.id } }, include: { role: true } }))?.role.permissions.filter((p): p is Permission =>
          (ALL_PERMISSIONS as string[]).includes(p),
        ) ?? null);
    if (permissions) {
      return { kind: "session", user, canPreview: hasPermission(permissions, "post.editAny"), canWrite: false, permissions };
    }
  }

  if (!site.graphqlEnabled) throw new AuthError("The GraphQL API is turned off for this site", 404);
  if (!site.graphqlPublic) throw new AuthError("This site's API needs a key: send Authorization: Bearer <api key>", 401);
  return { kind: "public", canPreview: false, canWrite: false, permissions: [] };
}
