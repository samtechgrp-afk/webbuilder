import { cleanFamily, type FontFormat } from "@/lib/design/fonts";

/**
 * Reads just enough of an uploaded font to trust and describe it: the format
 * from its magic bytes (never from the file name or the browser's MIME type),
 * and for TrueType/OpenType the family name, weight and italic flag from the
 * `name` and `OS/2` tables, so "Brand-BoldItalic.otf" lands as family
 * "Brand", weight 700, italic without the user typing anything. WOFF files
 * are compressed; for those only the format is read.
 */

export interface FontInfo {
  format: FontFormat;
  family: string | null;
  weight: string | null;
  style: "normal" | "italic" | null;
}

export function sniffFontFormat(buf: Uint8Array): FontFormat | null {
  if (buf.length < 12) return null;
  const tag = String.fromCharCode(buf[0], buf[1], buf[2], buf[3]);
  if (tag === "wOFF") return "woff";
  if (tag === "wOF2") return "woff2";
  if (tag === "OTTO") return "opentype";
  if ((buf[0] === 0 && buf[1] === 1 && buf[2] === 0 && buf[3] === 0) || tag === "true") return "truetype";
  return null;
}

function tables(view: DataView) {
  const count = view.getUint16(4);
  const out = new Map<string, { offset: number; length: number }>();
  for (let i = 0; i < count && 12 + i * 16 + 16 <= view.byteLength; i++) {
    const rec = 12 + i * 16;
    const tag = String.fromCharCode(view.getUint8(rec), view.getUint8(rec + 1), view.getUint8(rec + 2), view.getUint8(rec + 3));
    const offset = view.getUint32(rec + 8);
    const length = view.getUint32(rec + 12);
    if (offset + length <= view.byteLength) out.set(tag, { offset, length });
  }
  return out;
}

/** Name records by id, preferring Windows English (UTF-16BE), then Mac Roman. */
function readNames(view: DataView, table: { offset: number; length: number }) {
  const base = table.offset;
  const count = view.getUint16(base + 2);
  const strings = base + view.getUint16(base + 4);
  const names = new Map<number, { score: number; value: string }>();
  for (let i = 0; i < count; i++) {
    const rec = base + 6 + i * 12;
    if (rec + 12 > view.byteLength) break;
    const platform = view.getUint16(rec);
    const encoding = view.getUint16(rec + 2);
    const language = view.getUint16(rec + 4);
    const nameId = view.getUint16(rec + 6);
    const length = view.getUint16(rec + 8);
    const start = strings + view.getUint16(rec + 10);
    if (![1, 2, 4, 16, 17].includes(nameId) || start + length > view.byteLength) continue;
    let value = "";
    let score = 0;
    if (platform === 3 && (encoding === 1 || encoding === 10)) {
      for (let j = 0; j + 1 < length; j += 2) value += String.fromCharCode(view.getUint16(start + j));
      score = language === 0x409 ? 3 : 2;
    } else if (platform === 1 && encoding === 0) {
      for (let j = 0; j < length; j++) value += String.fromCharCode(view.getUint8(start + j));
      score = language === 0 ? 1 : 0;
    } else continue;
    const prev = names.get(nameId);
    if (!prev || score > prev.score) names.set(nameId, { score, value: value.trim() });
  }
  return (id: number) => names.get(id)?.value || null;
}

export function readFontInfo(buf: Uint8Array): FontInfo | null {
  const format = sniffFontFormat(buf);
  if (!format) return null;
  const info: FontInfo = { format, family: null, weight: null, style: null };
  if (format === "woff" || format === "woff2") return info;
  try {
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const t = tables(view);
    const name = t.get("name");
    if (name) {
      const get = readNames(view, name);
      // Typographic family (16) groups weights under one name; legacy family (1) splits them.
      info.family = get(16) ?? get(1);
      const sub = (get(17) ?? get(2) ?? "").toLowerCase();
      if (sub.includes("italic") || sub.includes("oblique")) info.style = "italic";
    }
    const os2 = t.get("OS/2");
    if (os2 && os2.length >= 64) {
      const w = view.getUint16(os2.offset + 4);
      if (w >= 100 && w <= 900) info.weight = String(Math.round(w / 100) * 100);
      const fsSelection = view.getUint16(os2.offset + 62);
      info.style = fsSelection & 1 ? "italic" : (info.style ?? "normal");
    }
    // Variable fonts cover a weight range ("100 900"), so one file serves every weight.
    const fvar = t.get("fvar");
    if (fvar && fvar.length >= 16) {
      const axesAt = fvar.offset + view.getUint16(fvar.offset + 4);
      const axisCount = view.getUint16(fvar.offset + 8);
      const axisSize = view.getUint16(fvar.offset + 10);
      for (let i = 0; i < axisCount; i++) {
        const a = axesAt + i * axisSize;
        if (a + 20 > view.byteLength) break;
        if (String.fromCharCode(view.getUint8(a), view.getUint8(a + 1), view.getUint8(a + 2), view.getUint8(a + 3)) !== "wght") continue;
        const fixed = (o: number) => view.getInt32(o) / 65536;
        const lo = Math.max(100, Math.min(900, Math.round(fixed(a + 4) / 100) * 100));
        const hi = Math.max(100, Math.min(900, Math.round(fixed(a + 12) / 100) * 100));
        if (hi > lo) info.weight = `${lo} ${hi}`;
      }
    }
  } catch {
    // A damaged table only costs us the metadata; the format check already passed.
  }
  return info;
}

const WEIGHT_WORDS: [RegExp, string][] = [
  [/thin|hairline/, "100"],
  [/extra-?light|ultra-?light/, "200"],
  [/light/, "300"],
  [/medium/, "500"],
  [/semi-?bold|demi-?bold/, "600"],
  [/extra-?bold|ultra-?bold/, "800"],
  [/black|heavy/, "900"],
  [/bold/, "700"],
];

/** "Brand-SemiBoldItalic.woff2" → weight 600, italic, family "Brand" (for files without metadata). */
export function guessFromFilename(name: string) {
  const base = name.replace(/\.[a-z0-9]+$/i, "");
  const lower = base.toLowerCase();
  const weight = WEIGHT_WORDS.find(([re]) => re.test(lower))?.[1] ?? null;
  const style = /italic|oblique/.test(lower) ? ("italic" as const) : null;
  const family = cleanFamily(
    base
      .replace(/[-_ ]?(thin|hairline|extra-?light|ultra-?light|light|regular|book|normal|medium|semi-?bold|demi-?bold|extra-?bold|ultra-?bold|bold|black|heavy|italic|oblique|variable|vf)+$/gi, "")
      .replace(/[-_]+/g, " ")
      .replace(/([a-z])([A-Z])/g, "$1 $2"),
  );
  return { family: family ?? cleanFamily(base.replace(/[-_]+/g, " ")), weight, style };
}
