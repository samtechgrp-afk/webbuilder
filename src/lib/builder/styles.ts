import type { BuilderDocument, StyleProps } from "./types";
import { BREAKPOINTS, BREAKPOINT_ORDER } from "./types";

/**
 * Real-time style injection. Each node gets a class (`n-<id>`) and its
 * responsive style compiles into one <style> block. Breakpoints are container
 * queries on the site root, so the editor's resizable canvas previews tablet
 * and mobile exactly like a real device, without an iframe.
 */

export interface DesignTokens {
  colors?: Record<string, string>;
  fonts?: Record<string, string>;
  fontSizes?: Record<string, string>;
  radii?: Record<string, string>;
  shadows?: Record<string, string>;
  spacing?: Record<string, string>;
}

const TOKEN_PREFIX: Record<keyof DesignTokens, string> = {
  colors: "color",
  fonts: "font",
  fontSizes: "text",
  radii: "radius",
  shadows: "shadow",
  spacing: "space",
};

/** Rejects anything that could break out of a declaration or the <style> element. */
export function safeCssValue(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const v = String(value).trim();
  if (!v || v.length > 300 || /[;{}<>\\]|\/\*|@import|expression\(|url\(/i.test(v)) return null;
  return v;
}

const safeIdent = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, "");

export const nodeClass = (id: string) => `n-${safeIdent(id)}`;

const kebab = (key: string) => key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

function declarations(style: StyleProps): string {
  return Object.entries(style)
    .map(([k, v]) => {
      const value = safeCssValue(v);
      return value ? `${kebab(k)}:${value}` : null;
    })
    .filter(Boolean)
    .join(";");
}

export function tokensToCss(tokens: DesignTokens, scope = ".site-root"): string {
  const vars: string[] = [];
  for (const [group, prefix] of Object.entries(TOKEN_PREFIX) as [keyof DesignTokens, string][]) {
    for (const [name, value] of Object.entries(tokens[group] ?? {})) {
      const v = safeCssValue(value);
      if (v) vars.push(`--${prefix}-${safeIdent(name)}:${v}`);
    }
  }
  return `${scope}{${vars.join(";")}}`;
}

const BASE_CSS = `
.site-root{container:site/inline-size;min-height:100dvh;font-family:var(--font-body,system-ui,sans-serif);color:var(--color-text,#111);background:var(--color-background,#fff);-webkit-font-smoothing:antialiased}
.site-root *,.site-root *::before,.site-root *::after{box-sizing:border-box}
.site-root h1,.site-root h2,.site-root h3,.site-root h4,.site-root p{margin:0}
.site-root [data-w="text"]{white-space:pre-line}
.site-root [data-w="image"]{overflow:hidden}
.site-root [data-w="image"]:not(:has(img)){min-height:120px;background:repeating-linear-gradient(135deg,rgba(0,0,0,.04) 0 12px,rgba(0,0,0,.08) 12px 24px)}
.site-root [data-w="image"] img{display:block;width:100%;height:100%;object-fit:inherit}
.site-root a[data-w="button"]{display:inline-flex;align-items:center;justify-content:center;text-decoration:none;cursor:pointer;transition:transform .2s ease,box-shadow .2s ease}
.site-root a[data-w="button"]:hover{transform:translateY(-1px)}
.site-root [data-w="price"] s{opacity:.55;margin-left:.5em;font-size:.6em}
.site-root [data-w="gallery"] figure{margin:0;overflow:hidden;border-radius:inherit}
.site-root [data-w="gallery"] img{display:block;width:100%;aspect-ratio:1;object-fit:cover}
.site-root [data-w="gallery"]:not(:has(img)){min-height:120px;background:repeating-linear-gradient(135deg,rgba(0,0,0,.04) 0 12px,rgba(0,0,0,.08) 12px 24px)}
.site-root [data-w="richtext"]>*+*{margin-top:1em}
.site-root [data-w="richtext"] h2,.site-root [data-w="richtext"] h3{font-family:var(--font-display,inherit);line-height:1.2}
.site-root [data-w="richtext"] a{color:inherit;text-underline-offset:.2em}
.site-root [data-w="richtext"] blockquote{margin-left:0;padding-left:1em;border-left:2px solid currentColor;opacity:.85}
.site-root [data-w="richtext"][data-empty]{min-height:80px;background:repeating-linear-gradient(135deg,rgba(0,0,0,.03) 0 12px,rgba(0,0,0,.06) 12px 24px)}
.site-root [data-loop-empty]{grid-column:1/-1;opacity:.6}
`;

export function buildCss(doc: BuilderDocument, tokens: DesignTokens = {}): string {
  const parts = [BASE_CSS, tokensToCss(tokens)];
  for (const bp of BREAKPOINT_ORDER) {
    const rules: string[] = [];
    for (const node of Object.values(doc.nodes)) {
      const style = node.style?.[bp];
      if (!style) continue;
      const decl = declarations(style);
      if (decl) rules.push(`.${nodeClass(node.id)}{${decl}}`);
    }
    if (!rules.length) continue;
    const max = BREAKPOINTS[bp].maxWidth;
    parts.push(max ? `@container site (max-width:${max}px){${rules.join("")}}` : rules.join(""));
  }
  return parts.join("\n");
}

// ── WCAG contrast ────────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] | null {
  const m = hex.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance([r, g, b]: [number, number, number]) {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG 2.1 contrast ratio between two hex colours, or null if either isn't a plain hex. */
export function contrastRatio(fg: string, bg: string): number | null {
  const a = hexToRgb(fg);
  const b = hexToRgb(bg);
  if (!a || !b) return null;
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Resolves `var(--color-x)` against the token palette so contrast can be checked. */
export function resolveColor(value: string | undefined, tokens: DesignTokens): string | undefined {
  if (!value) return undefined;
  const m = value.match(/^var\(--color-([\w-]+)\)$/);
  return m ? tokens.colors?.[m[1]] : value;
}
