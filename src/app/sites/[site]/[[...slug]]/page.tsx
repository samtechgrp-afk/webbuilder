import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { DefaultArchive, DefaultEntry } from "@/components/site/DefaultLayouts";
import { SiteDocument } from "@/lib/builder/render";
import type { DesignTokens } from "@/lib/builder/styles";
import { SITE_ROOT_HEADER, siteLinkBase } from "@/lib/site-url";
import { getPublishedArchive, getPublishedEntry, getPublishedPage, resolveSite } from "@/server/public-site";

/**
 * A client's live website. Reached directly at /sites/<subdomain>/… or via
 * the proxy rewrite for <subdomain>.<ROOT_DOMAIN> and custom domains.
 * Resolves, in order: a builder page at the full path, a CPT entry at
 * /<prefix>/<slug>, a CPT archive at /<prefix>. Rendered as Server
 * Components from cached reads; publishing revalidates them.
 */
export const instant = false;

async function resolve(key: string, slug: string[] | undefined) {
  const row = await resolveSite(key);
  if (!row) return null;
  const site = { id: row.id, name: row.name, settings: row.settings, branding: row.branding };
  const linkBase = siteLinkBase(key, (await headers()).get(SITE_ROOT_HEADER) === "1");
  const tokens = (row.designTokens ?? {}) as DesignTokens;

  const page = await getPublishedPage(site, slug, linkBase);
  if (page) return { kind: "page" as const, site: row, linkBase, tokens, page };
  if (slug?.length === 2) {
    const entry = await getPublishedEntry(site, slug[0], slug[1], linkBase);
    if (entry) return { kind: "entry" as const, site: row, linkBase, tokens, entry };
  }
  if (slug?.length === 1) {
    const archive = await getPublishedArchive(site, slug[0]);
    if (archive) return { kind: "archive" as const, site: row, linkBase, tokens, archive };
  }
  return null;
}

export async function generateMetadata({ params }: PageProps<"/sites/[site]/[[...slug]]">): Promise<Metadata> {
  const { site: key, slug } = await params;
  const r = await resolve(key, slug);
  if (!r) return {};
  if (r.kind === "archive") return { title: { absolute: `${r.archive.postType.labelPlural} · ${r.site.name}` } };
  const { post, seo } = r.kind === "page" ? r.page : r.entry;
  const title = seo?.seoTitle ?? post.seoTitle ?? `${post.publishedRevision?.title ?? post.title} · ${r.site.name}`;
  const description = seo?.seoDescription ?? post.seoDescription ?? undefined;
  return {
    title: { absolute: title },
    description,
    robots: (seo?.noIndex ?? post.noIndex) ? { index: false } : undefined,
    alternates: post.canonicalUrl ? { canonical: post.canonicalUrl } : undefined,
    openGraph: {
      title,
      description,
      siteName: r.site.name,
      images: post.ogImage ? [{ url: post.ogImage.url, width: post.ogImage.width ?? undefined, height: post.ogImage.height ?? undefined }] : undefined,
    },
  };
}

export default async function PublicPage({ params }: PageProps<"/sites/[site]/[[...slug]]">) {
  const { site: key, slug } = await params;
  const r = await resolve(key, slug);
  if (!r) notFound();
  switch (r.kind) {
    case "page":
      return <SiteDocument doc={r.page.document} data={r.page.data} tokens={r.tokens} linkBase={r.linkBase} />;
    case "entry":
      return r.entry.template && r.entry.data ? (
        <SiteDocument doc={r.entry.template} data={r.entry.data} tokens={r.tokens} linkBase={r.linkBase} />
      ) : (
        <DefaultEntry entry={r.entry.entry} label={r.entry.postType.labelSingular} tokens={r.tokens} />
      );
    case "archive":
      return <DefaultArchive title={r.archive.postType.labelPlural} entries={r.archive.entries} tokens={r.tokens} linkBase={r.linkBase} />;
  }
}
