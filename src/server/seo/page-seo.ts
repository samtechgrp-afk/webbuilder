import "server-only";
import type { Metadata } from "next";
import { absoluteUrl, resolveSeo, type EntrySeo, type ResolvedSeo } from "@/lib/seo/meta";
import { readSiteSeo } from "@/lib/seo/settings";
import { publicBaseUrl } from "./public-url";
import { getShareImage } from "./seo-service";

/**
 * Turns a live page, entry or archive into Next.js Metadata plus JSON-LD.
 * Reads only the published snapshot, so unpublished SEO edits never leak.
 */

type SiteRow = { id: string; name: string; subdomain: string; customDomain: string | null; settings: unknown; branding: unknown };

export interface SeoTarget {
  kind: "page" | "entry" | "archive";
  title: string;
  path: string;
  excerpt?: string | null;
  seo?: EntrySeo;
  postTypeId: string;
  featuredImageId?: string | null;
  publishedAt?: Date | null;
  modifiedAt?: Date | null;
  authorName?: string | null;
}

export async function pageSeo(site: SiteRow, target: SeoTarget) {
  const siteSeo = readSiteSeo(site.settings);
  const base = await publicBaseUrl(site);
  const isHome = target.kind === "page" && target.path === "/";
  const excluded = (siteSeo.excludedPostTypeIds ?? []).includes(target.postTypeId);
  const r = resolveSeo({ title: target.title, path: target.path, isHome, excerpt: target.excerpt, seo: target.seo, excluded }, { name: site.name, seo: siteSeo }, base);
  const image = await getShareImage(site.id, [target.seo?.ogImageId, target.featuredImageId, siteSeo.defaultOgImageId]);
  const origin = new URL(base).origin;
  const imageUrl = image ? new URL(image.url, origin).toString() : null;

  const metadata: Metadata = {
    metadataBase: new URL(origin),
    title: { absolute: r.title },
    description: r.description ?? undefined,
    alternates: { canonical: r.canonical },
    robots: r.index ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: {
      type: target.kind === "entry" ? "article" : "website",
      url: r.canonical,
      title: r.title,
      description: r.description ?? undefined,
      siteName: site.name,
      images: image && imageUrl ? [{ url: imageUrl, width: image.width ?? undefined, height: image.height ?? undefined, alt: image.altText ?? undefined }] : undefined,
      ...(target.kind === "entry" && target.publishedAt ? { publishedTime: target.publishedAt.toISOString(), modifiedTime: target.modifiedAt?.toISOString() } : {}),
    },
    twitter: {
      card: imageUrl ? "summary_large_image" : "summary",
      title: r.title,
      description: r.description ?? undefined,
      site: siteSeo.twitterHandle || undefined,
      images: imageUrl ? [imageUrl] : undefined,
    },
    ...(isHome && (siteSeo.googleVerification || siteSeo.bingVerification)
      ? { verification: { google: siteSeo.googleVerification || undefined, other: siteSeo.bingVerification ? { "msvalidate.01": siteSeo.bingVerification } : undefined } }
      : {}),
  };
  return { metadata, jsonLd: jsonLd(site, target, r, base, imageUrl, isHome) };
}

function jsonLd(site: SiteRow, target: SeoTarget, r: ResolvedSeo, base: string, imageUrl: string | null, isHome: boolean) {
  if (isHome) {
    return { "@context": "https://schema.org", "@type": "WebSite", name: site.name, url: absoluteUrl(base, "/"), description: r.description ?? undefined };
  }
  if (target.kind === "entry") {
    return {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: target.title.slice(0, 110),
      description: r.description ?? undefined,
      url: r.canonical,
      image: imageUrl ?? undefined,
      datePublished: target.publishedAt?.toISOString(),
      dateModified: target.modifiedAt?.toISOString(),
      author: target.authorName ? { "@type": "Person", name: target.authorName } : undefined,
      publisher: { "@type": "Organization", name: site.name },
    };
  }
  return { "@context": "https://schema.org", "@type": target.kind === "archive" ? "CollectionPage" : "WebPage", name: r.title, url: r.canonical, description: r.description ?? undefined };
}

/** JSON-LD as a script body that can't close its own <script> tag. */
export const jsonLdScript = (data: object) => JSON.stringify(data).replace(/</g, "\\u003c");
