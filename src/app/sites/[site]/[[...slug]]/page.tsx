import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteDocument } from "@/lib/builder/render";
import type { DesignTokens } from "@/lib/builder/styles";
import { getPublishedPage, resolveSite } from "@/server/public-site";

/**
 * A client's live website. Reached directly at /sites/<subdomain>/… or via
 * the proxy rewrite for <subdomain>.<ROOT_DOMAIN> and custom domains.
 * Rendered as a Server Component and cached; publishing revalidates it.
 */
export const instant = false;

export async function generateMetadata({ params }: PageProps<"/sites/[site]/[[...slug]]">): Promise<Metadata> {
  const { site: key, slug } = await params;
  const site = await resolveSite(key);
  if (!site) return {};
  const page = await getPublishedPage(site.id, slug);
  if (!page) return {};
  const { post } = page;
  const title = post.seoTitle ?? `${post.title} · ${site.name}`;
  return {
    title: { absolute: title },
    description: post.seoDescription ?? undefined,
    robots: post.noIndex ? { index: false } : undefined,
    alternates: post.canonicalUrl ? { canonical: post.canonicalUrl } : undefined,
    openGraph: {
      title,
      description: post.seoDescription ?? undefined,
      siteName: site.name,
      images: post.ogImage ? [{ url: post.ogImage.url, width: post.ogImage.width ?? undefined, height: post.ogImage.height ?? undefined }] : undefined,
    },
  };
}

export default async function PublicPage({ params }: PageProps<"/sites/[site]/[[...slug]]">) {
  const { site: key, slug } = await params;
  const site = await resolveSite(key);
  if (!site) notFound();
  const page = await getPublishedPage(site.id, slug);
  if (!page) notFound();
  return <SiteDocument doc={page.document} tokens={(site.designTokens ?? {}) as DesignTokens} />;
}
