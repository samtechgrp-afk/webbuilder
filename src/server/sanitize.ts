import createDOMPurify from "dompurify";
import { JSDOM } from "jsdom";

/**
 * Server-side HTML and SVG sanitising. Everything a browser will later parse
 * as markup goes through here before it is stored: rich text from entry
 * forms and uploaded SVG files. DOMPurify works on a real DOM, so the result
 * is what a browser would see, not a regex guess.
 *
 * No `server-only` import: the seed and the unit tests use it directly.
 */
const { window } = new JSDOM("");
const purify = createDOMPurify(window as unknown as Parameters<typeof createDOMPurify>[0]);

const RICH_TAGS = ["p", "br", "h2", "h3", "h4", "strong", "b", "em", "i", "u", "s", "a", "ul", "ol", "li", "blockquote", "code", "pre", "hr"];

// Links in rich text may only point to the same kinds of places a builder link can.
purify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    const href = node.getAttribute("href") ?? "";
    if (!/^(https?:\/\/|\/(?!\/)|#|mailto:|tel:)/i.test(href)) node.removeAttribute("href");
    if (node.getAttribute("target") === "_blank") node.setAttribute("rel", "noopener noreferrer");
    else node.removeAttribute("target");
  }
});

export function sanitizeRichText(html: string): string {
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
export function sanitizeSvg(svg: string): string | null {
  const clean = purify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ["foreignObject", "script", "style", "image", "use", "a"],
    FORBID_ATTR: ["href", "xlink:href"],
  });
  return /^\s*<svg[\s>]/i.test(clean) ? clean : null;
}
