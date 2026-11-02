import { NextResponse } from "next/server";
import { getTenant } from "@/lib/tenant";
import { FILE_KINDS, processFile, processImage, processSvg } from "@/server/media-processing";
import { sanitizeSvg } from "@/server/sanitize";

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_SVG_BYTES = 1024 * 1024;
const RASTER = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"]);

/**
 * Media upload. Raster images become WebP with responsive variants; SVGs are
 * sanitised and kept as vectors; videos and documents are stored as-is under
 * an allowlisted extension. Everything lands under the site's own prefix.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/sites/[siteId]/media">) {
  const { siteId } = await ctx.params;
  const t = await getTenant(siteId);
  if (!t.can("media.upload")) return NextResponse.json({ error: "You can't upload media on this site" }, { status: 403 });

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });
  const type = file.type || "application/octet-stream";
  const buffer = () => file.arrayBuffer().then((b) => Buffer.from(b));

  let processed;
  try {
    if (RASTER.has(type)) {
      if (file.size > MAX_IMAGE_BYTES) return NextResponse.json({ error: "Images must be under 15 MB" }, { status: 413 });
      processed = await processImage(t.site.id, await buffer(), file.name);
    } else if (type === "image/svg+xml") {
      if (file.size > MAX_SVG_BYTES) return NextResponse.json({ error: "SVGs must be under 1 MB" }, { status: 413 });
      const clean = await sanitizeSvg((await buffer()).toString("utf8"));
      if (!clean) return NextResponse.json({ error: "That SVG couldn't be read safely" }, { status: 415 });
      processed = await processSvg(t.site.id, clean, file.name);
    } else if (FILE_KINDS[type]) {
      const spec = FILE_KINDS[type];
      if (file.size > spec.maxMb * 1024 * 1024) return NextResponse.json({ error: `${spec.ext.toUpperCase()} files must be under ${spec.maxMb} MB` }, { status: 413 });
      processed = await processFile(t.site.id, await buffer(), file.name, type);
    } else {
      return NextResponse.json({ error: "Upload an image, SVG, video (MP4, WebM) or document (PDF, Office, TXT, CSV, ZIP)" }, { status: 415 });
    }
  } catch {
    return NextResponse.json({ error: "That file couldn't be processed" }, { status: 422 });
  }

  const asset = await t.db.mediaAsset.create({
    data: { ...processed, siteId: t.site.id, uploadedById: t.user.id, tags: [] },
  });
  await t.db.auditLog.create({
    data: { siteId: t.site.id, userId: t.user.id, action: "media.upload", targetId: asset.id },
  });
  return NextResponse.json({
    asset: {
      id: asset.id,
      url: asset.url,
      altText: asset.altText,
      width: asset.width,
      height: asset.height,
      originalName: asset.originalName,
      mimeType: asset.mimeType,
      title: asset.title,
      sizeBytes: asset.sizeBytes,
    },
  });
}
