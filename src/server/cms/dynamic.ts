import type { Prisma } from "@prisma/client";
import type { DynamicData, DynamicFieldValue, DynamicPost, DynamicSite } from "@/lib/cms/binding";
import { collectRefs, emptyRefs, isEmptyValue, valueToText, type FieldDef, type FieldRefs } from "@/lib/cms/fields";
import type { BuilderDocument, ImageValue, LoopQuery } from "@/lib/builder/types";
import { MAX_LOOP_ITEMS, isLoopQuery } from "@/lib/builder/tree";
import { mergeEntryFields } from "@/lib/i18n/translate";
import { tenantDb, type TenantDb } from "@/lib/tenant-db";
import { fieldDefFromRow } from "./field-defs";

/**
 * Loads the data that bindings and loop grids read. Two sources:
 *  - "published": what visitors see, read only from published revision
 *    snapshots (PostRevision.meta), never from working copies.
 *  - "draft": the working copy, for the canvas preview of the page or entry
 *    being edited.
 * Everything is resolved here (images to MediaAsset URLs, relations to
 * titles), so `applyDynamic` stays a pure function.
 */

export interface EntrySource {
  id: string;
  title: string;
  slug: string;
  postType: { key: string; routePrefix: string | null };
  excerpt: string | null;
  date: Date | null;
  authorName: string | null;
  featuredImageId: string | null;
  content: unknown;
  fields: Record<string, unknown>;
}

/** The shape stored in PostRevision.meta. */
export interface RevisionMeta {
  fields?: Record<string, unknown>;
  featuredImageId?: string | null;
  excerpt?: string | null;
  termIds?: string[];
  template?: string | null;
  parentId?: string | null;
  authorName?: string | null;
  seo?: { seoTitle?: string | null; seoDescription?: string | null; noIndex?: boolean; canonicalUrl?: string | null; ogImageId?: string | null };
}

/** Non-builder entries keep their body as `{ type: "html", html }` in Post.draft. */
export function contentHtml(doc: unknown): string {
  if (doc && typeof doc === "object" && (doc as { type?: string }).type === "html") return String((doc as { html?: string }).html ?? "");
  return "";
}

export function entryPath(postType: { key: string; routePrefix: string | null }, slug: string) {
  if (postType.key === "page") return slug === "home" ? "/" : `/${slug}`;
  return `/${postType.routePrefix || postType.key}/${slug}`;
}

/** Every top-level field definition on the site, by key (keys are unique per site). */
export async function fieldDefsByKey(db: TenantDb): Promise<Map<string, FieldDef>> {
  const rows = await db.customField.findMany({ orderBy: { order: "asc" } });
  return new Map(rows.map((r) => [r.key, fieldDefFromRow(r)]));
}

export function toImage(asset: { id: string; url: string; altText: string | null; width: number | null; height: number | null; variants: Prisma.JsonValue; mimeType: string }): ImageValue {
  const variants = (asset.variants ?? {}) as Record<string, string>;
  const widths = Object.keys(variants).map(Number).filter(Boolean).sort((a, b) => a - b);
  const srcSet = widths.length && asset.width ? [...widths.map((w) => `${variants[w]} ${w}w`), `${asset.url} ${asset.width}w`].join(", ") : undefined;
  return {
    assetId: asset.id,
    src: asset.url,
    alt: asset.altText ?? "",
    width: asset.width ?? undefined,
    height: asset.height ?? undefined,
    ...(srcSet ? { srcSet } : {}),
  };
}

interface Lookups {
  assets: Map<string, Prisma.MediaAssetGetPayload<object>>;
  posts: Map<string, { title: string; slug: string; postType: { key: string; routePrefix: string | null } }>;
  users: Map<string, string>;
  terms: Map<string, string>;
}

async function loadLookups(db: TenantDb, refs: FieldRefs): Promise<Lookups> {
  const [assets, posts, users, terms] = await Promise.all([
    refs.assets.size ? db.mediaAsset.findMany({ where: { id: { in: [...refs.assets] } } }) : [],
    refs.posts.size
      ? db.post.findMany({
          where: { id: { in: [...refs.posts] }, publishedRevisionId: { not: null }, status: { not: "TRASHED" } },
          select: { id: true, title: true, slug: true, postType: { select: { key: true, routePrefix: true } } },
        })
      : [],
    refs.users.size
      ? db.membership.findMany({ where: { userId: { in: [...refs.users] } }, select: { userId: true, user: { select: { name: true, email: true } } } })
      : [],
    refs.terms.size ? db.term.findMany({ where: { id: { in: [...refs.terms] } }, select: { id: true, name: true } }) : [],
  ]);
  return {
    assets: new Map(assets.map((a) => [a.id, a])),
    posts: new Map(posts.map((p) => [p.id, p])),
    users: new Map(users.map((m) => [m.userId, m.user.name ?? m.user.email])),
    terms: new Map(terms.map((t) => [t.id, t.name])),
  };
}

function resolveField(def: FieldDef, value: unknown, l: Lookups): DynamicFieldValue {
  const base: DynamicFieldValue = { type: def.type, label: def.label, text: valueToText(def, value) };
  if (isEmptyValue(value)) return base;
  const ids = (Array.isArray(value) ? value : [value]).filter((x): x is string => typeof x === "string");
  switch (def.type) {
    case "IMAGE": {
      const a = l.assets.get(String(value));
      return { ...base, image: a ? toImage(a) : null };
    }
    case "GALLERY":
      return { ...base, gallery: ids.map((x) => l.assets.get(x)).filter((a) => !!a).map((a) => toImage(a!)) };
    case "FILE": {
      const a = l.assets.get(String(value));
      return { ...base, url: a?.url, text: a ? a.title || a.originalName : "" };
    }
    case "PRICE":
      return { ...base, price: { ...(value as { amount: number; currency: string }), compareAt: null } };
    case "URL":
    case "VIDEO_URL":
      return { ...base, url: String(value) };
    case "EMAIL":
      return { ...base, url: `mailto:${value}` };
    case "RICH_TEXT":
      return { ...base, html: String(value) };
    case "RELATION": {
      const posts = ids.map((x) => l.posts.get(x)).filter((p) => !!p);
      return { ...base, text: posts.map((p) => p!.title).join(", "), url: posts[0] ? entryPath(posts[0].postType, posts[0].slug) : undefined };
    }
    case "USER":
      return { ...base, text: l.users.get(String(value)) ?? "" };
    case "TAXONOMY":
      return { ...base, text: ids.map((x) => l.terms.get(x)).filter(Boolean).join(", ") };
    default:
      return base;
  }
}

/** Turns raw entries into DynamicPosts with one batched lookup for everything they reference. */
export async function buildDynamicPosts(db: TenantDb, entries: EntrySource[], defs?: Map<string, FieldDef>): Promise<DynamicPost[]> {
  if (!entries.length) return [];
  const byKey = defs ?? (await fieldDefsByKey(db));
  const refs = emptyRefs();
  for (const e of entries) {
    if (e.featuredImageId) refs.assets.add(e.featuredImageId);
    for (const [key, value] of Object.entries(e.fields)) {
      const def = byKey.get(key);
      if (def) collectRefs(def, value, refs);
    }
  }
  const l = await loadLookups(db, refs);
  return entries.map((e) => {
    const featured = e.featuredImageId ? l.assets.get(e.featuredImageId) : undefined;
    const fields: Record<string, DynamicFieldValue> = {};
    for (const [key, def] of byKey) fields[key] = resolveField(def, e.fields[key] ?? null, l);
    return {
      id: e.id,
      title: e.title,
      slug: e.slug,
      url: entryPath(e.postType, e.slug),
      excerpt: e.excerpt ?? "",
      date: e.date?.toISOString() ?? null,
      authorName: e.authorName ?? "",
      featuredImage: featured ? toImage(featured) : null,
      content: contentHtml(e.content),
      fields,
    };
  });
}

const entryInclude = {
  postType: { select: { key: true, routePrefix: true } },
  author: { select: { name: true, email: true } },
  translation: { select: { translationId: true } },
} as const;

type PublishedPost = Prisma.PostGetPayload<{ include: typeof entryInclude & { publishedRevision: true } }>;

const LIVE_WHERE = { publishedRevisionId: { not: null }, status: { not: "TRASHED" as const } };

/** Live originals of translated posts, by translation group. */
async function liveOriginals(db: TenantDb, posts: { locale: string; translation: { translationId: string } | null }[]) {
  const groups = [...new Set(posts.filter((p) => p.locale && p.translation).map((p) => p.translation!.translationId))];
  if (!groups.length) return new Map<string, PublishedPost>();
  const rows = await db.post.findMany({ where: { locale: "", translation: { translationId: { in: groups } }, ...LIVE_WHERE }, include: { ...entryInclude, publishedRevision: true } });
  return new Map(rows.map((r) => [r.translation!.translationId, r]));
}

/**
 * Published sources for posts in any language. A translation shows its own
 * title, slug, body and translatable fields over its original's shared
 * fields and featured image; a translation whose original isn't live is
 * left out (its layout and shared facts aren't public).
 */
export async function localizedSources(db: TenantDb, posts: PublishedPost[], defs?: Map<string, FieldDef>): Promise<(EntrySource | null)[]> {
  const originals = await liveOriginals(db, posts);
  const byKey = originals.size ? (defs ?? (await fieldDefsByKey(db))) : null;
  return posts.map((p) => {
    const own = publishedSource(p);
    if (!own || !p.locale) return own;
    const original = p.translation ? originals.get(p.translation.translationId) : undefined;
    const base = original && publishedSource(original);
    if (!base) return null;
    return { ...own, featuredImageId: own.featuredImageId ?? base.featuredImageId, fields: mergeEntryFields(byKey, base.fields, own.fields) };
  });
}

/** The live original of one translation, or null. */
export async function liveOriginal(db: TenantDb, post: { locale: string; translation: { translationId: string } | null }) {
  return (await liveOriginals(db, [post])).values().next().value ?? null;
}

/** A published entry, read from its published revision snapshot. */
export function publishedSource(post: PublishedPost): EntrySource | null {
  const rev = post.publishedRevision;
  if (!rev) return null;
  const meta = (rev.meta ?? {}) as RevisionMeta;
  return {
    id: post.id,
    title: rev.title,
    slug: post.slug,
    postType: post.postType,
    excerpt: meta.excerpt ?? null,
    date: post.publishedAt,
    authorName: meta.authorName ?? post.author?.name ?? null,
    featuredImageId: meta.featuredImageId ?? null,
    content: rev.document,
    fields: meta.fields ?? {},
  };
}

/** The working copy of an entry, for canvas previews. */
export async function draftSource(db: TenantDb, postId: string): Promise<EntrySource | null> {
  const post = await db.post.findUnique({
    where: { id: postId },
    include: { ...entryInclude, fieldValues: { include: { field: { select: { key: true } } } } },
  });
  if (!post) return null;
  return {
    id: post.id,
    title: post.title,
    slug: post.slug,
    postType: post.postType,
    excerpt: post.excerpt,
    date: post.publishedAt ?? post.updatedAt,
    authorName: post.author?.name ?? post.author?.email ?? null,
    featuredImageId: post.featuredImageId,
    content: post.draft,
    fields: Object.fromEntries(post.fieldValues.map((v) => [v.field.key, v.value])),
  };
}

const ORDER: Record<LoopQuery["orderBy"], (dir: "asc" | "desc") => Prisma.PostOrderByWithRelationInput> = {
  date: (dir) => ({ publishedAt: dir }),
  title: (dir) => ({ title: dir }),
  menu: (dir) => ({ menuOrder: dir }),
};

/**
 * A loop grid's entries. Lists are always built from the default-language
 * originals, so every language shows the same items in the same order; in
 * another language each item is swapped for its live translation when
 * there is one.
 */
export async function loopItems(db: TenantDb, query: LoopQuery, defs?: Map<string, FieldDef>, locale = ""): Promise<DynamicPost[]> {
  if (!isLoopQuery(query) || !query.postTypeId) return [];
  const posts = await db.post.findMany({
    where: {
      postTypeId: query.postTypeId,
      locale: "",
      ...LIVE_WHERE,
      ...(query.termId ? { terms: { some: { termId: query.termId } } } : {}),
    },
    orderBy: [ORDER[query.orderBy](query.order), { id: "asc" }],
    skip: query.offset ?? 0,
    take: Math.min(query.limit, MAX_LOOP_ITEMS),
    include: { ...entryInclude, publishedRevision: true },
  });
  return buildDynamicPosts(db, (await inLocale(db, posts, locale, defs)).filter((e): e is EntrySource => !!e), defs);
}

/** Swaps default-language posts for their live translations in `locale`, keeping order. */
export async function inLocale(db: TenantDb, originals: PublishedPost[], locale: string, defs?: Map<string, FieldDef>): Promise<(EntrySource | null)[]> {
  if (!locale) return originals.map(publishedSource);
  const groups = originals.map((p) => p.translation?.translationId).filter((x): x is string => !!x);
  const translated = groups.length
    ? await db.post.findMany({ where: { locale, translation: { translationId: { in: groups } }, ...LIVE_WHERE }, include: { ...entryInclude, publishedRevision: true } })
    : [];
  const byGroup = new Map(translated.map((p) => [p.translation!.translationId, p]));
  const byKey = translated.length ? (defs ?? (await fieldDefsByKey(db))) : null;
  return originals.map((o) => {
    const base = publishedSource(o);
    const t = o.translation ? byGroup.get(o.translation.translationId) : undefined;
    const own = t && publishedSource(t);
    if (!base || !own) return base;
    return { ...own, featuredImageId: own.featuredImageId ?? base.featuredImageId, fields: mergeEntryFields(byKey, base.fields, own.fields) };
  });
}

export async function siteData(db: TenantDb, site: { name: string; settings?: unknown; branding: unknown }, home = "/"): Promise<DynamicSite> {
  const settings = (site.settings ?? {}) as { tagline?: string };
  const branding = (site.branding ?? {}) as { logoAssetId?: string };
  const logo = branding.logoAssetId ? await db.mediaAsset.findUnique({ where: { id: branding.logoAssetId } }) : null;
  return { name: site.name, tagline: settings.tagline ?? "", url: home, logo: logo ? toImage(logo) : null };
}

/**
 * Everything a document needs to render: site identity, the current entry
 * and every loop grid's items. `current` is already resolved by the caller
 * (published snapshot on the live site, draft in the editor).
 */
export async function loadDynamicData(
  siteId: string,
  doc: BuilderDocument,
  site: { name: string; settings?: unknown; branding: unknown },
  current: EntrySource | null,
  linkBase = "",
  locale = "",
): Promise<DynamicData> {
  const db = tenantDb(siteId);
  const defs = await fieldDefsByKey(db);
  const loops: Record<string, DynamicPost[]> = {};
  const loopNodes = Object.values(doc.nodes).filter((n) => n.type === "loop");
  const [post, siteInfo] = await Promise.all([
    current ? buildDynamicPosts(db, [current], defs).then((r) => r[0]) : Promise.resolve(null),
    siteData(db, site, linkBase || "/"),
    Promise.all(loopNodes.map(async (n) => (loops[n.id] = await loopItems(db, n.props.query as LoopQuery, defs, locale)))),
  ]);
  return { site: siteInfo, post, loops };
}

export const ENTRY_INCLUDE = entryInclude;
