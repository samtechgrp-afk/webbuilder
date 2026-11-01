import "server-only";
import { randomUUID } from "node:crypto";
import {
  FONT_EXT,
  FONT_MIME,
  MAX_FONTS_PER_SITE,
  MAX_FONT_BYTES,
  cleanFamily,
  cleanFontUrl,
  cleanStyle,
  cleanWeight,
  familiesFromCssUrl,
  fontFileFormat,
  isFallback,
  toFontFace,
  type ManagedFont,
} from "@/lib/design/fonts";
import type { TenantContext } from "@/lib/tenant";
import { mediaStorage } from "@/server/media-processing";
import { EditError } from "../content-service";
import { guessFromFilename, readFontInfo } from "./font-file";

/**
 * The font manager. Only `design.tokens` holders (Designers) add or remove
 * fonts; anyone who can open the editor can pick them. Uploaded files go to
 * the same storage as media (R2 in production) under <siteId>/fonts/, with a
 * random name and an extension chosen from the sniffed format. Callers
 * expire the public site cache after a change, since every live page embeds
 * the font rules.
 */

const SELECT = { id: true, family: true, source: true, url: true, format: true, weight: true, style: true, fallback: true, originalName: true, sizeBytes: true, createdAt: true } as const;

const managed = (row: { originalName: string | null; sizeBytes: number | null } & Parameters<typeof toFontFace>[0]): ManagedFont => ({
  ...toFontFace(row),
  originalName: row.originalName,
  sizeBytes: row.sizeBytes,
});

export async function listFonts(t: TenantContext): Promise<ManagedFont[]> {
  const rows = await t.db.siteFont.findMany({ orderBy: [{ createdAt: "asc" }], select: SELECT });
  return rows.map(managed);
}

async function assertRoom(t: TenantContext, adding: number) {
  const count = await t.db.siteFont.count();
  if (count + adding > MAX_FONTS_PER_SITE) throw new EditError(`A site can have at most ${MAX_FONTS_PER_SITE} font files and links`, "invalid");
}

export interface UploadFontInput {
  bytes: Uint8Array;
  fileName: string;
  family?: string | null;
  weight?: string | null;
  style?: string | null;
  fallback?: string | null;
}

export async function uploadFont(t: TenantContext, input: UploadFontInput): Promise<ManagedFont> {
  t.assert("design.tokens");
  if (input.bytes.byteLength > MAX_FONT_BYTES) throw new EditError(`Font files must be under ${MAX_FONT_BYTES / 1024 / 1024} MB`, "invalid");
  const info = readFontInfo(input.bytes);
  if (!info) throw new EditError("That file isn't a font. Upload a .ttf, .otf, .woff or .woff2 file.", "invalid");
  const guess = guessFromFilename(input.fileName);

  const family = input.family?.trim() ? cleanFamily(input.family) : cleanFamily(info.family) ?? guess.family;
  if (!family) throw new EditError("Give the font a family name (letters, digits, spaces and dashes)", "invalid");
  const weight = input.weight?.trim() ? cleanWeight(input.weight) : (info.weight ?? guess.weight ?? "400");
  if (!weight) throw new EditError("Weight is a number from 100 to 900, or a range like 100 900 for variable fonts", "invalid");
  const style = input.style ? cleanStyle(input.style) : (info.style ?? guess.style ?? "normal");
  if (!style) throw new EditError("Style is normal or italic", "invalid");
  const fallback = isFallback(input.fallback) ? input.fallback : "sans-serif";
  await assertRoom(t, 1);

  const storageKey = `${t.site.id}/fonts/${randomUUID()}.${FONT_EXT[info.format]}`;
  const url = await mediaStorage().put(storageKey, Buffer.from(input.bytes), FONT_MIME[info.format]);
  const row = await t.db.siteFont.create({
    data: {
      siteId: t.site.id,
      family,
      source: "UPLOAD",
      storageKey,
      url,
      format: info.format,
      weight,
      style,
      fallback,
      originalName: input.fileName.slice(0, 200),
      sizeBytes: input.bytes.byteLength,
      createdById: t.user.id,
    },
    select: SELECT,
  });
  await t.db.auditLog.create({ data: { siteId: t.site.id, userId: t.user.id, action: "font.upload", targetId: row.id, data: { family } } });
  return managed(row);
}

export interface AddFontLinkInput {
  url: string;
  /** Required unless the URL names its families (Google Fonts, Bunny, Fontshare). */
  family?: string | null;
  fallback?: string | null;
  /** Direct font file links only. */
  weight?: string | null;
  style?: string | null;
}

/**
 * Links a font host. A stylesheet URL becomes one row per family it names
 * (so each shows up in the pickers); a direct .woff2/.ttf/… URL becomes one
 * @font-face like an upload, served from its own host.
 */
export async function addFontLink(t: TenantContext, input: AddFontLinkInput): Promise<ManagedFont[]> {
  t.assert("design.tokens");
  const url = cleanFontUrl(input.url);
  if (!url) throw new EditError("Paste an https:// link to a font stylesheet (like Google Fonts) or a font file", "invalid");
  const fallback = isFallback(input.fallback) ? input.fallback : "sans-serif";
  const format = fontFileFormat(url);
  const typed = input.family?.trim() ? cleanFamily(input.family) : null;
  if (input.family?.trim() && !typed) throw new EditError("Family names use letters, digits, spaces and dashes", "invalid");

  let families: string[];
  if (format) {
    const family = typed ?? guessFromFilename(decodeURIComponent(url.pathname.split("/").pop() ?? "")).family;
    if (!family) throw new EditError("Give the font a family name", "invalid");
    families = [family];
  } else {
    families = typed ? [typed] : familiesFromCssUrl(url);
    if (!families.length) throw new EditError("This link doesn't name its font. Type the family name it declares (for example Lobster).", "invalid");
  }
  const weight = format && input.weight?.trim() ? cleanWeight(input.weight) : "400";
  if (!weight) throw new EditError("Weight is a number from 100 to 900, or a range like 100 900", "invalid");
  const style = format && input.style ? cleanStyle(input.style) : "normal";
  if (!style) throw new EditError("Style is normal or italic", "invalid");

  const existing = await t.db.siteFont.findMany({ where: { source: "LINK", url: url.href }, select: { family: true } });
  const fresh = families.filter((f) => !existing.some((e) => e.family === f));
  if (!fresh.length) throw new EditError("That font link is already added", "invalid");
  await assertRoom(t, fresh.length);

  const rows = [];
  for (const family of fresh) {
    rows.push(
      await t.db.siteFont.create({
        data: { siteId: t.site.id, family, source: "LINK", url: url.href, format, weight, style, fallback, createdById: t.user.id },
        select: SELECT,
      }),
    );
  }
  await t.db.auditLog.create({ data: { siteId: t.site.id, userId: t.user.id, action: "font.link", data: { url: url.href, families: fresh } } });
  return rows.map(managed);
}

/** Renames a family (all its faces) or changes its fallback stack. Pages that already use the old name keep it, so renaming warns in the UI. */
export async function updateFontFamily(t: TenantContext, input: { family: string; rename?: string | null; fallback?: string | null }) {
  t.assert("design.tokens");
  const data: { family?: string; fallback?: string } = {};
  if (input.rename != null) {
    const f = cleanFamily(input.rename);
    if (!f) throw new EditError("Family names use letters, digits, spaces and dashes", "invalid");
    data.family = f;
  }
  if (input.fallback != null) {
    if (!isFallback(input.fallback)) throw new EditError("Unknown fallback", "invalid");
    data.fallback = input.fallback;
  }
  const res = await t.db.siteFont.updateMany({ where: { family: input.family }, data });
  if (!res.count) throw new EditError("That font no longer exists", "not_found");
  return { fonts: await listFonts(t) };
}

/** Removes faces (and their files). Elements still naming the family fall back to its fallback stack. */
export async function deleteFonts(t: TenantContext, input: { ids: string[] }) {
  t.assert("design.tokens");
  const ids = [...new Set(input.ids)].slice(0, MAX_FONTS_PER_SITE);
  const rows = await t.db.siteFont.findMany({ where: { id: { in: ids } }, select: { id: true, family: true, storageKey: true } });
  if (!rows.length) throw new EditError("That font no longer exists", "not_found");
  await t.db.siteFont.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
  for (const r of rows) {
    // Keys come from our own rows and always sit under this site's prefix.
    if (r.storageKey?.startsWith(`${t.site.id}/fonts/`)) await mediaStorage().remove(r.storageKey).catch(() => {});
  }
  await t.db.auditLog.create({ data: { siteId: t.site.id, userId: t.user.id, action: "font.delete", data: { families: [...new Set(rows.map((r) => r.family))] } } });
  return { fonts: await listFonts(t) };
}
