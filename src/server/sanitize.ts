import type { DOMPurify } from "dompurify";

/**
 * Server-side HTML and SVG sanitising. Everything a browser will later parse
 * as markup goes through here before it is stored: rich text from entry
 * forms and uploaded SVG files. DOMPurify works on a real DOM, so the result
 * is what a browser would see, not a regex guess.
 *
 * No `server-only` import: the seed and the unit tests use it directly.
 *
 * jsdom is heavy (~5 MB with its dependencies, and slow to load), and only
 * the few routes that save rich text or SVG need it, so it's loaded on first
 * use instead of when a function that merely imports this module boots.
 */
let purifier: Promise<DOMPurify> | null = null;

function getPurify(): Promise<DOMPurify> {
  purifier ??= (async () => {
    const [{ JSDOM }, { default: createDOMPurify }] = await Promise.all([import("jsdom"), import("dompurify")]);
    const { window } = new JSDOM("");
    const purify = createDOMPurify(window as unknown as Parameters<typeof createDOMPurify>[0]);
    // Links in rich text may only point to the same kinds of places a builder link can.
    purify.addHook("afterSanitizeAttributes", (node) => {
      if (node.tagName === "A") {
        const href = node.getAttribute("href") ?? "";
        if (!/^(https?:\/\/|\/(?!\/)|#|mailto:|tel:)/i.test(href)) node.removeAttribute("href");
        if (node.getAttribute("target") === "_blank") node.setAttribute("rel", "noopener noreferrer");
        else node.removeAttribute("target");
      }
    });
    return purify;
  })().catch((err) => {
    purifier = null; // let the next call retry
    throw err;
  });
  return purifier;
}

const RICH_TAGS = ["p", "br", "h2", "h3", "h4", "strong", "b", "em", "i", "u", "s", "a", "ul", "ol", "li", "blockquote", "code", "pre", "hr"];

export async function sanitizeRichText(html: string): Promise<string> {
  const purify = await getPurify();
  const clean = purify.sanitize(html, {
    ALLOWED_TAGS: RICH_TAGS,
    ALLOWED_ATTR: ["href", "target", "rel"],
    ALLOW_DATA_ATTR: false,
  });
  // Editors leave empty paragraphs behind; drop them so "required" means something.
  return clean.replace(/<p>(\s|&nbsp;|<br\s*\/?>)*<\/p>/g, "").trim();
}

/**
 * Uploaded SVGs: SVG profile only, no scripts, event handlers, foreignObject
 * or external references. The file is also served with a sandboxing CSP
 * (next.config.ts) as a second layer.
 */
export async function sanitizeSvg(svg: string): Promise<string | null> {
  const purify = await getPurify();
  const clean = purify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ["foreignObject", "script", "style", "image", "use", "a"],
    FORBID_ATTR: ["href", "xlink:href"],
  });
  return /^\s*<svg[\s>]/i.test(clean) ? clean : null;
}
