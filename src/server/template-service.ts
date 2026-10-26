import "server-only";
import type { SessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getBlueprint } from "@/lib/templates/registry";
import { instantiateBlueprint, TemplateError } from "@/lib/templates/seeder";

/**
 * Who may start new sites: platform staff, and studio members who are a
 * Designer somewhere (so a Client Admin can't spin up sites on the studio's
 * account). The creator becomes the new site's Designer.
 */
export async function canCreateSites(user: SessionUser): Promise<boolean> {
  if (user.isPlatformAdmin) return true;
  const designer = await prisma.membership.findFirst({ where: { userId: user.id, role: { key: "designer", siteId: null } }, select: { id: true } });
  return !!designer;
}

export async function createSiteFromTemplate(user: SessionUser, input: { template: string; name: string; subdomain: string }) {
  if (!(await canCreateSites(user))) throw new TemplateError("Only designers can create sites");
  const blueprint = getBlueprint(input.template);
  if (!blueprint) throw new TemplateError("Pick one of the templates", "template");
  return instantiateBlueprint({ blueprint, name: input.name, subdomain: input.subdomain, ownerId: user.id });
}
