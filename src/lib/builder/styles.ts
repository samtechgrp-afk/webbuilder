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
.site-root [data-w="productgrid"] [data-grid-sort]{grid-column:1/-1;display:flex;gap:.5rem;align-items:center;justify-self:end;font-size:.85rem}
.site-root [data-w="productgrid"] select,.site-root [data-w="product"] select,.site-root [data-w="product"] input{font:inherit;padding:.5rem .7rem;border:1px solid color-mix(in srgb,currentColor 25%,transparent);border-radius:var(--radius-sm,6px);background:transparent;color:inherit}
.site-root [data-product-card]{display:flex;flex-direction:column;gap:.5rem}
.site-root [data-product-card]>a[data-product-link]{display:block;overflow:hidden;border-radius:var(--radius-md,8px);aspect-ratio:4/5;background:color-mix(in srgb,currentColor 6%,transparent)}
.site-root [data-product-card] img{display:block;width:100%;height:100%;object-fit:cover;transition:transform .4s ease}
.site-root [data-product-card]>a[data-product-link]:hover img{transform:scale(1.03)}
.site-root [data-product-card] h3{margin:.25rem 0 0;font-size:1.05rem;font-weight:500}
.site-root [data-product-card] h3 a{color:inherit;text-decoration:none}
.site-root [data-product-card] p{margin:0}
.site-root [data-w="productgrid"] s,.site-root [data-w="product"] s{opacity:.55;margin-left:.5em;font-size:.85em}
.site-root [data-product-card] button,.site-root [data-product-card] [data-choose-options],.site-root [data-w="product"] button[type="submit"],.site-root [data-checkout]{align-self:flex-start;display:inline-flex;align-items:center;justify-content:center;padding:.7rem 1.2rem;border:0;border-radius:var(--radius-pill,999px);background:var(--color-deep,#111);color:var(--color-inverse,#fff);font:inherit;font-weight:500;text-decoration:none;cursor:pointer}
.site-root button:disabled{opacity:.45;cursor:not-allowed}
.site-root [data-sold-out]{opacity:.6;font-size:.9rem}
.site-root [data-no-image]{display:block;width:100%;height:100%;min-height:64px;background:repeating-linear-gradient(135deg,rgba(0,0,0,.04) 0 12px,rgba(0,0,0,.08) 12px 24px)}
.site-root [data-product-gallery]>img{display:block;width:100%;height:auto;border-radius:var(--radius-md,8px)}
.site-root [data-product-gallery] ul{display:flex;gap:.5rem;margin:.75rem 0 0;padding:0;list-style:none}
.site-root [data-product-gallery] li button{padding:0;border:2px solid transparent;border-radius:var(--radius-sm,6px);background:none;cursor:pointer;overflow:hidden}
.site-root [data-product-gallery] li button[aria-current]{border-color:currentColor}
.site-root [data-product-gallery] li img{display:block;width:64px;height:64px;object-fit:cover}
.site-root [data-product-info]{display:flex;flex-direction:column;gap:1rem}
.site-root [data-product-info] h1,.site-root [data-product-info] h2{margin:0;font-family:var(--font-display,inherit);font-size:var(--text-h2,2.2rem);line-height:1.1}
.site-root [data-product-price]{margin:0;font-family:var(--font-display,inherit);font-size:1.6rem}
.site-root [data-product-description] p{margin:0 0 .75em;line-height:1.6;opacity:.85}
.site-root [data-w="product"] form{display:flex;flex-direction:column;gap:.85rem}
.site-root [data-option-field]{display:flex;flex-direction:column;gap:.3rem;font-size:.85rem}
.site-root [data-option-field] input{width:6rem}
.site-root [data-stock]{margin:0;font-size:.85rem;opacity:.7}
.site-root [data-w="cart"] [data-cart-toggle]{display:inline-flex;align-items:center;gap:.5rem;padding:.4rem .2rem;border:0;background:none;color:inherit;font:inherit;cursor:pointer}
.site-root [data-cart-count]{display:inline-grid;place-items:center;min-width:1.4rem;height:1.4rem;padding:0 .35rem;border-radius:999px;background:var(--color-deep,#111);color:var(--color-inverse,#fff);font-size:.75rem}
.site-root [data-cart-layer]{position:fixed;inset:0;z-index:1000}
.site-root [data-cart-backdrop]{position:absolute;inset:0;background:rgba(0,0,0,.4);animation:wb-fade .2s ease}
.site-root [data-cart-drawer]{position:absolute;top:0;right:0;bottom:0;display:flex;flex-direction:column;width:min(420px,100vw);background:var(--color-background,#fff);color:var(--color-text,#111);box-shadow:-10px 0 40px rgba(0,0,0,.2);animation:wb-slide .25s ease;font-size:.95rem}
.site-root [data-cart-drawer] header,.site-root [data-cart-drawer] footer{display:flex;align-items:center;justify-content:space-between;padding:1.1rem 1.25rem;border-bottom:1px solid rgba(0,0,0,.08)}
.site-root [data-cart-drawer] header h2{margin:0;font-size:1.15rem}
.site-root [data-cart-close]{border:0;background:none;font-size:1.6rem;line-height:1;color:inherit;cursor:pointer}
.site-root [data-cart-notice]{margin:1rem 1.25rem 0;padding:.7rem .9rem;border-radius:var(--radius-sm,6px);background:rgba(0,0,0,.05)}
.site-root [data-cart-notice="success"]{background:#e8f5ec;color:#14532d}
.site-root [data-cart-notice="error"]{background:#fdecec;color:#7f1d1d}
.site-root [data-cart-empty]{padding:2rem 1.25rem;opacity:.65}
.site-root [data-cart-lines]{flex:1;margin:0;padding:.5rem 1.25rem;overflow-y:auto;list-style:none}
.site-root [data-cart-line]{display:grid;grid-template-columns:64px 1fr auto;gap:.4rem .9rem;align-items:start;padding:.9rem 0;border-bottom:1px solid rgba(0,0,0,.06)}
.site-root [data-cart-line] img,.site-root [data-cart-line] [data-no-image]{width:64px;height:64px;object-fit:cover;border-radius:var(--radius-sm,6px)}
.site-root [data-cart-line]>div:first-of-type{display:flex;flex-direction:column;gap:.15rem}
.site-root [data-cart-line] a{color:inherit;font-weight:500;text-decoration:none}
.site-root [data-cart-line] small{opacity:.65}
.site-root [data-qty]{display:flex;align-items:center;border:1px solid rgba(0,0,0,.15);border-radius:999px}
.site-root [data-qty] button{width:1.9rem;height:1.9rem;border:0;background:none;color:inherit;cursor:pointer}
.site-root [data-qty] input{width:2.2rem;border:0;background:none;text-align:center;font:inherit;color:inherit;-moz-appearance:textfield}
.site-root [data-qty] input::-webkit-inner-spin-button{display:none}
.site-root [data-line-remove]{grid-column:2;justify-self:start;padding:0;border:0;background:none;color:inherit;font-size:.8rem;opacity:.6;text-decoration:underline;cursor:pointer}
.site-root [data-cart-drawer] footer{flex-direction:column;align-items:stretch;gap:.6rem;border-top:1px solid rgba(0,0,0,.08);border-bottom:0}
.site-root [data-cart-drawer] footer p{display:flex;justify-content:space-between;margin:0;font-size:1.05rem}
.site-root [data-cart-drawer] footer small{opacity:.65}
.site-root [data-checkout]{align-self:stretch;padding:.9rem 1.2rem}
.site-root [data-w="productgrid"][data-empty],.site-root [data-w="product"][data-empty],.site-root [data-w="cart"][data-empty]{min-height:3rem;min-width:5rem;background:repeating-linear-gradient(135deg,rgba(0,0,0,.03) 0 8px,rgba(0,0,0,.06) 8px 16px)}
.site-root h5,.site-root h6{margin:0}
:where(.site-root) :is(h5,h6){font-family:var(--font-heading);color:var(--color-heading);line-height:var(--leading-tight)}
:where(.site-root) h5{font-size:var(--text-h5,.9em)}
:where(.site-root) h6{font-size:var(--text-h6,.8em)}
.site-root [data-backdrop]{position:relative;isolation:isolate}
.site-root [data-backdrop]>[data-bg-layer]{position:absolute;inset:0;z-index:-1;width:100%;height:100%;object-fit:cover;pointer-events:none;border-radius:inherit}
.site-root [data-gradient]{background:var(--wb-grad);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent}
.site-root a[data-w="button"]>svg{flex:none;width:1.1em;height:1.1em}
.site-root a[data-w="button"]:has(>svg){gap:.5em}
.site-root a[data-w="button"][data-hover="none"]:hover{transform:none}
.site-root a[data-w="button"][data-hover="grow"]:hover{transform:scale(1.04)}
.site-root a[data-w="button"][data-hover="glow"]:hover{transform:none;box-shadow:0 0 0 4px color-mix(in srgb,currentColor 18%,transparent),0 8px 24px color-mix(in srgb,currentColor 22%,transparent)}
.site-root [data-w="image"]{position:relative}
.site-root [data-w="image"]>a{display:block;width:100%;height:100%;cursor:zoom-in}
.site-root [data-w="image"] [data-caption]{position:absolute;left:0;right:0;bottom:0;padding:.6rem .8rem;font-size:.85rem;color:#fff;background:linear-gradient(transparent,rgba(0,0,0,.55))}
.site-root [data-w="gallery"] figure>a{display:block;cursor:zoom-in}
.site-root [data-w="gallery"][data-layout="masonry"]{display:block;columns:var(--wb-cols,3);column-gap:var(--space-sm,1rem)}
.site-root [data-w="gallery"][data-layout="masonry"] figure{break-inside:avoid;margin-bottom:var(--space-sm,1rem)}
.site-root [data-w="gallery"][data-layout="masonry"] img{aspect-ratio:auto;height:auto}
@container site (max-width:767px){.site-root [data-w="gallery"][data-layout="masonry"]{columns:2}.site-root [data-w="prose"][data-cols]{columns:1}}
.site-root [data-w="divider"][data-shape="line"]{display:flex;justify-content:center}
.site-root [data-w="divider"][data-align="left"]{justify-content:flex-start}
.site-root [data-w="divider"][data-align="right"]{justify-content:flex-end}
.site-root [data-w="divider"][data-shape="line"]>span{display:block;width:var(--wb-len,100%);border-top:var(--wb-line)}
.site-root [data-w="divider"] svg{display:block}
.site-root [data-w="prose"]>*+*{margin-top:1em}
.site-root [data-w="prose"] :is(h2,h3,h4){font-family:var(--font-display,inherit);line-height:1.2}
.site-root [data-w="prose"] a{color:var(--color-primary,inherit);text-underline-offset:.2em}
.site-root [data-w="prose"] blockquote{margin-left:0;padding-left:1em;border-left:3px solid currentColor;opacity:.85}
.site-root [data-w="prose"] :is(ul,ol){padding-left:1.4em}
.site-root [data-w="prose"][data-cols]{columns:var(--wb-cols);column-gap:2.5em}
.site-root [data-w="prose"][data-cols]>*{break-inside:avoid}
.site-root [data-w="prose"][data-dropcap]>p:first-of-type::first-letter{float:left;font-family:var(--font-display,inherit);font-size:3.4em;line-height:.85;padding:.08em .1em 0 0;color:var(--color-primary,currentColor)}
.site-root [data-w="video"]{overflow:hidden;background:#000}
.site-root [data-w="video"] :is(iframe,video){display:block;width:100%;height:100%;border:0;object-fit:cover}
.site-root [data-w="map"]{position:relative;overflow:hidden}
.site-root [data-w="map"] iframe{display:block;width:100%;height:100%;border:0}
.site-root [data-w="map"][data-tone="muted"] iframe{filter:saturate(.35) contrast(1.05)}
.site-root [data-w="map"][data-tone="grayscale"] iframe{filter:grayscale(1)}
.site-root [data-w="map"][data-tone="dark"] iframe{filter:invert(.92) hue-rotate(180deg) saturate(.6)}
.site-root [data-map-pin]{position:absolute;left:50%;top:50%;transform:translate(-50%,-100%);color:var(--color-primary,#e11d48);filter:drop-shadow(0 4px 6px rgba(0,0,0,.35));pointer-events:none}
.site-root :is([data-w="video"],[data-w="map"],[data-w="prose"])[data-empty]{min-height:120px;background:repeating-linear-gradient(135deg,rgba(0,0,0,.04) 0 12px,rgba(0,0,0,.08) 12px 24px)}
.site-root [data-w="icon"]{display:inline-flex;align-items:center;justify-content:center;line-height:0;transition:transform .25s ease,box-shadow .25s ease}
.site-root [data-w="icon"][data-shape]{padding:.6em;background:var(--wb-icon-bg,color-mix(in srgb,currentColor 12%,transparent))}
.site-root [data-w="icon"][data-shape="circle"]{border-radius:999px}
.site-root [data-w="icon"][data-shape="square"]{border-radius:var(--radius-md,12px)}
.site-root :is([data-w="icon"],[data-w="iconbox"])[data-hover="lift"]:hover{transform:translateY(-4px)}
.site-root :is([data-w="icon"],[data-w="iconbox"])[data-hover="grow"]:hover{transform:scale(1.05)}
.site-root :is([data-w="icon"],[data-w="iconbox"])[data-hover="glow"]:hover{box-shadow:0 0 0 1px color-mix(in srgb,var(--color-primary,#6366f1) 40%,transparent),0 12px 40px color-mix(in srgb,var(--color-primary,#6366f1) 25%,transparent)}
.site-root [data-w="iconbox"]{display:flex;flex-direction:column;transition:transform .25s ease,box-shadow .25s ease}
.site-root [data-w="iconbox"][data-layout="left"]{flex-direction:row;align-items:flex-start}
.site-root [data-iconbox-icon]{display:inline-flex;line-height:0;color:var(--color-primary,currentColor)}
.site-root [data-iconbox-body]{display:flex;flex-direction:column;gap:.4em}
.site-root [data-iconbox-body]>:is(h2,h3,h4,h5,h6,p:first-child){font-size:1.2rem}
.site-root [data-iconbox-body]>p{line-height:1.6;color:var(--color-muted,inherit)}
.wb-lightbox{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;width:100vw;max-width:none;height:100dvh;max-height:none;margin:0;padding:4vmin;border:0;background:rgba(10,10,12,.92);color:#fff}
.wb-lightbox::backdrop{background:transparent}
.wb-lightbox img{max-width:100%;max-height:calc(100dvh - 10vmin);object-fit:contain;border-radius:6px;box-shadow:0 20px 60px rgba(0,0,0,.5)}
.wb-lightbox button{position:absolute;display:grid;place-items:center;width:44px;height:44px;border:0;border-radius:999px;background:rgba(255,255,255,.12);color:#fff;font:inherit;font-size:1.4rem;cursor:pointer}
.wb-lightbox button:hover{background:rgba(255,255,255,.22)}
.wb-lightbox [data-lb-close]{top:16px;right:16px}
.wb-lightbox [data-lb-prev]{left:16px;top:50%;transform:translateY(-50%)}
.wb-lightbox [data-lb-next]{right:16px;top:50%;transform:translateY(-50%)}
.wb-lightbox p{position:absolute;bottom:16px;left:0;right:0;margin:0;text-align:center;font-size:.9rem;opacity:.8}
@media (prefers-reduced-motion:reduce){.site-root [data-w] {transition:none!important}}
@keyframes wb-slide{from{transform:translateX(100%)}to{transform:none}}
@keyframes wb-fade{from{opacity:0}to{opacity:1}}
@media (prefers-reduced-motion:reduce){.site-root [data-cart-drawer],.site-root [data-cart-backdrop]{animation:none}}
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
