import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";
import { requireUser, type SessionUser } from "./auth";
import { prisma } from "./db";
import { ALL_PERMISSIONS, hasPermission, type Permission } from "./rbac";
import { tenantDb, type TenantDb } from "./tenant-db";

export class Forbidden extends Error {
  constructor(public permission: Permission) {
    super(`Missing permission: ${permission}`);
  }
}

export interface TenantContext {
  user: SessionUser;
  site: { id: string; name: string; subdomain: string; customDomain: string | null; branding: unknown; settings: unknown; designTokens: unknown };
  role: { key: string; name: string };
  permissions: readonly Permission[];
  db: TenantDb;
  can(permission: Permission): boolean;
  assert(permission: Permission): void;
}

/**
 * The single entry point into a tenant. Resolves the signed-in user's
 * Membership for `siteId` and returns a scoped DB client plus their
 * permissions. Sites the user doesn't belong to answer 404, not 403, so a
 * client can't probe which site ids exist.
 */
export const getTenant = cache(async (siteId: string): Promise<TenantContext> => {
  const user = await requireUser();

  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: { id: true, name: true, subdomain: true, customDomain: true, branding: true, settings: true, designTokens: true, status: true },
  });
  if (!site || site.status === "SUSPENDED") notFound();

  let role: TenantContext["role"];
  let permissions: Permission[];
  if (user.isPlatformAdmin) {
    role = { key: "super_admin", name: "Super Admin" };
    permissions = ALL_PERMISSIONS;
  } else {
    const membership = await prisma.membership.findUnique({
      where: { userId_siteId: { userId: user.id, siteId } },
      include: { role: true },
    });
    if (!membership) notFound();
    role = { key: membership.role.key, name: membership.role.name };
    permissions = membership.role.permissions.filter((p): p is Permission => (ALL_PERMISSIONS as string[]).includes(p));
  }

  return {
    user,
    site,
    role,
    permissions,
    db: tenantDb(site.id),
    can: (p) => hasPermission(permissions, p),
    assert: (p) => {
      if (!hasPermission(permissions, p)) throw new Forbidden(p);
    },
  };
});

/** Sites the user can open, for the post-login picker. */
export async function listUserSites(user: SessionUser) {
  if (user.isPlatformAdmin) {
    const sites = await prisma.site.findMany({ orderBy: { name: "asc" } });
    return sites.map((site) => ({ site, roleName: "Super Admin" }));
  }
  const memberships = await prisma.membership.findMany({
    where: { userId: user.id, site: { status: { not: "SUSPENDED" } } },
    include: { site: true, role: true },
    orderBy: { site: { name: "asc" } },
  });
  return memberships.map((m) => ({ site: m.site, roleName: m.role.name }));
}
