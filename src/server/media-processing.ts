import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { deleteObject, getObject, putObject, s3ConfigFrom, type S3Config } from "@/lib/storage/s3.mjs";

/**
 * Image ingest: every upload becomes WebP, gets responsive variants and a
 * blur placeholder, and is stored under the site's own prefix. Local disk by
 * default; STORAGE_DRIVER=s3 keeps the same key layout in any S3-compatible
 * bucket. Either way the public URL is /uploads/<key>, served by the uploads
 * route, so stored content never changes when the driver does.
 */

export interface StorageAdapter {
  put(key: string, body: Buffer, contentType: string): Promise<string>;
  remove(key: string): Promise<void>;
  /** null when there's no such object. */
  get?(key: string): Promise<{ body: Uint8Array; contentType: string | null } | null>;
}

const uploadsDir = () => path.join(process.cwd(), "public", "uploads");

export const localStorage: StorageAdapter = {
  async put(key, body) {
    const file = path.join(uploadsDir(), key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
    return `/uploads/${key}`;
  },
  async remove(key) {
    const file = path.resolve(uploadsDir(), key);
    // Keys come from our own rows, but never let one escape the uploads folder.
    if (!file.startsWith(uploadsDir() + path.sep)) return;
    await rm(file, { force: true });
  },
  async get(key) {
    const file = path.resolve(uploadsDir(), key);
    if (!file.startsWith(uploadsDir() + path.sep)) return null;
    try {
      return { body: new Uint8Array(await readFile(file)), contentType: null };
    } catch {
      return null;
    }
  },
};

export function s3Storage(cfg: S3Config): StorageAdapter {
  return {
    async put(key, body, contentType) {
      await putObject(cfg, key, body, contentType);
      return `/uploads/${key}`;
    },
    remove: (key) => deleteObject(cfg, key),
    get: (key) => getObject(cfg, key),
  };
}

let selected: StorageAdapter | undefined;
/** The adapter STORAGE_DRIVER picks (read once per process). */
export function mediaStorage(): StorageAdapter {
  if (!selected) {
    const cfg = s3ConfigFrom(process.env);
    selected = cfg ? s3Storage(cfg) : localStorage;
  }
  return selected;
}

/**
 * Files that must not be public (form attachments). Locally they live outside
 * public/ in .data/private; in a bucket under the `private/` prefix, which the
 * uploads route refuses to serve. Admins download them through an authorised
 * route that reads them back with `get`.
 */
export const PRIVATE_PREFIX = "private/";
const privateDir = () => path.join(process.cwd(), ".data", "private");

export const localPrivateStorage: StorageAdapter = {
  async put(key, body) {
    const file = path.resolve(privateDir(), key);
    if (!file.startsWith(privateDir() + path.sep)) throw new Error("Bad key");
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
    return key;
  },
  async remove(key) {
    const file = path.resolve(privateDir(), key);
    if (!file.startsWith(privateDir() + path.sep)) return;
    await rm(file, { force: true });
  },
  async get(key) {
    const file = path.resolve(privateDir(), key);
    if (!file.startsWith(privateDir() + path.sep)) return null;
    try {
      return { body: new Uint8Array(await readFile(file)), contentType: null };
    } catch {
      return null;
    }
  },
};

let privateSelected: StorageAdapter | undefined;
export function privateStorage(): StorageAdapter {
  if (!privateSelected) {
    const cfg = s3ConfigFrom(process.env);
    privateSelected = cfg
      ? {
          async put(key, body, contentType) {
            await putObject(cfg, PRIVATE_PREFIX + key, body, contentType);
            return key;
          },
          remove: (key) => deleteObject(cfg, PRIVATE_PREFIX + key),
          get: (key) => getObject(cfg, PRIVATE_PREFIX + key),
        }
      : localPrivateStorage;
  }
  return privateSelected;
}

/** Responsive widths generated for every raster image (never upscaled). */
export const VARIANT_WIDTHS = [320, 640, 960, 1280, 1920];
const MAX_WIDTH = 2400;

/** Alt text from the filename until a vision model is wired in ("sunset-over-lake.jpg" → "Sunset over lake"). */
export function altFromFilename(name: string) {
  const base = name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  return base ? base[0].toUpperCase() + base.slice(1) : "";
}

export function titleFromFilename(name: string) {
  return altFromFilename(name).slice(0, 120) || "Untitled";
}

/** Upload kinds the library accepts, with the extension each is stored under. */
export const FILE_KINDS: Record<string, { ext: string; kind: "video" | "audio" | "document"; maxMb: number }> = {
  "audio/mpeg": { ext: "mp3", kind: "audio", maxMb: 50 },
  "audio/mp4": { ext: "m4a", kind: "audio", maxMb: 50 },
  "audio/aac": { ext: "aac", kind: "audio", maxMb: 50 },
  "audio/ogg": { ext: "ogg", kind: "audio", maxMb: 50 },
  "audio/wav": { ext: "wav", kind: "audio", maxMb: 100 },
  "audio/webm": { ext: "weba", kind: "audio", maxMb: 50 },
  "video/mp4": { ext: "mp4", kind: "video", maxMb: 100 },
  "video/webm": { ext: "webm", kind: "video", maxMb: 100 },
  "application/pdf": { ext: "pdf", kind: "document", maxMb: 25 },
  "text/plain": { ext: "txt", kind: "document", maxMb: 5 },
  "text/csv": { ext: "csv", kind: "document", maxMb: 10 },
  "application/msword": { ext: "doc", kind: "document", maxMb: 25 },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { ext: "docx", kind: "document", maxMb: 25 },
  "application/vnd.ms-excel": { ext: "xls", kind: "document", maxMb: 25 },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { ext: "xlsx", kind: "document", maxMb: 25 },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": { ext: "pptx", kind: "document", maxMb: 50 },
  "application/zip": { ext: "zip", kind: "document", maxMb: 50 },
};

/**
 * Non-image files are stored as-is, under a random name with an extension
 * from the allowlist above (never the uploader's), so a file can't pick how
 * it's served.
 */
export async function processFile(siteId: string, input: Buffer, originalName: string, mimeType: string, storage: StorageAdapter = mediaStorage()) {
  const spec = FILE_KINDS[mimeType];
  if (!spec) throw new Error("Unsupported file type");
  const storageKey = `${siteId}/${randomUUID()}.${spec.ext}`;
  const url = await storage.put(storageKey, input, mimeType);
  return { storageKey, url, title: titleFromFilename(originalName), mimeType, sizeBytes: input.length, variants: {}, originalName, altText: null };
}

/** Sanitised SVG, stored as SVG (vector logos and icons stay crisp). */
export async function processSvg(siteId: string, clean: string, originalName: string, storage: StorageAdapter = mediaStorage()) {
  const body = Buffer.from(clean, "utf8");
  const storageKey = `${siteId}/${randomUUID()}.svg`;
  const url = await storage.put(storageKey, body, "image/svg+xml");
  const vb = clean.match(/viewBox="[\d.\s-]*?\s([\d.]+)\s+([\d.]+)"/);
  const w = Number(clean.match(/<svg[^>]*\swidth="([\d.]+)/)?.[1] ?? vb?.[1]) || null;
  const h = Number(clean.match(/<svg[^>]*\sheight="([\d.]+)/)?.[1] ?? vb?.[2]) || null;
  return {
    storageKey, url, title: titleFromFilename(originalName), mimeType: "image/svg+xml", sizeBytes: body.length,
    width: w ? Math.round(w) : null, height: h ? Math.round(h) : null, variants: {},
    altText: altFromFilename(originalName), altTextSource: "FILENAME" as const, originalName,
  };
}

export async function processImage(siteId: string, input: Buffer, originalName: string, storage: StorageAdapter = mediaStorage()) {
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
    title: titleFromFilename(originalName),
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
