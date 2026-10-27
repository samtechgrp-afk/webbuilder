import type { PrismaClient } from "@prisma/client";
import { SYSTEM_ROLES, type SystemRoleKey } from "@/lib/rbac";

/**
 * Makes the shared system roles (siteId = null) match SYSTEM_ROLES: creates
 * any that are missing and refreshes the names and permissions of the rest.
 * Runs at boot, so a fresh install (Docker, Vercel) works without the demo
 * seed. An advisory lock keeps concurrent cold starts from racing; Postgres
 * unique indexes treat NULL siteIds as distinct, so they can't.
 */
export async function ensureSystemRoles(db: PrismaClient) {
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('system-roles'))`;
    const existing = new Map((await tx.role.findMany({ where: { siteId: null }, select: { id: true, key: true } })).map((r) => [r.key, r.id]));
    for (const [key, def] of Object.entries(SYSTEM_ROLES) as [SystemRoleKey, (typeof SYSTEM_ROLES)[SystemRoleKey]][]) {
      const data = { name: def.name, description: def.description, permissions: [...def.permissions], isSystem: true };
      const id = existing.get(key);
      if (id) await tx.role.update({ where: { id }, data });
      else await tx.role.create({ data: { key, ...data } });
    }
  });
}
