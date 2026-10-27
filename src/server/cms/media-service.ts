import "server-only";
import { updateTag } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import type { TenantContext } from "@/lib/tenant";
import { EditError } from "../content-service";
import { mediaStorage } from "../media-processing";
import { siteCacheTag } from "../public-site";

const metaSchema = z.object({
  id: z.string().max(40),
  title: z.string().trim().max(120).nullish(),
  altText: z.string().trim().max(300).nullish(),
  caption: z.string().trim().max(500).nullish(),
  description: z.string().trim().max(2000).nullish(),
  tags: z.array(z.string().trim().toLowerCase().min(1).max(30)).max(20),
});

function canManage(t: TenantContext, asset: { uploadedById: string | null }) {
  return t.can("media.manage") || (t.can("media.upload") && asset.uploadedById === t.user.id);
}

export async function updateAssetMeta(t: TenantContext, raw: z.input<typeof metaSchema>) {
  const parsed = metaSchema.safeParse(raw);
  if (!parsed.success) throw new EditError(parsed.error.issues[0]?.message ?? "Invalid details", "invalid");
  const input = parsed.data;
  const asset = await t.db.mediaAsset.findUnique({ where: { id: input.id } });
  if (!asset) throw new EditError("File not found", "not_found");
  if (!canManage(t, asset)) throw new EditError("You can only edit files you uploaded", "forbidden");
  const altText = input.altText || null;
  await t.db.mediaAsset.update({
    where: { id: asset.id },
    data: {
      title: input.title || null,
      altText,
      altTextSource: altText !== asset.altText ? "MANUAL" : asset.altTextSource,
      caption: input.caption || null,
      description: input.description || null,
      tags: [...new Set(input.tags)],
    },
  });
  await t.db.auditLog.create({ data: { siteId: t.site.id, userId: t.user.id, action: "media.update", targetId: asset.id } });
  return {};
}

export async function tagAssets(t: TenantContext, input: { ids: string[]; tag: string }) {
  t.assert("media.manage");
  const tag = input.tag.trim().toLowerCase().slice(0, 30);
  if (!tag) throw new EditError("Add a tag", "invalid");
  const assets = await t.db.mediaAsset.findMany({ where: { id: { in: input.ids.slice(0, 200) } }, select: { id: true, tags: true } });
  for (const a of assets) if (!a.tags.includes(tag)) await t.db.mediaAsset.update({ where: { id: a.id }, data: { tags: [...a.tags, tag].slice(0, 20) } });
  return { tagged: assets.length };
}

/**
 * Where an asset is still referenced: page documents (draft or live), field
 * values and featured images. Text search over the JSON is enough here
 * because asset ids are unguessable cuids.
 */
async function usage(siteId: string, ids: string[]) {
  if (!ids.length) return new Map<string, string[]>();
  const rows = await prisma.$queryRaw<{ assetId: string; title: string }[]>`
    SELECT a.id AS "assetId", p.title
    FROM "MediaAsset" a
    JOIN "Post" p ON p."siteId" = a."siteId"
    LEFT JOIN "PostRevision" r ON r.id = p."publishedRevisionId"
    WHERE a."siteId" = ${siteId} AND a.id = ANY(${ids}) AND p.status <> 'TRASHED'
      AND (p."featuredImageId" = a.id OR p."ogImageId" = a.id OR p.draft::text LIKE '%' || a.id || '%' OR r.document::text LIKE '%' || a.id || '%'
        OR EXISTS (SELECT 1 FROM "FieldValue" v WHERE v."postId" = p.id AND v.value::text LIKE '%' || a.id || '%'))
  `;
  const map = new Map<string, string[]>();
  for (const r of rows) map.set(r.assetId, [...(map.get(r.assetId) ?? []), r.title]);
  return map;
}

export async function deleteAssets(t: TenantContext, input: { ids: string[]; force?: boolean }) {
  const assets = await t.db.mediaAsset.findMany({ where: { id: { in: input.ids.slice(0, 200) } } });
  if (assets.some((a) => !canManage(t, a))) throw new EditError("You can only delete files you uploaded", "forbidden");
  const used = await usage(t.site.id, assets.map((a) => a.id));
  if (used.size && !input.force) {
    const [id, titles] = [...used.entries()][0];
    const name = assets.find((a) => a.id === id)?.title ?? "A file";
    throw new EditError(`${name} is still used on ${[...new Set(titles)].slice(0, 3).join(", ")}. Replace it there first.`, "conflict");
  }
  for (const a of assets) {
    await t.db.mediaAsset.delete({ where: { id: a.id } });
    const keys = [a.storageKey, ...Object.values((a.variants ?? {}) as Record<string, string>).map((url) => url.replace(/^\/uploads\//, ""))];
    await Promise.all(keys.map((k) => mediaStorage().remove(k)));
    await t.db.auditLog.create({ data: { siteId: t.site.id, userId: t.user.id, action: "media.delete", targetId: a.id, data: { name: a.originalName } } });
  }
  if (used.size) updateTag(siteCacheTag(t.site.id));
  return { deleted: assets.length };
}
