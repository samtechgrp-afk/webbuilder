import { NextResponse } from "next/server";
import { getTenant } from "@/lib/tenant";
import { processImage } from "@/server/media-processing";

const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"]);

export async function POST(request: Request, ctx: RouteContext<"/api/sites/[siteId]/media">) {
  const { siteId } = await ctx.params;
  const t = await getTenant(siteId);
  if (!t.can("media.upload")) return NextResponse.json({ error: "You can't upload media on this site" }, { status: 403 });

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });
  if (!ALLOWED.has(file.type)) return NextResponse.json({ error: "Upload a JPEG, PNG, WebP, AVIF or GIF" }, { status: 415 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Images must be under 15 MB" }, { status: 413 });

  const processed = await processImage(t.site.id, Buffer.from(await file.arrayBuffer()), file.name);
  const asset = await t.db.mediaAsset.create({
    data: { ...processed, siteId: t.site.id, uploadedById: t.user.id, tags: [] },
  });
  await t.db.auditLog.create({
    data: { siteId: t.site.id, userId: t.user.id, action: "media.upload", targetId: asset.id },
  });
  return NextResponse.json({
    asset: { id: asset.id, url: asset.url, altText: asset.altText, width: asset.width, height: asset.height, originalName: asset.originalName },
  });
}
