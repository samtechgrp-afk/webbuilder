import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DefaultArchive, DefaultEntry } from "@/components/site/DefaultLayouts";
import { SiteDocument } from "@/lib/builder/render";
import type { DesignTokens } from "@/lib/builder/styles";
import { getPreview } from "@/server/preview";
import type { RevisionMeta } from "@/server/cms/dynamic";
import { jsonLdScript, pageSeo, type SeoTarget } from "@/server/seo/page-seo";
import { getPublishedArchive, getPublishedEntry, getPublishedPage, resolveSite } from "@/server/public-site";
import { defaultLocale } from "@/lib/i18n/locales";
import { baseFor, languageLinks, metadataLanguages, siteLocaleContext } from "@/server/i18n/site-locale";

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
  const tokens = (row.designTokens ?? {}) as DesignTokens;
  const loc = await siteLocaleContext(row, key, slug);
  const base = { site: row, tokens, loc, linkBase: loc.linkBase };

  const find = async (stored: string) => {
    const page = await getPublishedPage(site, loc.rest, loc.linkBase, stored);
    if (page) return { kind: "page" as const, page, alternates: page.alternates };
    if (loc.rest.length === 2) {
      const entry = await getPublishedEntry(site, loc.rest[0], loc.rest[1], loc.linkBase, stored);
      if (entry) return { kind: "entry" as const, entry, alternates: entry.alternates };
    }
    if (loc.rest.length === 1) {
      const archive = await getPublishedArchive(site, loc.rest[0], stored);
      if (archive) return { kind: "archive" as const, archive, alternates: loc.locales.map((l) => ({ localeCode: l.code, path: `/${loc.rest[0]}` })) };
    }
    return null;
  };
  const own = await find(loc.stored);
  if (own) return { ...base, ...own, fallback: false };
  // Not translated yet: show the default-language version (the proxy already
  // redirected when a translation exists at another address).
  const fallback = loc.stored ? await find("") : null;
  return fallback ? { ...base, ...fallback, fallback: true } : null;
}

type Resolved = NonNullable<Awaited<ReturnType<typeof resolve>>>;

/** Language of what's shown: the default's when falling back. */
function contentLocale(r: Resolved) {
  return r.fallback ? defaultLocale(r.loc.locales) : r.loc.locale;
}

function seoI18n(r: Resolved) {
  if (!r.loc.locales.length) return undefined;
  const locale = contentLocale(r);
  return { base: baseFor(r.loc, locale), languages: r.fallback ? undefined : metadataLanguages(r.loc, r.alternates), lang: locale?.code };
}

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
  return (await pageSeo(r.site, seoTarget(r), seoI18n(r))).metadata;
}

export default async function PublicPage({ params, searchParams }: PageProps<"/sites/[site]/[[...slug]]">) {
  const { site: key, slug } = await params;
  if ((await searchParams).preview !== undefined) return <Preview siteKey={key} slug={slug} />;
  const r = await resolve(key, slug);
  if (!r) notFound();
  const { jsonLd } = await pageSeo(r.site, seoTarget(r), seoI18n(r));
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} />
      <SiteBody r={r} />
    </>
  );
}

function SiteBody({ r }: { r: Resolved }) {
  const lang = contentLocale(r)?.code;
  const languages = r.loc.locales.length > 1 ? languageLinks(r.loc, r.alternates, r.loc.locale?.code ?? null) : undefined;
  switch (r.kind) {
    case "page":
      return <SiteDocument doc={r.page.document} data={r.page.data} tokens={r.tokens} linkBase={r.linkBase} lang={lang} languages={languages} />;
    case "entry":
      return r.entry.template && r.entry.data ? (
        <SiteDocument doc={r.entry.template} data={r.entry.data} tokens={r.tokens} linkBase={r.linkBase} lang={lang} languages={languages} />
      ) : (
        <DefaultEntry entry={r.entry.entry} label={r.entry.postType.labelSingular} tokens={r.tokens} lang={lang} />
      );
    case "archive":
      return <DefaultArchive title={r.archive.postType.labelPlural} entries={r.archive.entries} tokens={r.tokens} linkBase={r.linkBase} lang={lang} />;
  }
}

/** Drafts at their public address for signed-in editors; everyone else gets a 404. */
async function Preview({ siteKey, slug }: { siteKey: string; slug: string[] | undefined }) {
  const row = await resolveSite(siteKey);
  if (!row) notFound();
  const loc = await siteLocaleContext(row, siteKey, slug);
  const linkBase = loc.linkBase;
  const lang = loc.locale?.code;
  const tokens = (row.designTokens ?? {}) as DesignTokens;
  const p = await getPreview({ id: row.id, name: row.name, settings: row.settings, branding: row.branding }, loc.rest, linkBase, loc.stored);
  if (!p) notFound();
  return (
    <>
      <p role="status" data-preview-banner="" style={{ position: "sticky", top: 0, zIndex: 50, margin: 0, padding: ".5rem 1rem", textAlign: "center", font: "500 13px/1.5 system-ui, sans-serif", background: "#312e81", color: "#fff" }}>
        Preview of unpublished changes ({p.status.toLowerCase().replace("_", " ")}). Visitors don&apos;t see this version.
      </p>
      {p.kind === "page" ? (
        <SiteDocument doc={p.document} data={p.data} tokens={tokens} linkBase={linkBase} lang={lang} />
      ) : p.template && p.data ? (
        <SiteDocument doc={p.template} data={p.data} tokens={tokens} linkBase={linkBase} lang={lang} />
      ) : (
        <DefaultEntry entry={p.entry} label={p.postType.labelSingular} tokens={tokens} lang={lang} />
      )}
    </>
  );
}
