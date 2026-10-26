import "server-only";
import DataLoader from "dataloader";
import type { MediaAsset, Post, PostRevision, PostStatus, Prisma, Taxonomy, Term } from "@prisma/client";
import type { TenantDb } from "@/lib/tenant-db";
import type { SiteLocaleInfo } from "@/lib/i18n/locales";
import type { RevisionMeta } from "../cms/dynamic";

/**
 * Per-request DataLoaders. Resolvers never query one row at a time: every
 * id they need in a tick is collected and fetched with one `IN (...)` query,
 * so 20 posts with their fields, terms, images and authors cost the same
 * handful of queries as 2. Every loader goes through the tenant-scoped
 * client, so an id from another site simply resolves to nothing.
 */

/** Live entries: published revision exists and not trashed. */
export const LIVE = { publishedRevisionId: { not: null }, status: { not: "TRASHED" as const }, postType: { key: { not: "template" } } } satisfies Prisma.PostWhereInput;
/** Working copies the API may show privately (never trash, never builder templates). */
export const PREVIEWABLE = { status: { not: "TRASHED" as const }, postType: { key: { not: "template" } } } satisfies Prisma.PostWhereInput;

/** An entry as the resolvers see it: the live snapshot or the working copy, in one shape. */
export interface PostNode {
  id: string;
  postTypeId: string;
  slug: string;
  status: Exclude<PostStatus, "TRASHED">;
  preview: boolean;
  title: string;
  excerpt: string | null;
  content: unknown;
  featuredImageId: string | null;
  publishedAt: Date | null;
  updatedAt: Date;
  menuOrder: number;
  parentId: string | null;
  authorId: string | null;
  authorName: string | null | undefined;
  /** Field values by key; null means "load the working copy's values". */
  fields: Record<string, unknown> | null;
  /** Term ids; null means "load the working copy's terms". */
  termIds: string[] | null;
  seo: { title: string | null; description: string | null; canonicalUrl: string | null; noIndex: boolean; imageId: string | null };
  /** "" for the default language, else the language code. */
  locale: string;
  translationId: string | null;
}

type Group = { translation?: { translationId: string } | null };
type LiveRow = Post & { publishedRevision: PostRevision | null } & Group;
type PreviewRow = Post & Group;

/** Includes every PostNode query needs. */
export const LIVE_INCLUDE = { publishedRevision: true, translation: { select: { translationId: true } } } as const;
export const PREVIEW_INCLUDE = { translation: { select: { translationId: true } } } as const;

export function liveNode(post: LiveRow): PostNode | null {
  const rev = post.publishedRevision;
  if (!rev || post.status === "TRASHED") return null;
  const meta = (rev.meta ?? {}) as RevisionMeta;
  const seo = meta.seo ?? {};
  return {
    id: post.id,
    postTypeId: post.postTypeId,
    slug: post.slug,
    // A scheduled or re-drafted entry still has a live version; to the public it's published.
    status: "PUBLISHED",
    preview: false,
    title: rev.title,
    excerpt: meta.excerpt ?? null,
    content: rev.document,
    featuredImageId: meta.featuredImageId ?? null,
    publishedAt: post.publishedAt,
    updatedAt: rev.createdAt,
    menuOrder: post.menuOrder,
    parentId: meta.parentId !== undefined ? meta.parentId : post.parentId,
    authorId: post.authorId,
    authorName: meta.authorName,
    fields: meta.fields ?? {},
    termIds: meta.termIds ?? [],
    seo: {
      // Revisions from before SEO snapshots fall back to the entry's own SEO columns.
      title: (meta.seo ? seo.seoTitle : post.seoTitle) ?? null,
      description: (meta.seo ? seo.seoDescription : post.seoDescription) ?? null,
      canonicalUrl: (meta.seo ? seo.canonicalUrl : post.canonicalUrl) ?? null,
      noIndex: !!(meta.seo ? seo.noIndex : post.noIndex),
      imageId: (meta.seo && "ogImageId" in seo ? seo.ogImageId : post.ogImageId) ?? null,
    },
    locale: post.locale,
    translationId: post.translation?.translationId ?? null,
  };
}

export function previewNode(post: PreviewRow): PostNode | null {
  if (post.status === "TRASHED") return null;
  return {
    id: post.id,
    postTypeId: post.postTypeId,
    slug: post.slug,
    status: post.status,
    preview: true,
    title: post.title,
    excerpt: post.excerpt,
    content: post.draft,
    featuredImageId: post.featuredImageId,
    publishedAt: post.publishedAt,
    updatedAt: post.updatedAt,
    menuOrder: post.menuOrder,
    parentId: post.parentId,
    authorId: post.authorId,
    authorName: undefined,
    fields: null,
    termIds: null,
    seo: { title: post.seoTitle, description: post.seoDescription, canonicalUrl: post.canonicalUrl, noIndex: post.noIndex, imageId: post.ogImageId },
    locale: post.locale,
    translationId: post.translation?.translationId ?? null,
  };
}

function byId<T extends { id: string }>(ids: readonly string[], rows: T[]): (T | null)[] {
  const map = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => map.get(id) ?? null);
}

function grouped<T>(keys: readonly string[], rows: T[], key: (row: T) => string | null): T[][] {
  const map = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    if (k === null) continue;
    const list = map.get(k) ?? [];
    list.push(r);
    map.set(k, list);
  }
  return keys.map((k) => map.get(k) ?? []);
}

export function createLoaders(db: TenantDb, siteId: string) {
  let postTypes: Promise<Prisma.PostTypeGetPayload<{ include: { taxonomies: { select: { id: true } } } }>[]> | null = null;
  let fieldGroups: Promise<Prisma.FieldGroupGetPayload<{ include: { fields: true } }>[]> | null = null;
  let taxonomies: Promise<Prisma.TaxonomyGetPayload<{ include: { postTypes: { select: { id: true } } } }>[]> | null = null;
  let locales: Promise<SiteLocaleInfo[]> | null = null;

  return {
    /** Every post type of the site (one query per request). */
    postTypes: () => (postTypes ??= db.postType.findMany({ where: { key: { not: "template" } }, include: { taxonomies: { select: { id: true } } }, orderBy: { createdAt: "asc" } })),
    /** Every taxonomy of the site (one query per request). */
    taxonomies: () => (taxonomies ??= db.taxonomy.findMany({ include: { postTypes: { select: { id: true } } }, orderBy: { key: "asc" } })),

    /** The site's languages, default first (one query per request). */
    locales: () =>
      (locales ??= db.siteLocale.findMany({
        orderBy: [{ isDefault: "desc" }, { order: "asc" }, { createdAt: "asc" }],
        select: { code: true, label: true, prefix: true, isDefault: true, currency: true, domain: true },
      })),

    /** Active field groups with their fields (one query per request). */
    fieldGroups: () => (fieldGroups ??= db.fieldGroup.findMany({ where: { active: true }, include: { fields: { orderBy: { order: "asc" } } }, orderBy: { order: "asc" } })),

    media: new DataLoader<string, MediaAsset | null>(async (ids) => byId(ids, await db.mediaAsset.findMany({ where: { id: { in: [...ids] } } }))),
    term: new DataLoader<string, Term | null>(async (ids) => byId(ids, await db.term.findMany({ where: { id: { in: [...ids] } } }))),
    termsByTaxonomy: new DataLoader<string, Term[]>(async (ids) =>
      grouped(ids, await db.term.findMany({ where: { taxonomyId: { in: [...ids] } }, orderBy: { name: "asc" } }), (t) => t.taxonomyId),
    ),
    termChildren: new DataLoader<string, Term[]>(async (ids) => grouped(ids, await db.term.findMany({ where: { parentId: { in: [...ids] } }, orderBy: { name: "asc" } }), (t) => t.parentId)),
    taxonomy: new DataLoader<string, Taxonomy | null>(async (ids) => byId(ids, await db.taxonomy.findMany({ where: { id: { in: [...ids] } } }))),

    livePost: new DataLoader<string, PostNode | null>(async (ids) => {
      const rows = await db.post.findMany({ where: { id: { in: [...ids] }, ...LIVE }, include: LIVE_INCLUDE });
      return byId(ids, rows).map((r) => (r ? liveNode(r) : null));
    }),
    previewPost: new DataLoader<string, PostNode | null>(async (ids) => {
      const rows = await db.post.findMany({ where: { id: { in: [...ids] }, ...PREVIEWABLE }, include: PREVIEW_INCLUDE });
      return byId(ids, rows).map((r) => (r ? previewNode(r) : null));
    }),
    /** The default-language original of each translation group (live versions). */
    liveOriginal: new DataLoader<string, PostNode | null>(async (groups) => {
      const rows = await db.post.findMany({ where: { locale: "", translation: { translationId: { in: [...groups] } }, ...LIVE }, include: LIVE_INCLUDE });
      const map = new Map(rows.map((r) => [r.translation!.translationId, liveNode(r)]));
      return groups.map((g) => map.get(g) ?? null);
    }),
    /** The default-language original of each translation group (working copies). */
    previewOriginal: new DataLoader<string, PostNode | null>(async (groups) => {
      const rows = await db.post.findMany({ where: { locale: "", translation: { translationId: { in: [...groups] } }, ...PREVIEWABLE }, include: PREVIEW_INCLUDE });
      const map = new Map(rows.map((r) => [r.translation!.translationId, previewNode(r)]));
      return groups.map((g) => map.get(g) ?? null);
    }),
    /** Members of each translation group with whether they're live. */
    groupMembers: new DataLoader<string, { postId: string; localeCode: string; live: boolean; slug: string; postTypeId: string; locale: string }[]>(async (groups) => {
      const rows = await db.postTranslation.findMany({
        where: { translationId: { in: [...groups] }, post: PREVIEWABLE },
        select: { translationId: true, localeCode: true, post: { select: { id: true, slug: true, postTypeId: true, locale: true, publishedRevisionId: true } } },
      });
      return grouped(groups, rows, (r) => r.translationId).map((list) =>
        list.map((r) => ({ postId: r.post.id, localeCode: r.localeCode, live: !!r.post.publishedRevisionId, slug: r.post.slug, postTypeId: r.post.postTypeId, locale: r.post.locale })),
      );
    }),
    liveChildren: new DataLoader<string, PostNode[]>(async (ids) => {
      const rows = await db.post.findMany({ where: { parentId: { in: [...ids] }, ...LIVE }, include: LIVE_INCLUDE, orderBy: [{ menuOrder: "asc" }, { title: "asc" }] });
      return grouped(ids, rows, (r) => r.parentId).map((list) => list.map(liveNode).filter((n): n is PostNode => !!n));
    }),
    previewChildren: new DataLoader<string, PostNode[]>(async (ids) => {
      const rows = await db.post.findMany({ where: { parentId: { in: [...ids] }, ...PREVIEWABLE }, include: PREVIEW_INCLUDE, orderBy: [{ menuOrder: "asc" }, { title: "asc" }] });
      return grouped(ids, rows, (r) => r.parentId).map((list) => list.map(previewNode).filter((n): n is PostNode => !!n));
    }),
    /** Working-copy field values by post, keyed by field key. */
    draftFields: new DataLoader<string, Record<string, unknown>>(async (ids) => {
      const rows = await db.fieldValue.findMany({ where: { postId: { in: [...ids] } }, include: { field: { select: { key: true } } } });
      return grouped(ids, rows, (r) => r.postId).map((list) => Object.fromEntries(list.map((v) => [v.field.key, v.value])));
    }),
    /** Working-copy term ids by post. PostTerm has no siteId, so the post's site is checked in the join. */
    draftTermIds: new DataLoader<string, string[]>(async (ids) => {
      const rows = await db.postTerm.findMany({ where: { postId: { in: [...ids] }, post: { siteId } }, select: { postId: true, termId: true } });
      return grouped(ids, rows, (r) => r.postId).map((list) => list.map((r) => r.termId));
    }),
    /** People on this site (membership proves it), by user id. */
    user: new DataLoader<string, { id: string; name: string | null } | null>(async (ids) => {
      const rows = await db.membership.findMany({ where: { userId: { in: [...ids] } }, include: { user: { select: { id: true, name: true } } } });
      return byId(ids, rows.map((m) => m.user));
    }),
  };
}

export type Loaders = ReturnType<typeof createLoaders>;
