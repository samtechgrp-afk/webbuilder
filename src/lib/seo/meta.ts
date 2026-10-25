import type { SiteSeo } from "./settings";

/**
 * Pure SEO resolution shared by the live site's metadata, the editor's
 * search and social previews, and the SEO audit, so all three agree on what
 * a page will actually show.
 */

export const TITLE_MAX = 60;
export const DESCRIPTION_MIN = 50;
export const DESCRIPTION_MAX = 160;

export interface EntrySeo {
  seoTitle?: string | null;
  seoDescription?: string | null;
  noIndex?: boolean;
  canonicalUrl?: string | null;
  ogImageId?: string | null;
}

export interface SeoSubject {
  /** The entry's own title. */
  title: string;
  /** Root-relative path on the site, "/" for home. */
  path: string;
  isHome?: boolean;
  excerpt?: string | null;
  seo?: EntrySeo;
  /** Its post type is left out of the sitemap. */
  excluded?: boolean;
}

export interface ResolvedSeo {
  title: string;
  description: string | null;
  /** Absolute canonical URL. */
  canonical: string;
  index: boolean;
  /** The title came from the entry's SEO title (not the template fallback). */
  customTitle: boolean;
}

export function applyTemplate(template: string | undefined, title: string, siteName: string) {
  const t = template?.includes("%s") ? template : "%s · {site}";
  return t.replace("%s", title).replace("{site}", siteName).trim();
}

/** Joins a site's public base URL and a root-relative path. */
export function absoluteUrl(base: string, path: string) {
  const b = base.replace(/\/+$/, "");
  return path === "/" || !path ? `${b}/` : `${b}${path.startsWith("/") ? path : `/${path}`}`;
}

export function resolveSeo(subject: SeoSubject, site: { name: string; seo: SiteSeo }, base: string): ResolvedSeo {
  const own = subject.seo?.seoTitle?.trim();
  const title = own || (subject.isHome ? site.seo.homeTitle?.trim() || site.name : applyTemplate(site.seo.titleTemplate, subject.title, site.name));
  const description = subject.seo?.seoDescription?.trim() || subject.excerpt?.trim() || site.seo.defaultDescription?.trim() || null;
  const canonical = subject.seo?.canonicalUrl?.trim() || absoluteUrl(base, subject.path);
  const index = !site.seo.discourageIndexing && !subject.seo?.noIndex && !subject.excluded;
  return { title, description, canonical, index, customTitle: !!own };
}

export type SeoIssueCode = "title-long" | "description-missing" | "description-short" | "description-long" | "duplicate-title" | "noindex" | "no-image";

export interface SeoIssue {
  code: SeoIssueCode;
  severity: "error" | "warning" | "info";
  message: string;
}

/** Checks one resolved page; `titleCounts` spots duplicates across the site. */
export function seoIssues(r: ResolvedSeo, opts: { hasImage: boolean; titleCounts: Map<string, number> }): SeoIssue[] {
  const out: SeoIssue[] = [];
  if (r.title.length > TITLE_MAX) out.push({ code: "title-long", severity: "warning", message: `Title is ${r.title.length} characters; search results cut off around ${TITLE_MAX}` });
  if ((opts.titleCounts.get(r.title.toLowerCase()) ?? 0) > 1) out.push({ code: "duplicate-title", severity: "warning", message: "Another page has the same title" });
  if (!r.description) out.push({ code: "description-missing", severity: "error", message: "No meta description; search engines will pick text from the page" });
  else if (r.description.length < DESCRIPTION_MIN) out.push({ code: "description-short", severity: "warning", message: `Description is only ${r.description.length} characters` });
  else if (r.description.length > DESCRIPTION_MAX) out.push({ code: "description-long", severity: "warning", message: `Description is ${r.description.length} characters; aim for under ${DESCRIPTION_MAX}` });
  if (!opts.hasImage) out.push({ code: "no-image", severity: "info", message: "No share image; links shared on social media show no picture" });
  if (!r.index) out.push({ code: "noindex", severity: "info", message: "Hidden from search engines" });
  return out;
}

/** Whether a canonical URL points away from the page itself (such pages stay out of the sitemap). */
export const canonicalPointsElsewhere = (r: ResolvedSeo, base: string, path: string) => r.canonical !== absoluteUrl(base, path);
