import "server-only";
import { updateTag } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import type { TenantContext } from "@/lib/tenant";
import { EditError } from "../content-service";
import { siteCacheTag } from "../public-site";
import { asJson } from "./snapshot";

const identitySchema = z.object({
  name: z.string().trim().min(1, "The site needs a name").max(80),
  tagline: z.string().trim().max(160),
  logoAssetId: z.string().max(40).nullable(),
  notFoundPageId: z.string().max(40).nullable(),
});

/**
 * Site identity: the name, tagline and logo that "Site" bindings read, and
 * the page shown (with HTTP 404) for addresses that don't exist. Kept in
 * Site.settings / Site.branding next to the keys earlier phases use.
 */
export async function saveSiteIdentity(t: TenantContext, raw: z.input<typeof identitySchema>) {
  t.assert("site.settings");
  const parsed = identitySchema.safeParse(raw);
  if (!parsed.success) throw new EditError(parsed.error.issues[0]?.message ?? "Invalid settings", "invalid");
  const input = parsed.data;
  if (input.logoAssetId) {
    const logo = await t.db.mediaAsset.findUnique({ where: { id: input.logoAssetId }, select: { mimeType: true } });
    if (!logo?.mimeType.startsWith("image/")) throw new EditError("Pick an image from this site's media library for the logo", "invalid");
  }
  if (input.notFoundPageId) {
    const page = await t.db.post.findUnique({ where: { id: input.notFoundPageId }, select: { slug: true, postType: { select: { key: true } } } });
    if (page?.postType.key !== "page" || page.slug === "home") throw new EditError("Pick one of this site's pages (not the home page) as the 404 page", "invalid");
  }
  const site = await prisma.site.findUniqueOrThrow({ where: { id: t.site.id }, select: { settings: true, branding: true } });
  await prisma.site.update({
    where: { id: t.site.id },
    data: {
      name: input.name,
      settings: asJson({ ...(site.settings as object), tagline: input.tagline, notFoundPageId: input.notFoundPageId }),
      branding: asJson({ ...(site.branding as object), logoAssetId: input.logoAssetId }),
    },
  });
  updateTag(siteCacheTag(t.site.id));
  return {};
}
