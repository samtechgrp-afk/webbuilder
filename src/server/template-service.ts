import "server-only";
import type { SessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PRESETS, type PresetKey } from "@/lib/design/presets";
import { dispatchLater, sendEmail } from "@/lib/email/dispatcher";
import { siteWelcomeEmail } from "@/lib/email/templates/welcome";
import { getTenant } from "@/lib/tenant";
import { getBlueprint } from "@/lib/templates/registry";
import { instantiateBlueprint, TemplateError } from "@/lib/templates/seeder";
import { applyDesignPreset } from "./design/tokens-service";
import { platformOrigin, siteBaseUrl } from "./email/links";
import { addLocale } from "./i18n/locale-service";

/**
 * Who may start new sites: platform staff, studio members who are a Designer
 * somewhere, and new accounts that don't belong to any site yet (their first
 * site, from sign-up). A Client Admin can't spin up sites on the studio's
 * account. The creator becomes the new site's Designer.
 */
export async function canCreateSites(user: SessionUser): Promise<boolean> {
  if (user.isPlatformAdmin) return true;
  const memberships = await prisma.membership.findMany({ where: { userId: user.id }, select: { role: { select: { key: true, siteId: true } } } });
  return memberships.length === 0 || memberships.some((m) => m.role.key === "designer" && m.role.siteId === null);
}

/** Choices made in the welcome wizard, applied to the first site after it's created. */
export interface SiteSetup {
  locale?: { code: string; label: string; currency: string } | null;
  preset?: string | null;
}

export async function createSiteFromTemplate(user: SessionUser, input: { template: string; name: string; subdomain: string }, setup: SiteSetup = {}) {
  if (!(await canCreateSites(user))) throw new TemplateError("Only designers can create sites");
  const blueprint = getBlueprint(input.template);
  if (!blueprint) throw new TemplateError("Pick one of the templates", "template");
  if (setup.preset && !PRESETS[setup.preset as PresetKey]) throw new TemplateError("Pick one of the themes", "template");
  const result = await instantiateBlueprint({ blueprint, name: input.name, subdomain: input.subdomain, ownerId: user.id });

  if (setup.locale || setup.preset) {
    const t = await getTenant(result.siteId);
    if (setup.locale) await addLocale(t, { code: setup.locale.code, label: setup.locale.label, prefix: setup.locale.code.split("-")[0].toLowerCase(), currency: setup.locale.currency });
    if (setup.preset) await applyDesignPreset(t, { preset: setup.preset, baseVersion: 0 });
  }
  if (!user.onboardedAt) await prisma.user.update({ where: { id: user.id }, data: { onboardedAt: new Date() } });

  dispatchLater(() => sendSiteWelcome(user, result.siteId, blueprint.name));
  return result;
}

async function sendSiteWelcome(user: SessionUser, siteId: string, templateName: string) {
  const site = await prisma.site.findUnique({ where: { id: siteId }, select: { name: true, subdomain: true, customDomain: true, branding: true, settings: true } });
  if (!site) return;
  const home = await prisma.post.findFirst({ where: { siteId, slug: "home", postType: { key: "page" } }, select: { id: true } });
  const admin = `${platformOrigin()}/admin/sites/${siteId}`;
  const email = siteWelcomeEmail({
    recipientName: user.name,
    siteName: site.name,
    templateName,
    accent: ((site.branding ?? {}) as { accent?: string }).accent ?? null,
    editorUrl: home ? `${admin}/pages/${home.id}/edit` : admin,
    siteUrl: siteBaseUrl(site),
    designUrl: `${admin}/design-system`,
  });
  await sendEmail({ ...email, to: user.email, tag: "site.welcome", siteId, idempotencyKey: `site.welcome:${siteId}` });
}
