/**
 * Static page compilation. A page is rendered by the live site's own
 * renderer (fetched from the app, so it's pixel-identical) and then turned
 * into a standalone file: the Next.js runtime scripts are dropped (published
 * pages ship no client JS), platform paths become root-relative, absolute
 * URLs point at the export's base URL, and every stylesheet, font, image and
 * icon it references is collected so it can be copied into the bundle.
 *
 * Pure string work, so it's unit-tested without a server.
 */

export interface CompileContext {
  /** Origin the page was fetched from, e.g. http://127.0.0.1:3000. */
  origin: string;
  /** The site's subdomain (its /sites/<key> prefix on the platform). */
  siteKey: string;
  /** Where the bundle will be hosted, without a trailing slash. */
  baseUrl: string;
}

/** Where a site path lives in the bundle: "/" → index.html, "/shop/lamp" → shop/lamp/index.html. */
export function outputPath(sitePath: string): string {
  const parts = sitePath.split("/").filter(Boolean);
  if (parts.some((p) => p === "." || p === ".." || /[\\\0]/.test(p))) throw new Error(`Unsafe path: ${sitePath}`);
  return parts.length ? `${parts.map(encodeSegment).join("/")}/index.html` : "index.html";
}

const encodeSegment = (s: string) => s.replace(/[^\w.~-]/g, (c) => encodeURIComponent(c));

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Static asset prefixes that are copied into the bundle, with the app path each is fetched from. */
const ASSET_REF = /(?:\/assets\/[^"'()\s,<>?#]+|\/uploads\/[^"'()\s,<>?#]+|\/favicon\.ico)/g;

/** Maps a bundle asset path back to the app URL path it's fetched from. */
export const assetSource = (bundlePath: string) => (bundlePath.startsWith("/assets/") ? `/_next/static/${bundlePath.slice("/assets/".length)}` : bundlePath);

export class IncompleteRender extends Error {}

export function compileHtml(html: string, ctx: CompileContext): { html: string; assets: Set<string> } {
  if (/<div hidden id="S:\d+"|<template id="B:\d+"/.test(html)) {
    // A streamed (unresolved) Suspense boundary: without the runtime script it would stay hidden.
    throw new IncompleteRender("The page was still streaming when it was captured");
  }
  const base = ctx.baseUrl.replace(/\/+$/, "");
  const sitePrefix = `/sites/${ctx.siteKey}`;
  const out = html
    // Runtime and RSC payload scripts; structured data stays.
    .replace(/<script\b(?![^>]*type="application\/ld\+json")[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<link\b[^>]*\bas="script"[^>]*\/?>/gi, "")
    .replace(/<link\b[^>]*rel="modulepreload"[^>]*\/?>/gi, "")
    .replace(/<meta name="next-size-adjust"[^>]*\/?>/gi, "")
    // Absolute URLs (canonical, og:url, og:image) move to the export's base URL.
    .replace(new RegExp(`${escapeRe(ctx.origin)}${escapeRe(sitePrefix)}(?=[/"'?#]|$)`, "g"), base)
    .replace(new RegExp(`${escapeRe(ctx.origin)}(?=/)`, "g"), base)
    // Platform paths become root-relative.
    .replace(new RegExp(`(["'(=,\\s])${escapeRe(sitePrefix)}(?=["'/?#)])`, "g"), "$1")
    .replace(/(href|src)="(?=["#?])/g, '$1="/')
    .replace(/\/_next\/static\//g, "/assets/")
    .replace(/(\/favicon\.ico)\?[^"']*/g, "$1");
  return { html: out, assets: collectAssets(out) };
}

/** Rewrites a stylesheet at `cssPath` (a bundle path) and collects what it loads, including relative url()s such as fonts. */
export function compileCss(css: string, cssPath: string): { css: string; assets: Set<string> } {
  const out = css.replace(/\/_next\/static\//g, "/assets/");
  const assets = collectAssets(out);
  for (const m of out.matchAll(/url\(\s*["']?(?![a-z]+:|\/|#)([^"')?#]+)/gi)) {
    const resolved = new URL(m[1], `http://x${cssPath}`).pathname;
    if (resolved.startsWith("/assets/")) assets.add(resolved);
  }
  return { css: out, assets };
}

function collectAssets(text: string) {
  const found = new Set<string>();
  for (const m of text.matchAll(ASSET_REF)) found.add(m[0]);
  return found;
}
