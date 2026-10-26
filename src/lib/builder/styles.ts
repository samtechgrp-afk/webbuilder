import type { BuilderDocument, StyleProps } from "./types";
import { BREAKPOINTS, BREAKPOINT_ORDER } from "./types";
import { safeCssValue, safeIdent } from "../design/css-values";
import { tokensToCss, type DesignTokens } from "../design/tokens";

/**
 * Real-time style injection. Each node gets a class (`n-<id>`) and its
 * responsive style compiles into one <style> block. Breakpoints are container
 * queries on the site root, so the editor's resizable canvas previews tablet
 * and mobile exactly like a real device, without an iframe.
 */

export { safeCssValue } from "../design/css-values";
export { resolveColor, tokensToCss, type DesignTokens } from "../design/tokens";

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

const BASE_CSS = `
.site-root{container:site/inline-size;min-height:100dvh;font-family:var(--font-body,system-ui,sans-serif);color:var(--color-text,#111);background:var(--color-background,#fff);-webkit-font-smoothing:antialiased}
.site-root *,.site-root *::before,.site-root *::after{box-sizing:border-box}
.site-root h1,.site-root h2,.site-root h3,.site-root h4,.site-root p{margin:0}
.site-root [data-w="text"]{white-space:pre-line}
:where(.site-root)>*{font-size:var(--text-body);line-height:var(--leading-body)}
:where(.site-root) :is(h1,h2,h3,h4){font-family:var(--font-heading);color:var(--color-heading);line-height:var(--leading-tight);letter-spacing:var(--tracking-tight)}
:where(.site-root) h1{font-size:var(--text-h1,2em)}
:where(.site-root) h2{font-size:var(--text-h2,1.5em)}
:where(.site-root) h3{font-size:var(--text-h3,1.17em)}
:where(.site-root) h4{font-size:var(--text-h4,1em)}
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
.site-root [data-w="langswitch"] ul{display:flex;flex-wrap:wrap;gap:inherit;margin:0;padding:0;list-style:none}
.site-root [data-w="langswitch"] a{color:inherit;text-decoration:none;opacity:.7}
.site-root [data-w="langswitch"] a:hover,.site-root [data-w="langswitch"] a[aria-current]{opacity:1;text-decoration:underline;text-underline-offset:.25em}
.site-root [data-w="langswitch"] details{position:relative}
.site-root [data-w="langswitch"] summary{cursor:pointer;list-style:none}
.site-root [data-w="langswitch"] summary::-webkit-details-marker{display:none}
.site-root [data-w="langswitch"] summary::after{content:" ▾";font-size:.8em}
.site-root [data-w="langswitch"] details ul{position:absolute;z-index:20;top:calc(100% + .4rem);right:0;flex-direction:column;gap:.15rem;min-width:10rem;padding:.4rem;border-radius:var(--radius-md,8px);background:var(--color-background,#fff);color:var(--color-text,#111);box-shadow:0 10px 30px rgba(0,0,0,.15)}
.site-root [data-w="langswitch"] details a{display:block;padding:.35rem .6rem}
.site-root [data-w="langswitch"][data-empty]{min-width:8rem;min-height:1.6rem;background:repeating-linear-gradient(135deg,rgba(0,0,0,.03) 0 8px,rgba(0,0,0,.06) 8px 16px)}
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
