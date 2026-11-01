/**
 * Custom fonts: families a site adds on top of the built-in ones, either by
 * uploading font files (stored like media, in R2 in production) or by
 * linking a font host's stylesheet such as Google Fonts.
 *
 * The rows live in the SiteFont table. Renderers receive them as
 * `tokens.fontFaces` (attached at load time, never saved with the tokens),
 * and `fontFacesCss` turns them into `@import` and `@font-face` rules at the
 * top of the page's stylesheet, so the canvas, the live site and the static
 * export load the same files. Everything here is pure, so it's unit-tested
 * and shared by the server and the editor.
 */

export type FontFormat = "truetype" | "opentype" | "woff" | "woff2";

export interface SiteFontFace {
  id: string;
  family: string;
  source: "UPLOAD" | "LINK";
  url: string;
  /** Null for a linked stylesheet (it declares its own faces). */
  format: FontFormat | null;
  weight: string;
  style: string;
  fallback: string;
}

/** A face as the font manager lists it. */
export interface ManagedFont extends SiteFontFace {
  originalName: string | null;
  sizeBytes: number | null;
}

export const FONT_EXTENSIONS: Record<string, FontFormat> = { ttf: "truetype", otf: "opentype", woff: "woff", woff2: "woff2" };
export const FONT_MIME: Record<FontFormat, string> = { truetype: "font/ttf", opentype: "font/otf", woff: "font/woff", woff2: "font/woff2" };
export const FONT_EXT: Record<FontFormat, string> = { truetype: "ttf", opentype: "otf", woff: "woff", woff2: "woff2" };

/** Generic families a custom font falls back to while it loads (or if it fails). */
export const FALLBACKS = {
  "sans-serif": "system-ui, sans-serif",
  serif: "Georgia, serif",
  monospace: "ui-monospace, monospace",
  display: "system-ui, sans-serif",
  handwriting: "cursive",
} as const;
export type Fallback = keyof typeof FALLBACKS;
export const isFallback = (v: unknown): v is Fallback => typeof v === "string" && v in FALLBACKS;

export const MAX_FONT_BYTES = 4 * 1024 * 1024;
export const MAX_FONTS_PER_SITE = 60;

/** Family names are written into CSS inside quotes, so only plain characters are allowed. */
const FAMILY = /^[A-Za-z0-9][A-Za-z0-9 _-]{0,62}$/;
export function cleanFamily(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.replace(/\s+/g, " ").trim();
  return FAMILY.test(v) ? v : null;
}

const WEIGHT = /^([1-9]00)( [1-9]00)?$/;
export function cleanWeight(raw: unknown): string | null {
  const v = String(raw ?? "").trim();
  if (!WEIGHT.test(v)) return null;
  const [a, b] = v.split(" ").map(Number);
  return b !== undefined && b <= a ? null : v;
}

export const cleanStyle = (raw: unknown) => (raw === "italic" ? "italic" : raw === "normal" || raw == null || raw === "" ? "normal" : null);

/**
 * An https URL that is safe to write inside `url("…")` in a stylesheet: no
 * quotes, parentheses, backslashes, whitespace or angle brackets.
 */
export function cleanFontUrl(raw: unknown): URL | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  if (!v || v.length > 1000 || /["'()\\<>\s`]/.test(v)) return null;
  try {
    const u = new URL(v);
    if (u.protocol !== "https:" || u.username || u.password) return null;
    return u;
  } catch {
    return null;
  }
}

/** A direct font file link (…/Brand.woff2) rather than a stylesheet. */
export function fontFileFormat(url: URL): FontFormat | null {
  const ext = url.pathname.split(".").pop()?.toLowerCase() ?? "";
  return FONT_EXTENSIONS[ext] ?? null;
}

/**
 * Families a font host's stylesheet URL names. Understands Google Fonts
 * (css and css2), Bunny Fonts and Fontshare; for any other host the user
 * types the family themselves.
 *   https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;1,700&family=Inter
 *   → ["Playfair Display", "Inter"]
 */
export function familiesFromCssUrl(url: URL): string[] {
  const out: string[] = [];
  const add = (name: string) => {
    const f = cleanFamily(name.replace(/\+/g, " "));
    if (f && !out.includes(f)) out.push(f);
  };
  if (url.hostname === "api.fontshare.com") {
    for (const v of url.searchParams.getAll("f[]")) add(v.split("@")[0].replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()));
    return out;
  }
  for (const v of url.searchParams.getAll("family")) {
    // css2 repeats `family`; the old css API joins families with "|".
    for (const part of v.split("|")) add(part.split(":")[0]);
  }
  return out;
}

/** The value a style or token stores for a custom family. */
export function fontStack(family: string, fallback: string = "sans-serif"): string {
  return `"${family}", ${FALLBACKS[isFallback(fallback) ? fallback : "sans-serif"]}`;
}

export interface FontFamilyOption {
  family: string;
  value: string;
  source: "UPLOAD" | "LINK";
  /** Weights available, for the manager's summary ("400 · 700 italic"). */
  faces: string[];
}

/** One option per family, in the order they were added. */
export function fontFamilyOptions(faces: SiteFontFace[] | undefined): FontFamilyOption[] {
  const byFamily = new Map<string, FontFamilyOption>();
  for (const f of faces ?? []) {
    const o = byFamily.get(f.family) ?? { family: f.family, value: fontStack(f.family, f.fallback), source: f.source, faces: [] };
    if (f.format) o.faces.push(`${f.weight}${f.style === "italic" ? " italic" : ""}`);
    byFamily.set(f.family, o);
  }
  return [...byFamily.values()];
}

/**
 * The CSS that makes the families usable: `@import` for each linked
 * stylesheet (deduplicated, and always first, as CSS requires) then one
 * `@font-face` per uploaded or directly linked file. Rows that fail
 * validation are skipped, so a bad row can never break the stylesheet.
 */
export function fontFacesCss(faces: SiteFontFace[] | undefined): string {
  if (!faces?.length) return "";
  const imports = new Set<string>();
  const rules: string[] = [];
  for (const f of faces) {
    const family = cleanFamily(f.family);
    if (!family) continue;
    if (!f.format) {
      const u = cleanFontUrl(f.url);
      if (u) imports.add(`@import url("${u.href}");`);
      continue;
    }
    if (!FONT_MIME[f.format]) continue;
    const weight = cleanWeight(f.weight) ?? "400";
    const style = cleanStyle(f.style) ?? "normal";
    const src = f.source === "UPLOAD" ? (/^\/uploads\/[\w/.-]+$/.test(f.url) && !f.url.includes("..") ? f.url : null) : cleanFontUrl(f.url)?.href;
    if (!src) continue;
    rules.push(`@font-face{font-family:"${family}";src:url("${src}") format("${f.format}");font-weight:${weight};font-style:${style};font-display:swap}`);
  }
  return [...imports, ...rules].join("\n");
}

/** Row → face, for the renderers (drops storage details the browser doesn't need). */
export function toFontFace(row: { id: string; family: string; source: string; url: string; format: string | null; weight: string; style: string; fallback: string }): SiteFontFace {
  return {
    id: row.id,
    family: row.family,
    source: row.source === "UPLOAD" ? "UPLOAD" : "LINK",
    url: row.url,
    format: row.format && row.format in FONT_MIME ? (row.format as FontFormat) : null,
    weight: row.weight,
    style: row.style,
    fallback: row.fallback,
  };
}

/** Attaches the site's fonts to its tokens for rendering. */
export function withFontFaces<T extends object>(tokens: T, rows: Parameters<typeof toFontFace>[0][] | undefined): T & { fontFaces?: SiteFontFace[] } {
  return rows?.length ? { ...tokens, fontFaces: rows.map(toFontFace) } : tokens;
}
