import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

/**
 * Image ingest: every upload becomes WebP, gets responsive variants and a
 * blur placeholder, and is stored under the site's own prefix. Local disk in
 * development; swap `storage` for S3/R2 in production (same key layout).
 */

export interface StorageAdapter {
  put(key: string, body: Buffer, contentType: string): Promise<string>;
}

export const localStorage: StorageAdapter = {
  async put(key, body) {
    const file = path.join(process.cwd(), "public", "uploads", key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
    return `/uploads/${key}`;
  },
};

const VARIANT_WIDTHS = [640, 1280];
const MAX_WIDTH = 2400;

/** Alt text from the filename until a vision model is wired in ("sunset-over-lake.jpg" → "Sunset over lake"). */
export function altFromFilename(name: string) {
  const base = name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  return base ? base[0].toUpperCase() + base.slice(1) : "";
}

export async function processImage(siteId: string, input: Buffer, originalName: string, storage: StorageAdapter = localStorage) {
  const id = randomUUID();
  const image = sharp(input, { failOn: "error" }).rotate();
  const meta = await image.metadata();
  if (!meta.width || !meta.height) throw new Error("Not a readable image");

  const main = await image.clone().resize({ width: Math.min(meta.width, MAX_WIDTH), withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
  const storageKey = `${siteId}/${id}.webp`;
  const url = await storage.put(storageKey, main.data, "image/webp");

  const variants: Record<string, string> = {};
  for (const w of VARIANT_WIDTHS) {
    if (w >= main.info.width) continue;
    const buf = await image.clone().resize({ width: w }).webp({ quality: 80 }).toBuffer();
    variants[w] = await storage.put(`${siteId}/${id}-${w}.webp`, buf, "image/webp");
  }

  const blur = await image.clone().resize({ width: 16 }).webp({ quality: 40 }).toBuffer();

  return {
    storageKey,
    url,
    mimeType: "image/webp",
    sizeBytes: main.data.length,
    width: main.info.width,
    height: main.info.height,
    variants,
    blurDataUrl: `data:image/webp;base64,${blur.toString("base64")}`,
    altText: altFromFilename(originalName),
    altTextSource: "FILENAME" as const,
    originalName,
  };
}
