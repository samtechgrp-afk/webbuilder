import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import type { TenantContext } from "@/lib/tenant";
import { EditError } from "../content-service";
import { generateKey } from "./api-keys";

/**
 * The Developer screen: turning the GraphQL API on and off, public access,
 * and API keys. Every function asserts `developer.api` (designers only by
 * default), so a replayed request from a client account is refused here.
 */

const MAX_ACTIVE_KEYS = 25;

export async function getDeveloperSettings(t: TenantContext) {
  t.assert("developer.api");
  const [site, keys] = await Promise.all([
    prisma.site.findUniqueOrThrow({ where: { id: t.site.id }, select: { graphqlEnabled: true, graphqlPublic: true } }),
    t.db.apiKey.findMany({ orderBy: [{ revokedAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }], take: 100, include: { createdBy: { select: { name: true, email: true } } } }),
  ]);
  return { ...site, keys };
}

const accessSchema = z.object({ enabled: z.boolean(), public: z.boolean() });

export async function setGraphqlAccess(t: TenantContext, raw: { enabled: boolean; public: boolean }) {
  t.assert("developer.api");
  const input = accessSchema.parse(raw);
  await prisma.$transaction([
    prisma.site.update({ where: { id: t.site.id }, data: { graphqlEnabled: input.enabled, graphqlPublic: input.public } }),
    prisma.auditLog.create({ data: { siteId: t.site.id, userId: t.user.id, action: "api.access", data: input } }),
  ]);
  return input;
}

const keySchema = z.object({
  name: z.string().trim().min(1, "Name the key after where it's used, such as “Next.js storefront”").max(80),
  scope: z.enum(["READ", "READ_WRITE"]),
});

export async function createApiKey(t: TenantContext, raw: { name: string; scope: "READ" | "READ_WRITE" }) {
  t.assert("developer.api");
  const parsed = keySchema.safeParse(raw);
  if (!parsed.success) throw new EditError(parsed.error.issues[0]?.message ?? "Invalid key", "invalid");
  const active = await t.db.apiKey.count({ where: { revokedAt: null } });
  if (active >= MAX_ACTIVE_KEYS) throw new EditError(`A site can have at most ${MAX_ACTIVE_KEYS} active keys; revoke one first`, "invalid");
  const { key, prefix, keyHash } = generateKey(parsed.data.scope);
  const row = await t.db.apiKey.create({ data: { siteId: t.site.id, name: parsed.data.name, scope: parsed.data.scope, prefix, keyHash, createdById: t.user.id } });
  await t.db.auditLog.create({ data: { siteId: t.site.id, userId: t.user.id, action: "api.key.create", targetId: row.id, data: { scope: row.scope } } });
  // The only time the full key exists outside the client's hands.
  return { id: row.id, key };
}

export async function revokeApiKey(t: TenantContext, input: { id: string }) {
  t.assert("developer.api");
  const row = await t.db.apiKey.findUnique({ where: { id: String(input.id) } });
  if (!row) throw new EditError("That key no longer exists", "not_found");
  if (!row.revokedAt) {
    await t.db.apiKey.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
    await t.db.auditLog.create({ data: { siteId: t.site.id, userId: t.user.id, action: "api.key.revoke", targetId: row.id } });
  }
  return {};
}
