import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { DefaultArchive, DefaultEntry } from "@/components/site/DefaultLayouts";
import { SiteDocument } from "@/lib/builder/render";
import type { DesignTokens } from "@/lib/builder/styles";
import { SITE_ROOT_HEADER, siteLinkBase } from "@/lib/site-url";
import { getPreview } from "@/server/preview";
import type { RevisionMeta } from "@/server/cms/dynamic";
import { jsonLdScript, pageSeo, type SeoTarget } from "@/server/seo/page-seo";
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

type Resolved = NonNullable<Awaited<ReturnType<typeof resolve>>>;

/** What search engines and social cards see, from the published snapshot only. */
function seoTarget(r: Resolved): SeoTarget {
  if (r.kind === "archive") {
    const pt = r.archive.postType;
    return { kind: "archive", title: pt.labelPlural, path: `/${pt.routePrefix ?? pt.key}`, postTypeId: pt.id };
  }
  const { post } = r.kind === "page" ? r.page : r.entry;
  const meta = (post.publishedRevision?.meta ?? {}) as RevisionMeta;
  // Revisions published before SEO was snapshotted fall back to the entry's own fields.
  const seo = meta.seo ?? { seoTitle: post.seoTitle, seoDescription: post.seoDescription, noIndex: post.noIndex, canonicalUrl: post.canonicalUrl, ogImageId: post.ogImageId };
  const path = r.kind === "page" ? (post.slug === "home" ? "/" : `/${post.slug}`) : `/${r.entry.postType.routePrefix ?? r.entry.postType.key}/${post.slug}`;
  return {
    kind: r.kind,
    title: post.publishedRevision?.title ?? post.title,
    path,
    excerpt: meta.excerpt ?? post.excerpt,
    seo,
    postTypeId: post.postTypeId,
    featuredImageId: meta.featuredImageId ?? null,
    publishedAt: post.publishedAt,
    modifiedAt: post.publishedRevision?.createdAt ?? null,
    authorName: meta.authorName ?? null,
  };
}

export async function generateMetadata({ params, searchParams }: PageProps<"/sites/[site]/[[...slug]]">): Promise<Metadata> {
  const { site: key, slug } = await params;
  if ((await searchParams).preview !== undefined) return { title: { absolute: "Preview" }, robots: { index: false } };
  const r = await resolve(key, slug);
  if (!r) return {};
  return (await pageSeo(r.site, seoTarget(r))).metadata;
}

export default async function PublicPage({ params, searchParams }: PageProps<"/sites/[site]/[[...slug]]">) {
  const { site: key, slug } = await params;
  if ((await searchParams).preview !== undefined) return <Preview siteKey={key} slug={slug} />;
  const r = await resolve(key, slug);
  if (!r) notFound();
  const { jsonLd } = await pageSeo(r.site, seoTarget(r));
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} />
      <SiteBody r={r} />
    </>
  );
}

function SiteBody({ r }: { r: Resolved }) {
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

/** Drafts at their public address for signed-in editors; everyone else gets a 404. */
async function Preview({ siteKey, slug }: { siteKey: string; slug: string[] | undefined }) {
  const row = await resolveSite(siteKey);
  if (!row) notFound();
  const linkBase = siteLinkBase(siteKey, (await headers()).get(SITE_ROOT_HEADER) === "1");
  const tokens = (row.designTokens ?? {}) as DesignTokens;
  const p = await getPreview({ id: row.id, name: row.name, settings: row.settings, branding: row.branding }, slug, linkBase);
  if (!p) notFound();
  return (
    <>
      <p role="status" data-preview-banner="" style={{ position: "sticky", top: 0, zIndex: 50, margin: 0, padding: ".5rem 1rem", textAlign: "center", font: "500 13px/1.5 system-ui, sans-serif", background: "#312e81", color: "#fff" }}>
        Preview of unpublished changes ({p.status.toLowerCase().replace("_", " ")}). Visitors don&apos;t see this version.
      </p>
      {p.kind === "page" ? (
        <SiteDocument doc={p.document} data={p.data} tokens={tokens} linkBase={linkBase} />
      ) : p.template && p.data ? (
        <SiteDocument doc={p.template} data={p.data} tokens={tokens} linkBase={linkBase} />
      ) : (
        <DefaultEntry entry={p.entry} label={p.postType.labelSingular} tokens={tokens} />
      )}
    </>
  );
}
