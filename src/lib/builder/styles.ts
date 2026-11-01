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
.site-root :is([data-w="video"],[data-w="map"],[data-w="prose"],[data-w="countdown"])[data-empty]{min-height:120px;background:repeating-linear-gradient(135deg,rgba(0,0,0,.04) 0 12px,rgba(0,0,0,.08) 12px 24px)}
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
.site-root [data-sr]{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.site-root [data-w="accordion"] details{border:1px solid var(--color-border,rgba(0,0,0,.12));border-radius:var(--radius-md,10px);background:var(--color-surface,transparent)}
.site-root [data-w="accordion"] summary{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:1rem 1.25rem;cursor:pointer;list-style:none}
.site-root [data-w="accordion"] summary::-webkit-details-marker{display:none}
.site-root [data-w="accordion"] summary>:first-child{margin:0;font-size:1.05rem;font-family:var(--font-heading,inherit);font-weight:600}
.site-root [data-w="accordion"] summary:focus-visible{outline:2px solid var(--color-primary,currentColor);outline-offset:2px;border-radius:inherit}
.site-root [data-acc-marker]{flex:none;width:.6rem;height:.6rem;border-right:2px solid currentColor;border-bottom:2px solid currentColor;transform:rotate(45deg) translate(-2px,-2px);transition:transform .2s ease;opacity:.6}
.site-root [data-w="accordion"] details[open] [data-acc-marker]{transform:rotate(-135deg) translate(-2px,-2px)}
.site-root [data-w="accordion"][data-marker="plus"] [data-acc-marker]{position:relative;width:.85rem;height:.85rem;border:0;transform:none}
.site-root [data-w="accordion"][data-marker="plus"] [data-acc-marker]::before,.site-root [data-w="accordion"][data-marker="plus"] [data-acc-marker]::after{content:"";position:absolute;left:0;right:0;top:50%;height:2px;margin-top:-1px;background:currentColor;transition:transform .2s ease}
.site-root [data-w="accordion"][data-marker="plus"] [data-acc-marker]::after{transform:rotate(90deg)}
.site-root [data-w="accordion"][data-marker="plus"] details[open] [data-acc-marker]::after{transform:rotate(0)}
.site-root [data-acc-body]{padding:0 1.25rem 1.15rem;line-height:1.65;color:var(--color-muted,inherit);white-space:pre-line}
.site-root [data-w="tabs"]{display:flex;flex-direction:column;gap:1.25rem}
.site-root [data-w="tabs"][data-orientation="vertical"]{flex-direction:row;align-items:flex-start}
.site-root [data-tablist]{display:flex;flex-wrap:wrap;gap:.25rem;border-bottom:1px solid var(--color-border,rgba(0,0,0,.12))}
.site-root [data-orientation="vertical"] [data-tablist]{flex-direction:column;flex:0 0 13rem;border-bottom:0;border-right:1px solid var(--color-border,rgba(0,0,0,.12))}
.site-root [data-tab] input{position:absolute;opacity:0;pointer-events:none}
.site-root [data-tab] label{display:block;padding:.65rem 1rem;cursor:pointer;opacity:.65;border-bottom:2px solid transparent;margin-bottom:-1px;transition:opacity .15s ease,border-color .15s ease,background .15s ease}
.site-root [data-orientation="vertical"] [data-tab] label{border-bottom:0;border-right:2px solid transparent;margin:0 -1px 0 0}
.site-root [data-tab] input:checked+label{opacity:1;border-color:var(--color-primary,currentColor);font-weight:600}
.site-root [data-tab] input:focus-visible+label{outline:2px solid var(--color-primary,currentColor);outline-offset:2px}
.site-root [data-look="pills"] [data-tablist],.site-root [data-look="boxed"] [data-tablist]{border:0}
.site-root [data-look="pills"] [data-tab] label{border:0;border-radius:999px}
.site-root [data-look="pills"] [data-tab] input:checked+label{background:var(--color-primary,#111);color:var(--color-inverse,#fff)}
.site-root [data-look="boxed"] [data-tab] label{border:1px solid var(--color-border,rgba(0,0,0,.12));border-radius:var(--radius-sm,6px)}
.site-root [data-look="boxed"] [data-tab] input:checked+label{background:var(--color-surface,rgba(0,0,0,.04))}
.site-root [data-tab-panels]{flex:1;min-width:0}
.site-root [data-tab-panel]{display:none;line-height:1.65}
.site-root [data-tab-panel]>h3{margin:0 0 .5rem;font-size:1.3rem}
.site-root [data-tab-panel]>p{white-space:pre-line;color:var(--color-muted,inherit)}
.site-root [data-w="tabs"]:has([data-tab]:nth-child(1) input:checked) [data-tab-panel]:nth-child(1){display:block}.site-root [data-w="tabs"]:has([data-tab]:nth-child(2) input:checked) [data-tab-panel]:nth-child(2){display:block}.site-root [data-w="tabs"]:has([data-tab]:nth-child(3) input:checked) [data-tab-panel]:nth-child(3){display:block}.site-root [data-w="tabs"]:has([data-tab]:nth-child(4) input:checked) [data-tab-panel]:nth-child(4){display:block}.site-root [data-w="tabs"]:has([data-tab]:nth-child(5) input:checked) [data-tab-panel]:nth-child(5){display:block}.site-root [data-w="tabs"]:has([data-tab]:nth-child(6) input:checked) [data-tab-panel]:nth-child(6){display:block}.site-root [data-w="tabs"]:has([data-tab]:nth-child(7) input:checked) [data-tab-panel]:nth-child(7){display:block}.site-root [data-w="tabs"]:has([data-tab]:nth-child(8) input:checked) [data-tab-panel]:nth-child(8){display:block}.site-root [data-w="tabs"]:has([data-tab]:nth-child(9) input:checked) [data-tab-panel]:nth-child(9){display:block}.site-root [data-w="tabs"]:has([data-tab]:nth-child(10) input:checked) [data-tab-panel]:nth-child(10){display:block}.site-root [data-w="tabs"]:has([data-tab]:nth-child(11) input:checked) [data-tab-panel]:nth-child(11){display:block}.site-root [data-w="tabs"]:has([data-tab]:nth-child(12) input:checked) [data-tab-panel]:nth-child(12){display:block}
@container site (max-width:767px){.site-root [data-w="tabs"][data-orientation="vertical"]{flex-direction:column}.site-root [data-orientation="vertical"] [data-tablist]{flex:none;flex-direction:row;border-right:0;border-bottom:1px solid var(--color-border,rgba(0,0,0,.12))}}
.site-root [data-w="carousel"]{position:relative;overflow:hidden}
.site-root [data-track]{display:grid;grid-auto-flow:column;grid-auto-columns:calc((100% - (var(--wb-per,1) - 1) * var(--space-sm,1rem)) / var(--wb-per,1));gap:var(--space-sm,1rem);overflow-x:auto;scroll-snap-type:x mandatory;scroll-behavior:smooth;scrollbar-width:none;overscroll-behavior-x:contain}
.site-root [data-track]::-webkit-scrollbar{display:none}
.site-root [data-track]:focus-visible{outline:2px solid var(--color-primary,currentColor);outline-offset:2px}
@container site (max-width:767px){.site-root [data-track]{grid-auto-columns:100%}}
.site-root [data-slide]{position:relative;scroll-snap-align:start;overflow:hidden;border-radius:inherit;display:flex;flex-direction:column}
.site-root [data-slide-media]{aspect-ratio:var(--wb-aspect,16/7);overflow:hidden;border-radius:inherit;background:repeating-linear-gradient(135deg,rgba(0,0,0,.04) 0 12px,rgba(0,0,0,.08) 12px 24px)}
.site-root [data-slide-media]:has(img){background:none}
.site-root [data-slide-media] img{display:block;width:100%;height:100%;object-fit:cover}
.site-root [data-text="overlay"] [data-slide-text]{position:absolute;inset:auto 0 0 0;padding:clamp(1.25rem,4cqi,3rem);color:#fff;background:linear-gradient(transparent,rgba(0,0,0,.6))}
.site-root [data-text="below"] [data-slide-text]{padding:1rem 0}
.site-root [data-slide-text]{display:flex;flex-direction:column;align-items:flex-start;gap:.5rem}
.site-root [data-slide-text] h3{margin:0;color:inherit;font-size:clamp(1.25rem,3cqi,2.4rem)}
.site-root [data-slide-text] p{margin:0;opacity:.9;max-width:52ch}
.site-root [data-slide-link]{display:inline-flex;margin-top:.25rem;padding:.6rem 1.1rem;border-radius:var(--radius-pill,999px);background:var(--color-primary,#fff);color:var(--color-inverse,#111);text-decoration:none;font-weight:500}
.site-root [data-w="carousel"] :is([data-prev],[data-next]){position:absolute;top:50%;transform:translateY(-50%);display:grid;place-items:center;width:2.75rem;height:2.75rem;border:0;border-radius:999px;background:rgba(255,255,255,.9);color:#111;box-shadow:0 4px 14px rgba(0,0,0,.15);cursor:pointer;font-size:1.25rem}
.site-root [data-w="carousel"] [data-prev]{left:.75rem}
.site-root [data-w="carousel"] [data-next]{right:.75rem}
.site-root [data-w="carousel"] :is([data-prev],[data-next]):disabled{opacity:.35;cursor:default}
.site-root [data-dots]{display:flex;justify-content:center;gap:.5rem;padding:.85rem 0 .25rem}
.site-root [data-dots] button{width:.6rem;height:.6rem;padding:0;border:0;border-radius:999px;background:currentColor;opacity:.25;cursor:pointer;transition:opacity .2s ease,width .2s ease}
.site-root [data-dots] button[aria-current="true"]{opacity:.85;width:1.5rem}
.site-root [data-w="carousel"]:not([data-ready]) :is([data-prev],[data-next],[data-dots]){display:none}
.site-root [data-w="testimonial"]{display:flex;flex-direction:column;gap:1rem;margin:0}
.site-root [data-w="testimonial"][data-layout="centered"]{align-items:center;text-align:center}
.site-root [data-w="testimonial"] blockquote{margin:0}
.site-root [data-w="testimonial"] blockquote p{font-size:1.15rem;line-height:1.6;white-space:pre-line}
.site-root [data-w="testimonial"][data-layout="minimal"] blockquote p{font-family:var(--font-display,inherit);font-size:clamp(1.3rem,2.5cqi,1.9rem);line-height:1.35}
.site-root [data-cite]{display:flex;align-items:center;gap:.75rem}
.site-root [data-cite] img{width:3rem;height:3rem;border-radius:999px;object-fit:cover}
.site-root [data-cite]>span{display:flex;flex-direction:column;line-height:1.3}
.site-root [data-cite]>span>span{font-size:.9rem;opacity:.7}
.site-root [data-stars]{display:inline-flex;gap:.15rem;font-size:1.1rem;color:#f5a524}
.site-root [data-stars] svg:not([data-on]){opacity:.22}
.site-root [data-w="pricing"]{position:relative;display:flex;flex-direction:column;gap:1rem;transition:transform .25s ease,box-shadow .25s ease}
.site-root [data-w="pricing"][data-featured]{border-color:var(--wb-accent,currentColor);box-shadow:0 0 0 2px var(--wb-accent,currentColor),0 24px 60px -20px color-mix(in srgb,var(--wb-accent,#000) 45%,transparent)}
@media (hover:hover){.site-root [data-w="pricing"]:hover{transform:translateY(-4px)}}
.site-root [data-ribbon]{position:absolute;top:1rem;right:1rem;padding:.25rem .7rem;border-radius:999px;background:var(--wb-accent,#111);color:var(--color-inverse,#fff);font-size:.75rem;font-weight:600;letter-spacing:.02em}
.site-root [data-plan]{margin:0;font-size:1.1rem;text-transform:uppercase;letter-spacing:.08em;opacity:.8}
.site-root [data-plan-price]{display:flex;align-items:baseline;flex-wrap:wrap;gap:.35rem;margin:0}
.site-root [data-plan-price] strong{font-family:var(--font-display,inherit);font-size:clamp(2.2rem,4cqi,3.2rem);line-height:1}
.site-root [data-plan-price] span{opacity:.65}
.site-root [data-plan-price] s{opacity:.45}
.site-root [data-plan-desc]{color:var(--color-muted,inherit);line-height:1.55}
.site-root [data-features]{display:flex;flex-direction:column;gap:.6rem;margin:0;padding:0;list-style:none}
.site-root [data-features] li{display:flex;align-items:flex-start;gap:.6rem}
.site-root [data-features] svg{flex:none;margin-top:.2em;color:var(--wb-accent,currentColor)}
.site-root [data-features] [data-excluded]{opacity:.45}
.site-root [data-features] [data-excluded] svg{color:currentColor}
.site-root [data-plan-cta]{margin-top:auto;display:flex;justify-content:center;padding:.85rem 1.2rem;border-radius:var(--radius-pill,999px);border:1.5px solid var(--wb-accent,currentColor);color:var(--wb-accent,currentColor);text-decoration:none;font-weight:600;transition:background .2s ease,color .2s ease}
.site-root [data-featured] [data-plan-cta],.site-root [data-plan-cta]:hover{background:var(--wb-accent,#111);color:var(--color-inverse,#fff)}
.site-root [data-w="countdown"]{display:flex;flex-wrap:wrap;align-items:stretch;justify-content:center}
.site-root [data-cd-unit]{display:flex;flex-direction:column;align-items:center;min-width:4.5rem}
.site-root [data-look="boxes"] [data-cd-unit]{padding:1rem .75rem;border-radius:var(--radius-md,10px);background:var(--color-surface,rgba(0,0,0,.05))}
.site-root [data-cd-num]{font-family:var(--font-display,inherit);font-size:clamp(2rem,5cqi,3.5rem);line-height:1;font-variant-numeric:tabular-nums}
.site-root [data-cd-label]{margin-top:.4rem;font-size:.75rem;letter-spacing:.08em;text-transform:uppercase;opacity:.65}
.site-root [data-w="countdown"]:not([data-ready]) [data-cd-unit],.site-root [data-w="countdown"][data-ready] [data-cd-fallback],.site-root [data-w="countdown"]:not([data-done]) [data-cd-done],.site-root [data-w="countdown"][data-done] [data-cd-unit]{display:none}
.site-root [data-w="countdown"][data-done][data-on-done="zero"] [data-cd-unit]{display:flex}
.site-root [data-w="countdown"][data-done][data-on-done="zero"] [data-cd-done],.site-root [data-w="countdown"][data-done][data-on-done="hide"]{display:none}
.site-root [data-cd-fallback],.site-root [data-cd-done]{margin:0;font-size:1.1rem}
.site-root [data-w="flipbox"]{position:relative;perspective:1200px;outline:none}
.site-root [data-flip-inner]{position:relative;width:100%;height:100%;min-height:inherit;transition:transform .7s cubic-bezier(.2,.7,.2,1);transform-style:preserve-3d;border-radius:inherit}
.site-root [data-w="flipbox"]:is(:hover,:focus-within) [data-flip-inner]{transform:rotateY(180deg)}
.site-root [data-w="flipbox"][data-dir="vertical"]:is(:hover,:focus-within) [data-flip-inner]{transform:rotateX(180deg)}
.site-root :is([data-flip-front],[data-flip-back]){position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.6rem;padding:1.75rem;text-align:center;border-radius:inherit;backface-visibility:hidden;-webkit-backface-visibility:hidden;overflow:hidden}
.site-root [data-flip-back]{transform:rotateY(180deg)}
.site-root [data-dir="vertical"] [data-flip-back]{transform:rotateX(180deg)}
.site-root :is([data-flip-front],[data-flip-back]) h3{margin:0;font-size:1.3rem;color:inherit}
.site-root :is([data-flip-front],[data-flip-back]) p{margin:0;line-height:1.55;opacity:.85}
.site-root [data-flip-link]{margin-top:.4rem;padding:.55rem 1.1rem;border:1.5px solid currentColor;border-radius:999px;color:inherit;text-decoration:none;font-weight:500}
.site-root [data-w="flipbox"]:focus-visible{outline:2px solid var(--color-primary,currentColor);outline-offset:3px}
.site-root [data-w="cta"]{position:relative;isolation:isolate;overflow:hidden;display:flex;flex-direction:column;gap:2rem}
.site-root [data-w="cta"][data-align="center"]{align-items:center;text-align:center}
.site-root [data-w="cta"][data-layout="overlay"]>[data-cta-media]{position:absolute;inset:0;z-index:-2}
.site-root [data-w="cta"] [data-cta-media] img{display:block;width:100%;height:100%;object-fit:cover}
.site-root [data-cta-overlay]{position:absolute;inset:0;z-index:-1}
.site-root [data-w="cta"][data-layout="split"][data-has-image]{display:grid;grid-template-columns:1fr 1fr;align-items:center;text-align:left}
.site-root [data-w="cta"][data-layout="split"] [data-cta-media]{border-radius:var(--radius-md,10px);overflow:hidden;aspect-ratio:4/3}
@container site (max-width:767px){.site-root [data-w="cta"][data-layout="split"][data-has-image]{grid-template-columns:1fr}}
.site-root [data-cta-body]{display:flex;flex-direction:column;gap:1rem;align-items:inherit;max-width:44rem}
.site-root [data-cta-body] h2{margin:0;color:inherit;font-size:var(--text-h2,2.2rem)}
.site-root [data-cta-body] p{margin:0;font-size:1.1rem;line-height:1.6;opacity:.85}
.site-root [data-cta-actions]{display:flex;flex-wrap:wrap;gap:.75rem;justify-content:inherit}
.site-root [data-w="cta"][data-align="center"] [data-cta-actions]{justify-content:center}
.site-root [data-cta-button]{display:inline-flex;padding:.85rem 1.4rem;border-radius:var(--radius-pill,999px);text-decoration:none;font-weight:600;transition:transform .2s ease}
.site-root [data-cta-button]:hover{transform:translateY(-2px)}
.site-root [data-cta-button="primary"]{background:var(--color-primary,#fff);color:var(--color-inverse,#111)}
.site-root [data-cta-button="secondary"]{border:1.5px solid currentColor;color:inherit}
.site-root [data-progress-head]{display:flex;justify-content:space-between;gap:1rem;margin-bottom:.45rem;font-size:.95rem}
.site-root [data-progress-value]{font-variant-numeric:tabular-nums;opacity:.75}
.site-root [data-progress-track]{height:var(--wb-h,10px);border-radius:999px;background:var(--wb-track,color-mix(in srgb,currentColor 12%,transparent));overflow:hidden}
.site-root [data-progress-fill]{display:block;height:100%;border-radius:inherit;background:var(--wb-bar,var(--color-primary,currentColor))}
@supports (animation-timeline:view()){.site-root [data-animate] [data-progress-fill]{animation:wb-grow linear both;animation-timeline:view();animation-range:entry 10% cover 35%}}
@keyframes wb-grow{from{transform:scaleX(0);transform-origin:left}to{transform:scaleX(1);transform-origin:left}}
.site-root [data-counter-number]{margin:0;font-family:var(--font-display,inherit);font-size:clamp(2.4rem,6cqi,4rem);line-height:1;font-variant-numeric:tabular-nums}
.site-root [data-counter-label]{margin:.5rem 0 0;opacity:.7}
.site-root [data-w="nav"]{position:relative;display:flex;align-items:center}
.site-root [data-w="nav"][data-align="start"]{justify-content:flex-start}.site-root [data-w="nav"][data-align="center"]{justify-content:center}.site-root [data-w="nav"][data-align="end"]{justify-content:flex-end}
.site-root [data-nav-toggle],.site-root [data-nav-button],.site-root [data-nav-backdrop]{display:none}
.site-root [data-nav-backdrop]{position:fixed;inset:0;z-index:999;background:rgba(10,10,12,.35)}
.site-root [data-nav-list]{display:flex;flex-wrap:wrap;align-items:center;gap:.25rem var(--wb-gap,24px);margin:0;padding:0;list-style:none}
.site-root [data-w="nav"][data-align="center"] [data-nav-list]{justify-content:center}.site-root [data-w="nav"][data-align="end"] [data-nav-list]{justify-content:flex-end}
.site-root [data-nav-list] li{position:relative}
.site-root [data-nav-list] a{display:inline-block;padding:.35rem 0;color:inherit;text-decoration:none;transition:color .15s}
.site-root [data-nav-list] a:hover{color:var(--wb-accent,var(--color-primary,currentColor))}
.site-root [data-look="underline"] [data-nav-list]>li>a[aria-current="page"]{text-decoration:underline;text-decoration-thickness:2px;text-underline-offset:.45em;text-decoration-color:var(--wb-accent,var(--color-primary,currentColor))}
.site-root [data-look="pill"] [data-nav-list]>li>a{padding:.4rem .85rem;border-radius:999px}
.site-root [data-look="pill"] [data-nav-list]>li>a[aria-current="page"]{background:color-mix(in srgb,var(--wb-accent,var(--color-primary,#111)) 14%,transparent)}
.site-root [data-has-sub]>a::after{content:"";display:inline-block;width:.38em;height:.38em;margin:0 0 .2em .45em;border-right:1.5px solid;border-bottom:1.5px solid;transform:rotate(45deg)}
.site-root [data-nav-sub]{position:absolute;top:100%;left:-.75rem;z-index:40;min-width:13rem;margin:0;padding:.4rem;list-style:none;border-radius:var(--radius-md,10px);background:var(--color-background,#fff);color:var(--color-text,#111);box-shadow:0 14px 40px rgba(0,0,0,.14);opacity:0;visibility:hidden;transform:translateY(4px);transition:opacity .15s,transform .15s,visibility .15s}
.site-root [data-has-sub]:hover>[data-nav-sub],.site-root [data-has-sub]:focus-within>[data-nav-sub]{opacity:1;visibility:visible;transform:none}
.site-root [data-nav-sub] a{display:block;padding:.5rem .75rem;border-radius:6px}
.site-root [data-nav-sub] a:hover{background:color-mix(in srgb,currentColor 6%,transparent)}
.site-root [data-w="nav"][data-drawer="always"] [data-nav-toggle]{display:block;position:absolute;width:44px;height:44px;margin:0;opacity:0;cursor:pointer;z-index:1002}.site-root [data-w="nav"][data-drawer="always"] [data-nav-button]{display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:10px;position:relative;z-index:1001;cursor:pointer}.site-root [data-w="nav"][data-drawer="always"] [data-nav-toggle]:focus-visible+[data-nav-button]{outline:2px solid var(--wb-accent,var(--color-primary,currentColor));outline-offset:2px}.site-root [data-w="nav"][data-drawer="always"] [data-nav-button] svg:last-child{display:none}.site-root [data-w="nav"][data-drawer="always"] [data-nav-toggle]:checked+[data-nav-button] svg:first-child{display:none}.site-root [data-w="nav"][data-drawer="always"] [data-nav-toggle]:checked+[data-nav-button] svg:last-child{display:block}.site-root [data-w="nav"][data-drawer="always"]:not([data-side="top"]) [data-nav-toggle]:checked+[data-nav-button]{position:fixed;top:1rem;right:1rem;color:var(--color-text,#111)}.site-root [data-w="nav"][data-drawer="always"][data-side="left"] [data-nav-toggle]:checked+[data-nav-button]{right:auto;left:calc(min(20rem,85vw) - 3.75rem)}.site-root [data-w="nav"][data-drawer="always"]:not([data-side="top"]) [data-nav-toggle]:checked{position:fixed;top:1rem;right:1rem}.site-root [data-w="nav"][data-drawer="always"][data-side="left"] [data-nav-toggle]:checked{right:auto;left:calc(min(20rem,85vw) - 3.75rem)}.site-root [data-w="nav"][data-drawer="always"] [data-nav-list]{position:fixed;top:0;right:0;bottom:0;z-index:1000;width:min(20rem,85vw);flex-direction:column;flex-wrap:nowrap;align-items:stretch;justify-content:flex-start;gap:0;padding:4.75rem 1.25rem 2rem;overflow-y:auto;background:var(--wb-drawer-bg,var(--color-background,#fff));color:var(--color-text,#111);box-shadow:-20px 0 60px rgba(0,0,0,.18);transform:translateX(105%);visibility:hidden;transition:transform .28s ease,visibility .28s}.site-root [data-w="nav"][data-drawer="always"][data-side="left"] [data-nav-list]{right:auto;left:0;transform:translateX(-105%);box-shadow:20px 0 60px rgba(0,0,0,.18)}.site-root [data-w="nav"][data-drawer="always"][data-side="top"] [data-nav-list]{position:absolute;top:calc(100% + .5rem);left:0;right:0;bottom:auto;width:auto;min-width:16rem;padding:.75rem 1rem;border-radius:var(--radius-md,10px);transform:translateY(-6px);opacity:0;transition:opacity .2s,transform .2s,visibility .2s}.site-root [data-w="nav"][data-drawer="always"] [data-nav-toggle]:checked~[data-nav-list]{transform:none;visibility:visible;opacity:1}.site-root [data-w="nav"][data-drawer="always"] [data-nav-toggle]:checked~[data-nav-backdrop]{display:block}.site-root [data-w="nav"][data-drawer="always"] [data-nav-list] a{display:block;padding:.8rem .25rem;border-bottom:1px solid color-mix(in srgb,currentColor 10%,transparent)}.site-root [data-w="nav"][data-drawer="always"] [data-nav-list] a[aria-current="page"]{background:none;text-decoration:none;color:var(--wb-accent,var(--color-primary,currentColor));font-weight:600}.site-root [data-w="nav"][data-drawer="always"] [data-nav-sub]{position:static;min-width:0;padding:0 0 0 1rem;margin:0;background:none;box-shadow:none;opacity:1;visibility:visible;transform:none}.site-root [data-w="nav"][data-drawer="always"] [data-has-sub]>a::after{display:none}
@container site (max-width:1024px){.site-root [data-w="nav"][data-drawer="tablet"] [data-nav-toggle]{display:block;position:absolute;width:44px;height:44px;margin:0;opacity:0;cursor:pointer;z-index:1002}.site-root [data-w="nav"][data-drawer="tablet"] [data-nav-button]{display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:10px;position:relative;z-index:1001;cursor:pointer}.site-root [data-w="nav"][data-drawer="tablet"] [data-nav-toggle]:focus-visible+[data-nav-button]{outline:2px solid var(--wb-accent,var(--color-primary,currentColor));outline-offset:2px}.site-root [data-w="nav"][data-drawer="tablet"] [data-nav-button] svg:last-child{display:none}.site-root [data-w="nav"][data-drawer="tablet"] [data-nav-toggle]:checked+[data-nav-button] svg:first-child{display:none}.site-root [data-w="nav"][data-drawer="tablet"] [data-nav-toggle]:checked+[data-nav-button] svg:last-child{display:block}.site-root [data-w="nav"][data-drawer="tablet"]:not([data-side="top"]) [data-nav-toggle]:checked+[data-nav-button]{position:fixed;top:1rem;right:1rem;color:var(--color-text,#111)}.site-root [data-w="nav"][data-drawer="tablet"][data-side="left"] [data-nav-toggle]:checked+[data-nav-button]{right:auto;left:calc(min(20rem,85vw) - 3.75rem)}.site-root [data-w="nav"][data-drawer="tablet"]:not([data-side="top"]) [data-nav-toggle]:checked{position:fixed;top:1rem;right:1rem}.site-root [data-w="nav"][data-drawer="tablet"][data-side="left"] [data-nav-toggle]:checked{right:auto;left:calc(min(20rem,85vw) - 3.75rem)}.site-root [data-w="nav"][data-drawer="tablet"] [data-nav-list]{position:fixed;top:0;right:0;bottom:0;z-index:1000;width:min(20rem,85vw);flex-direction:column;flex-wrap:nowrap;align-items:stretch;justify-content:flex-start;gap:0;padding:4.75rem 1.25rem 2rem;overflow-y:auto;background:var(--wb-drawer-bg,var(--color-background,#fff));color:var(--color-text,#111);box-shadow:-20px 0 60px rgba(0,0,0,.18);transform:translateX(105%);visibility:hidden;transition:transform .28s ease,visibility .28s}.site-root [data-w="nav"][data-drawer="tablet"][data-side="left"] [data-nav-list]{right:auto;left:0;transform:translateX(-105%);box-shadow:20px 0 60px rgba(0,0,0,.18)}.site-root [data-w="nav"][data-drawer="tablet"][data-side="top"] [data-nav-list]{position:absolute;top:calc(100% + .5rem);left:0;right:0;bottom:auto;width:auto;min-width:16rem;padding:.75rem 1rem;border-radius:var(--radius-md,10px);transform:translateY(-6px);opacity:0;transition:opacity .2s,transform .2s,visibility .2s}.site-root [data-w="nav"][data-drawer="tablet"] [data-nav-toggle]:checked~[data-nav-list]{transform:none;visibility:visible;opacity:1}.site-root [data-w="nav"][data-drawer="tablet"] [data-nav-toggle]:checked~[data-nav-backdrop]{display:block}.site-root [data-w="nav"][data-drawer="tablet"] [data-nav-list] a{display:block;padding:.8rem .25rem;border-bottom:1px solid color-mix(in srgb,currentColor 10%,transparent)}.site-root [data-w="nav"][data-drawer="tablet"] [data-nav-list] a[aria-current="page"]{background:none;text-decoration:none;color:var(--wb-accent,var(--color-primary,currentColor));font-weight:600}.site-root [data-w="nav"][data-drawer="tablet"] [data-nav-sub]{position:static;min-width:0;padding:0 0 0 1rem;margin:0;background:none;box-shadow:none;opacity:1;visibility:visible;transform:none}.site-root [data-w="nav"][data-drawer="tablet"] [data-has-sub]>a::after{display:none}}
@container site (max-width:767px){.site-root [data-w="nav"][data-drawer="mobile"] [data-nav-toggle]{display:block;position:absolute;width:44px;height:44px;margin:0;opacity:0;cursor:pointer;z-index:1002}.site-root [data-w="nav"][data-drawer="mobile"] [data-nav-button]{display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:10px;position:relative;z-index:1001;cursor:pointer}.site-root [data-w="nav"][data-drawer="mobile"] [data-nav-toggle]:focus-visible+[data-nav-button]{outline:2px solid var(--wb-accent,var(--color-primary,currentColor));outline-offset:2px}.site-root [data-w="nav"][data-drawer="mobile"] [data-nav-button] svg:last-child{display:none}.site-root [data-w="nav"][data-drawer="mobile"] [data-nav-toggle]:checked+[data-nav-button] svg:first-child{display:none}.site-root [data-w="nav"][data-drawer="mobile"] [data-nav-toggle]:checked+[data-nav-button] svg:last-child{display:block}.site-root [data-w="nav"][data-drawer="mobile"]:not([data-side="top"]) [data-nav-toggle]:checked+[data-nav-button]{position:fixed;top:1rem;right:1rem;color:var(--color-text,#111)}.site-root [data-w="nav"][data-drawer="mobile"][data-side="left"] [data-nav-toggle]:checked+[data-nav-button]{right:auto;left:calc(min(20rem,85vw) - 3.75rem)}.site-root [data-w="nav"][data-drawer="mobile"]:not([data-side="top"]) [data-nav-toggle]:checked{position:fixed;top:1rem;right:1rem}.site-root [data-w="nav"][data-drawer="mobile"][data-side="left"] [data-nav-toggle]:checked{right:auto;left:calc(min(20rem,85vw) - 3.75rem)}.site-root [data-w="nav"][data-drawer="mobile"] [data-nav-list]{position:fixed;top:0;right:0;bottom:0;z-index:1000;width:min(20rem,85vw);flex-direction:column;flex-wrap:nowrap;align-items:stretch;justify-content:flex-start;gap:0;padding:4.75rem 1.25rem 2rem;overflow-y:auto;background:var(--wb-drawer-bg,var(--color-background,#fff));color:var(--color-text,#111);box-shadow:-20px 0 60px rgba(0,0,0,.18);transform:translateX(105%);visibility:hidden;transition:transform .28s ease,visibility .28s}.site-root [data-w="nav"][data-drawer="mobile"][data-side="left"] [data-nav-list]{right:auto;left:0;transform:translateX(-105%);box-shadow:20px 0 60px rgba(0,0,0,.18)}.site-root [data-w="nav"][data-drawer="mobile"][data-side="top"] [data-nav-list]{position:absolute;top:calc(100% + .5rem);left:0;right:0;bottom:auto;width:auto;min-width:16rem;padding:.75rem 1rem;border-radius:var(--radius-md,10px);transform:translateY(-6px);opacity:0;transition:opacity .2s,transform .2s,visibility .2s}.site-root [data-w="nav"][data-drawer="mobile"] [data-nav-toggle]:checked~[data-nav-list]{transform:none;visibility:visible;opacity:1}.site-root [data-w="nav"][data-drawer="mobile"] [data-nav-toggle]:checked~[data-nav-backdrop]{display:block}.site-root [data-w="nav"][data-drawer="mobile"] [data-nav-list] a{display:block;padding:.8rem .25rem;border-bottom:1px solid color-mix(in srgb,currentColor 10%,transparent)}.site-root [data-w="nav"][data-drawer="mobile"] [data-nav-list] a[aria-current="page"]{background:none;text-decoration:none;color:var(--wb-accent,var(--color-primary,currentColor));font-weight:600}.site-root [data-w="nav"][data-drawer="mobile"] [data-nav-sub]{position:static;min-width:0;padding:0 0 0 1rem;margin:0;background:none;box-shadow:none;opacity:1;visibility:visible;transform:none}.site-root [data-w="nav"][data-drawer="mobile"] [data-has-sub]>a::after{display:none}}
@media (prefers-reduced-motion:reduce){.site-root [data-nav-list],.site-root [data-nav-sub]{transition:none}}
.site-root [data-w="breadcrumbs"] ol{display:flex;flex-wrap:wrap;align-items:center;gap:.35rem;margin:0;padding:0;list-style:none}
.site-root [data-w="breadcrumbs"] li+li::before{content:"›";margin-right:.35rem;opacity:.5}
.site-root [data-w="breadcrumbs"][data-sep="slash"] li+li::before{content:"/"}.site-root [data-w="breadcrumbs"][data-sep="dot"] li+li::before{content:"·"}.site-root [data-w="breadcrumbs"][data-sep="arrow"] li+li::before{content:"→"}
.site-root [data-w="breadcrumbs"] a{color:inherit;opacity:.75;text-decoration:none}
.site-root [data-w="breadcrumbs"] a:hover{opacity:1;text-decoration:underline}
.site-root [data-w="breadcrumbs"] [aria-current]{font-weight:500}
.site-root [data-search]{display:flex;align-items:stretch;width:100%;border:1px solid color-mix(in srgb,currentColor 22%,transparent);border-radius:var(--radius-sm,8px);background:var(--color-background,#fff);overflow:hidden}
.site-root [data-w="search"][data-shape="pill"] [data-search]{border-radius:999px}
.site-root [data-search]:focus-within{outline:2px solid var(--color-primary,currentColor);outline-offset:1px}
.site-root [data-search] input{flex:1;min-width:0;padding:.65rem 1rem;border:0;background:transparent;color:var(--color-text,inherit);font:inherit;outline:none}
.site-root [data-search] input::-webkit-search-cancel-button{cursor:pointer}
.site-root [data-search] button{display:inline-flex;align-items:center;justify-content:center;gap:.4rem;padding:0 1rem;border:0;background:var(--color-primary,#111);color:var(--color-inverse,#fff);font:inherit;font-weight:500;cursor:pointer}
.site-root [data-w="social"] ul{display:flex;flex-wrap:wrap;align-items:center;gap:.6rem;margin:0;padding:0;list-style:none}
.site-root [data-w="social"] a{display:inline-flex;align-items:center;justify-content:center;gap:.45rem;font-size:var(--wb-icon,18px);color:inherit;text-decoration:none;line-height:1;transition:transform .15s,opacity .15s,background .15s}
.site-root [data-w="social"] a span{font-size:.9rem}
.site-root [data-w="social"] a:hover{transform:translateY(-2px)}
.site-root [data-w="social"][data-colors="brand"] a{color:var(--wb-brand,currentColor)}
.site-root [data-w="social"]:is([data-shape="circle"],[data-shape="rounded"]) a{min-width:2.2em;height:2.2em;padding:0 .6em;border-radius:999px;background:color-mix(in srgb,var(--wb-brand,currentColor) 12%,transparent)}
.site-root [data-w="social"][data-shape="rounded"] a{border-radius:.5em}
.site-root [data-w="social"][data-colors="brand"]:is([data-shape="circle"],[data-shape="rounded"]) a{background:var(--wb-brand,currentColor);color:#fff}
.site-root [data-w="social"][data-colors="brand"]:is([data-shape="circle"],[data-shape="rounded"]) a[data-network="snapchat"]{color:#111}
.site-root [data-w="social"][data-empty]{min-height:2rem;min-width:8rem;background:repeating-linear-gradient(135deg,rgba(0,0,0,.03) 0 8px,rgba(0,0,0,.06) 8px 16px)}
.site-root [data-w="audio"]{display:flex;align-items:center;gap:1rem;margin:0;padding:1rem;border-radius:var(--radius-md,12px);background:color-mix(in srgb,currentColor 5%,transparent)}
.site-root [data-w="audio"][data-look="minimal"]{padding:0;background:none}
.site-root [data-audio-cover]{flex:none;width:96px;aspect-ratio:1;overflow:hidden;border-radius:var(--radius-sm,8px)}
.site-root [data-audio-cover] img{display:block;width:100%;height:100%;object-fit:cover}
.site-root [data-audio-body]{display:flex;flex-direction:column;gap:.5rem;flex:1;min-width:0}
.site-root [data-audio-meta]{display:flex;flex-direction:column;gap:.1rem}
.site-root [data-audio-meta] span{opacity:.7;font-size:.9rem}
.site-root [data-w="audio"] audio{width:100%}
.site-root [data-w="audio"][data-empty],.site-root [data-w="embed"][data-empty]{min-height:4rem;background:repeating-linear-gradient(135deg,rgba(0,0,0,.03) 0 8px,rgba(0,0,0,.06) 8px 16px)}
.site-root [data-w="embed"] iframe{display:block;width:100%;border:0}
.site-root [data-hp]{position:absolute!important;left:-9999px;width:1px;height:1px;overflow:hidden}
.site-root [data-sr]{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.site-root [data-wb-form]{margin:0}
.site-root [data-form-body]{display:flex;flex-wrap:wrap;gap:1rem;min-width:0;margin:0;padding:0;border:0}
.site-root [data-field]{display:flex;flex-direction:column;gap:.35rem;flex:1 1 100%;min-width:0;margin:0;padding:0;border:0}
.site-root [data-field][data-width="half"]{flex:1 1 calc(50% - .5rem);min-width:min(100%,14rem)}
.site-root [data-field-label]{padding:0;font-size:.9rem;font-weight:500}
.site-root [data-labels="hidden"] [data-field]:not([data-type="checkbox"]):not([data-type="radio"]):not([data-type="rating"]) [data-field-label]{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}
.site-root [data-req]{color:var(--wb-accent,var(--color-primary,currentColor))}
.site-root [data-wb-form] input:not([type="checkbox"]):not([type="radio"]),.site-root [data-wb-form] select,.site-root [data-wb-form] textarea{width:100%;min-width:0;padding:.7rem .85rem;border:1px solid color-mix(in srgb,currentColor 22%,transparent);border-radius:var(--radius-sm,6px);background:var(--color-background,#fff);color:var(--color-text,inherit);font:inherit;line-height:1.4}
.site-root [data-wb-form] input[type="file"]{padding:.55rem}
.site-root [data-wb-form] textarea{resize:vertical;min-height:7rem}
.site-root [data-wb-form] :is(input,select,textarea):focus-visible{outline:2px solid var(--wb-accent,var(--color-primary,currentColor));outline-offset:1px;border-color:transparent}
.site-root [data-wb-form] [aria-invalid="true"]{border-color:#dc2626}
.site-root [data-field-error]{min-height:0;color:#b91c1c;font-size:.85rem}
.site-root [data-field-error]:empty{display:none}
.site-root [data-choices]{display:flex;flex-wrap:wrap;gap:.4rem 1.2rem}
.site-root [data-choices] label,.site-root [data-check]{display:inline-flex;align-items:flex-start;gap:.5rem;cursor:pointer}
.site-root [data-choices] input,.site-root [data-check] input{margin:.25rem 0 0;accent-color:var(--wb-accent,var(--color-primary,currentColor))}
.site-root [data-rate]{display:inline-flex;flex-direction:row-reverse;justify-content:flex-end;font-size:1.7rem;line-height:1;color:color-mix(in srgb,currentColor 25%,transparent)}
.site-root [data-rate] label{position:relative;cursor:pointer;padding:0 .08em}
.site-root [data-rate] input{position:absolute;opacity:0;width:1px;height:1px}
.site-root [data-rate] label:hover,.site-root [data-rate] label:hover~label,.site-root [data-rate] label:has(input:checked),.site-root [data-rate] label:has(input:checked)~label{color:#f59e0b}
.site-root [data-rate] label:has(input:focus-visible){outline:2px solid var(--wb-accent,var(--color-primary,currentColor));outline-offset:2px;border-radius:4px}
.site-root [data-form-actions]{flex:1 1 100%}
.site-root [data-wb-form] button[type="submit"]{display:inline-flex;align-items:center;justify-content:center;gap:.5rem;padding:.8rem 1.5rem;border:0;border-radius:var(--radius-pill,999px);background:var(--wb-accent,var(--color-primary,#111));color:var(--color-inverse,#fff);font:inherit;font-weight:600;cursor:pointer;transition:filter .15s}
.site-root [data-wb-form] button[type="submit"]:hover{filter:brightness(1.08)}
.site-root [data-wb-form] [aria-busy="true"] button[type="submit"]{opacity:.65;cursor:progress}
.site-root [data-button="full"] [data-form-actions] button{width:100%}
.site-root [data-form-status]{margin:.75rem 0 0;font-size:.95rem}
.site-root [data-form-status]:empty{display:none}
.site-root [data-form-status][data-tone="error"]{color:#b91c1c}
.site-root [data-form-success]{margin:0;padding:1rem 1.2rem;border-radius:var(--radius-md,8px);background:color-mix(in srgb,var(--wb-accent,var(--color-primary,#16a34a)) 12%,transparent);font-weight:500}
.site-root [data-wb-form][data-sent] [data-form-body],.site-root [data-wb-form][data-sent] [data-consent]{display:none}
.site-root [data-w="newsletter"] h3{margin:0 0 .4rem}
.site-root [data-nl-text]{margin:0 0 1rem;opacity:.8}
.site-root [data-nl-row]{display:flex;flex-wrap:wrap;gap:.6rem;width:100%}
.site-root [data-nl-row] input{flex:1 1 12rem}
.site-root [data-layout="stacked"] [data-nl-row]{flex-direction:column}
.site-root [data-layout="stacked"] [data-nl-row] input{flex:none}
.site-root [data-w="newsletter"] [data-form-body]{display:block}
.site-root [data-consent]{margin:.6rem 0 0;font-size:.82rem;opacity:.7}
.site-root [data-w="rating"]{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem}
.site-root [data-rating-stars]{position:relative;display:inline-flex;font-size:var(--wb-star-size,20px);line-height:1}
.site-root [data-rating-base]{display:inline-flex;color:color-mix(in srgb,currentColor 18%,transparent)}
.site-root [data-rating-fill]{position:absolute;inset:0 auto 0 0;display:inline-flex;overflow:hidden;white-space:nowrap;color:var(--wb-star,#f59e0b)}
.site-root [data-rating-fill] svg,.site-root [data-rating-base] svg{flex:none}
.site-root [data-rating-label]{opacity:.7}
@media (prefers-reduced-motion:reduce){.site-root [data-flip-inner]{transition:none}.site-root [data-track]{scroll-behavior:auto}.site-root [data-animate] [data-progress-fill]{animation:none}}
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
