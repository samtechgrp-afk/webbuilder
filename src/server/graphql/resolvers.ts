import "server-only";
import { GraphQLError } from "graphql";
import type { MediaAsset, Prisma, Site, Taxonomy, Term } from "@prisma/client";
import { isEmptyValue, type FieldDef, type FlexibleBlock } from "@/lib/cms/fields";
import { postTypesForRules } from "@/lib/cms/location";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "@/lib/graphql/limits";
import type { CustomFieldTypes } from "@/lib/graphql/sdl";
import { readSiteSeo } from "@/lib/seo/settings";
import type { TenantContext } from "@/lib/tenant";
import { Forbidden } from "@/lib/tenant";
import { tenantDb, type TenantDb } from "@/lib/tenant-db";
import { createEntry, saveEntry } from "../cms/entries";
import { contentHtml, entryPath } from "../cms/dynamic";
import { EditError } from "../content-service";
import type { Viewer } from "./api-keys";
import { isBuilderDocument } from "@/lib/builder/types";
import { groupAlternates, localeBase, localePath, type SiteLocaleInfo } from "@/lib/i18n/locales";
import { composeDocument, mergeEntryFields } from "@/lib/i18n/translate";
import { fieldDefFromRow } from "../cms/field-defs";
import { LIVE, LIVE_INCLUDE, PREVIEWABLE, PREVIEW_INCLUDE, liveNode, previewNode, type Loaders, type PostNode } from "./loaders";

/**
 * Resolvers for the site schema (src/lib/graphql/sdl.ts). Every read goes
 * through `ctx.db` (tenant-scoped) or `ctx.loaders` (batched, also scoped),
 * and every entry comes back as a PostNode: the published snapshot for
 * public requests, the working copy only when the viewer may preview.
 */

export interface GqlContext {
  site: Site;
  viewer: Viewer;
  db: TenantDb;
  loaders: Loaders;
  types: CustomFieldTypes;
  baseUrl: string;
}

type Args = Record<string, unknown>;
type Resolver = (source: never, args: never, ctx: GqlContext) => unknown;

export const gqlError = (message: string, code: string, extra: Record<string, unknown> = {}) => new GraphQLError(message, { extensions: { code, ...extra } });

function requirePreview(ctx: GqlContext) {
  if (!ctx.viewer.canPreview) throw gqlError("Drafts and previews need a read-write API key or a signed-in editor", "FORBIDDEN");
}

// ── Pagination ───────────────────────────────────────────────────────────────

const encodeCursor = (offset: number) => Buffer.from(`o:${offset}`).toString("base64url");
function decodeCursor(cursor: unknown): number {
  if (cursor == null) return 0;
  const m = /^o:(\d{1,7})$/.exec(Buffer.from(String(cursor), "base64url").toString());
  if (!m) throw gqlError("Invalid cursor", "BAD_USER_INPUT");
  return Number(m[1]);
}
function pageSize(first: unknown) {
  const n = typeof first === "number" ? first : DEFAULT_PAGE_SIZE;
  if (n < 1 || n > MAX_PAGE_SIZE) throw gqlError(`first must be between 1 and ${MAX_PAGE_SIZE}`, "BAD_USER_INPUT");
  return n;
}
function connection<T>(nodes: T[], offset: number, take: number, count: () => Promise<number>) {
  const hasNextPage = nodes.length > take;
  const page = nodes.slice(0, take);
  return { nodes: page, totalCount: count, pageInfo: { hasNextPage, endCursor: page.length ? encodeCursor(offset + page.length) : null } };
}

const ORDER: Record<string, (live: boolean) => Prisma.PostOrderByWithRelationInput[]> = {
  DATE_DESC: () => [{ publishedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
  DATE_ASC: () => [{ publishedAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
  TITLE_ASC: (live) => [live ? { publishedRevision: { title: "asc" } } : { title: "asc" }],
  TITLE_DESC: (live) => [live ? { publishedRevision: { title: "desc" } } : { title: "desc" }],
  MENU_ORDER: () => [{ menuOrder: "asc" }, { title: "asc" }],
  MODIFIED_DESC: () => [{ updatedAt: "desc" }],
};

// ── Languages ────────────────────────────────────────────────────────────────

/** The Post.locale value for a `locale` argument: "" for the default language. Unknown codes are an error. */
async function storedLocale(ctx: GqlContext, code: unknown): Promise<string> {
  if (code === undefined || code === null || code === "") return "";
  const locales = await ctx.loaders.locales();
  const l = locales.find((x) => x.code.toLowerCase() === String(code).toLowerCase());
  if (!l) throw gqlError(locales.length ? `Unknown locale "${String(code)}". This site has: ${locales.map((x) => x.code).join(", ")}` : "This site has a single language", "BAD_USER_INPUT");
  return l.isDefault ? "" : l.code;
}

async function localeOf(ctx: GqlContext, n: { locale: string }): Promise<SiteLocaleInfo | null> {
  const locales = await ctx.loaders.locales();
  return locales.find((l) => (n.locale ? l.code === n.locale : l.isDefault)) ?? null;
}

/** A translation's original (same preview mode), or null for originals. */
function originalOf(ctx: GqlContext, n: PostNode): Promise<PostNode | null> {
  if (!n.locale || !n.translationId) return Promise.resolve(null);
  return (n.preview ? ctx.loaders.previewOriginal : ctx.loaders.liveOriginal).load(n.translationId);
}

/** Live translations are only public on top of a live original. */
async function visible(ctx: GqlContext, n: PostNode | null): Promise<PostNode | null> {
  if (!n || !n.locale || n.preview) return n;
  return (await originalOf(ctx, n)) ? n : null;
}

async function fieldDefMap(ctx: GqlContext) {
  return new Map((await ctx.loaders.fieldGroups()).flatMap((g) => g.fields).map((f) => [f.key, fieldDefFromRow(f)]));
}

// ── Post queries ─────────────────────────────────────────────────────────────

interface PostWhere {
  terms?: { taxonomy: string; slug: string }[] | null;
  category?: string | null;
  tag?: string | null;
  status?: string[] | null;
  search?: string | null;
  parent?: string | null;
}

async function postTypeByKey(ctx: GqlContext, key: string) {
  const type = (await ctx.loaders.postTypes()).find((p) => p.key === key);
  if (!type) throw gqlError(`Unknown post type "${key}"`, "BAD_USER_INPUT");
  return type;
}

async function findPosts(ctx: GqlContext, postTypeId: string, args: { first?: unknown; after?: unknown; where?: PostWhere | null; orderBy?: unknown; locale?: unknown; parentFilter?: { parentId: string | null } }) {
  const where = args.where ?? {};
  const locale = await storedLocale(ctx, args.locale);
  const statuses = where.status ?? null;
  // Anything but live content reads working copies, which is private.
  const preview = !!statuses?.some((s) => s !== "PUBLISHED");
  if (preview) requirePreview(ctx);

  const refs = [...(where.terms ?? [])];
  if (where.category) refs.push({ taxonomy: "category", slug: where.category });
  if (where.tag) refs.push({ taxonomy: "tag", slug: where.tag });
  const termIds: string[] = [];
  if (refs.length) {
    const taxonomies = await ctx.loaders.taxonomies();
    const terms = await ctx.db.term.findMany({
      where: { OR: refs.map((r) => ({ slug: r.slug, taxonomyId: taxonomies.find((t) => t.key === r.taxonomy)?.id ?? "-" })) },
      select: { id: true, slug: true, taxonomyId: true },
    });
    for (const r of refs) {
      const tax = taxonomies.find((t) => t.key === r.taxonomy);
      const term = terms.find((t) => t.slug === r.slug && t.taxonomyId === tax?.id);
      if (!term) return connection<PostNode>([], 0, 1, async () => 0);
      termIds.push(term.id);
    }
  }

  const search = where.search?.trim().slice(0, 100);
  const filter: Prisma.PostWhereInput = {
    postTypeId,
    locale,
    ...(preview ? { ...PREVIEWABLE, status: { in: statuses as never } } : LIVE),
    ...(args.parentFilter ?? {}),
    ...(where.parent !== undefined && where.parent !== null ? { parentId: where.parent } : {}),
    // Live entries are filtered by the terms in their published snapshot, never by unpublished edits.
    ...(termIds.length
      ? preview
        ? { AND: termIds.map((termId) => ({ terms: { some: { termId } } })) }
        : { AND: termIds.map((termId) => ({ publishedRevision: { meta: { path: ["termIds"], array_contains: [termId] } } })) }
      : {}),
    ...(search ? (preview ? { title: { contains: search, mode: "insensitive" as const } } : { publishedRevision: { title: { contains: search, mode: "insensitive" as const } } }) : {}),
  };

  const offset = decodeCursor(args.after);
  const take = pageSize(args.first);
  const orderBy = [...(ORDER[String(args.orderBy ?? "DATE_DESC")] ?? ORDER.DATE_DESC)(!preview), { id: "asc" as const }];
  const nodes = preview
    ? (await ctx.db.post.findMany({ where: filter, orderBy, skip: offset, take: take + 1, include: PREVIEW_INCLUDE })).map(previewNode)
    : (await ctx.db.post.findMany({ where: filter, orderBy, skip: offset, take: take + 1, include: LIVE_INCLUDE })).map(liveNode);
  const list = (await Promise.all(nodes.map((n) => visible(ctx, n)))).filter((n): n is PostNode => !!n);
  for (const n of list) (n.preview ? ctx.loaders.previewPost : ctx.loaders.livePost).prime(n.id, n);
  return connection(list, offset, take, () => ctx.db.post.count({ where: filter }));
}

async function findOne(ctx: GqlContext, args: { id?: unknown; type?: unknown; slug?: unknown; preview?: unknown; locale?: unknown }) {
  const preview = args.preview === true;
  if (preview) requirePreview(ctx);
  const loader = preview ? ctx.loaders.previewPost : ctx.loaders.livePost;
  const hasLocale = args.locale !== undefined && args.locale !== null;
  const locale = await storedLocale(ctx, args.locale);
  if (typeof args.id === "string") {
    let node = await visible(ctx, await loader.load(args.id));
    if (node && typeof args.type === "string") {
      const type = await postTypeByKey(ctx, args.type);
      if (node.postTypeId !== type.id) return null;
    }
    // By id in another language: that entry's translation.
    if (node && hasLocale && node.locale !== locale) {
      if (!node.translationId) return null;
      const member = (await ctx.loaders.groupMembers.load(node.translationId)).find((m) => m.locale === locale);
      node = member ? await visible(ctx, await loader.load(member.postId)) : null;
    }
    return node;
  }
  if (typeof args.type !== "string" || typeof args.slug !== "string") throw gqlError("Pass an id, or a type and a slug", "BAD_USER_INPUT");
  const type = await postTypeByKey(ctx, args.type);
  const post = await ctx.db.post.findFirst({
    where: { postTypeId: type.id, locale, slug: args.slug, ...(preview ? PREVIEWABLE : LIVE) },
    include: preview ? PREVIEW_INCLUDE : LIVE_INCLUDE,
  });
  if (!post) return null;
  const node = await visible(ctx, preview ? previewNode(post) : liveNode(post as never));
  if (node) loader.prime(node.id, node);
  return node;
}

// ── Custom field values ──────────────────────────────────────────────────────

interface FieldObject {
  values: Record<string, unknown>;
  preview: boolean;
  layout?: string;
}

const LIST_TYPES = new Set(["GALLERY", "TAXONOMY", "CHECKBOX", "REPEATER", "FLEXIBLE"]);
const ids = (v: unknown) => (Array.isArray(v) ? v : [v]).filter((x): x is string => typeof x === "string");
const found = <T>(rows: (T | Error | null)[]) => rows.filter((r): r is T => !!r && !(r instanceof Error));

async function fieldValue(def: FieldDef, raw: unknown, preview: boolean, ctx: GqlContext, typeName: string): Promise<unknown> {
  const many = LIST_TYPES.has(def.type) || ((def.type === "RELATION" || def.type === "SELECT") && !!def.config.multiple);
  if (isEmptyValue(raw)) return many ? [] : def.type === "BOOLEAN" ? false : null;
  switch (def.type) {
    case "NUMBER":
      return Number.isFinite(Number(raw)) ? Number(raw) : null;
    case "BOOLEAN":
      return !!raw;
    case "PRICE": {
      const p = raw as { amount?: number; currency?: string };
      if (typeof p?.amount !== "number" || !p.currency) return null;
      return { amount: p.amount, currency: p.currency, formatted: new Intl.NumberFormat("en-US", { style: "currency", currency: p.currency }).format(p.amount) };
    }
    case "IMAGE":
    case "FILE":
      return typeof raw === "string" ? ctx.loaders.media.load(raw) : null;
    case "GALLERY":
      return found(await ctx.loaders.media.loadMany(ids(raw)));
    case "RELATION": {
      const loader = preview ? ctx.loaders.previewPost : ctx.loaders.livePost;
      return def.config.multiple ? found(await loader.loadMany(ids(raw))) : typeof raw === "string" ? loader.load(raw) : null;
    }
    case "USER":
      return typeof raw === "string" ? ctx.loaders.user.load(raw) : null;
    case "TAXONOMY":
      return found(await ctx.loaders.term.loadMany(ids(raw)));
    case "CHECKBOX":
      return ids(raw);
    case "SELECT":
      return def.config.multiple ? ids(raw) : String(Array.isArray(raw) ? raw[0] : raw);
    case "REPEATER":
      if (!def.config.subFields?.length || !Array.isArray(raw)) return raw;
      return raw.map((row) => ({ values: (row ?? {}) as Record<string, unknown>, preview }) satisfies FieldObject);
    case "FLEXIBLE": {
      if (!def.config.layouts?.length || !Array.isArray(raw)) return raw;
      const union = ctx.types.unions[ctx.types.unionOf[`${typeName}.${def.key}`]];
      return (raw as FlexibleBlock[])
        .filter((b) => union?.[b.layout])
        .map((b) => ({ __typename: union![b.layout], layout: b.layout, values: b.values ?? {}, preview }));
    }
    default:
      return typeof raw === "string" || typeof raw === "number" ? String(raw) : JSON.stringify(raw);
  }
}

/** Resolvers for CustomFields and every generated row / block type. */
export function customFieldResolvers(types: CustomFieldTypes): Record<string, Record<string, Resolver>> {
  const out: Record<string, Record<string, Resolver>> = {};
  for (const [typeName, fields] of Object.entries(types.objects)) {
    const map: Record<string, Resolver> = {};
    for (const [name, def] of Object.entries(fields)) {
      map[name] = ((src: FieldObject, _args: Args, ctx: GqlContext) => fieldValue(def, src.values[def.key], src.preview, ctx, typeName)) as Resolver;
    }
    map._layout = ((src: FieldObject) => src.layout ?? null) as Resolver;
    map._raw = ((src: FieldObject) => src.values) as Resolver;
    out[typeName] = map;
  }
  return out;
}

// ── Media ────────────────────────────────────────────────────────────────────

function variants(asset: MediaAsset) {
  const v = (asset.variants ?? {}) as Record<string, string>;
  return Object.entries(v)
    .map(([w, url]) => ({ width: Number(w), url }))
    .filter((x) => x.width > 0)
    .sort((a, b) => a.width - b.width);
}

// ── Mutations ────────────────────────────────────────────────────────────────

/** A tenant context for a write made with a read-write key, acting as the key's creator with draft-only permissions. */
function keyTenant(ctx: GqlContext): TenantContext {
  const { viewer, site } = ctx;
  if (!viewer.canWrite || !viewer.user) throw gqlError("Writing needs a read-write API key", "FORBIDDEN");
  const permissions = viewer.permissions;
  return {
    user: viewer.user,
    site: { id: site.id, name: site.name, subdomain: site.subdomain, customDomain: site.customDomain, branding: site.branding, settings: site.settings, designTokens: site.designTokens },
    role: { key: "api_key", name: "API key" },
    permissions,
    db: tenantDb(site.id),
    can: (p) => permissions.includes(p),
    assert: (p) => {
      if (!permissions.includes(p)) throw new Forbidden(p);
    },
  };
}

async function writeOrThrow<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof EditError) throw gqlError(err.message, err.code === "invalid" ? "BAD_USER_INPUT" : err.code.toUpperCase(), err.violations ? { violations: err.violations } : {});
    if (err instanceof Forbidden) throw gqlError("This key can't do that", "FORBIDDEN");
    throw err;
  }
}

interface EntryUpdateInput {
  title?: string | null;
  slug?: string | null;
  excerpt?: string | null;
  content?: string | null;
  featuredImageId?: string | null;
  termIds?: string[] | null;
  customFields?: unknown;
  submitForReview?: boolean | null;
}

async function updateEntry(ctx: GqlContext, id: string, input: EntryUpdateInput) {
  const t = keyTenant(ctx);
  const post = await t.db.post.findFirst({
    where: { id, ...PREVIEWABLE },
    include: { fieldValues: { include: { field: { select: { key: true } } } }, terms: { select: { termId: true } }, revisions: { select: { version: true }, orderBy: { version: "desc" }, take: 1 } },
  });
  if (!post) throw gqlError("Entry not found", "NOT_FOUND");
  if (input.customFields != null && (typeof input.customFields !== "object" || Array.isArray(input.customFields))) throw gqlError("customFields must be an object of values by field key", "BAD_USER_INPUT");
  const has = (k: keyof EntryUpdateInput) => input[k] !== undefined;
  await writeOrThrow(() =>
    saveEntry(t, {
      postId: post.id,
      baseVersion: post.revisions[0]?.version ?? 0,
      intent: input.submitForReview ? "submit" : "draft",
      message: "Saved through the GraphQL API",
      title: input.title ?? post.title,
      slug: input.slug ?? post.slug,
      excerpt: has("excerpt") ? input.excerpt : post.excerpt,
      content: has("content") ? input.content : contentHtml(post.draft),
      featuredImageId: has("featuredImageId") ? input.featuredImageId : post.featuredImageId,
      template: post.template,
      parentId: post.parentId,
      menuOrder: post.menuOrder,
      termIds: input.termIds ?? post.terms.map((x) => x.termId),
      fields: { ...Object.fromEntries(post.fieldValues.map((v) => [v.field.key, v.value])), ...((input.customFields as Record<string, unknown>) ?? {}) },
      seo: { seoTitle: post.seoTitle, seoDescription: post.seoDescription, noIndex: post.noIndex, canonicalUrl: post.canonicalUrl, ogImageId: post.ogImageId },
    }),
  );
  ctx.loaders.previewPost.clear(post.id);
  ctx.loaders.draftFields.clear(post.id);
  ctx.loaders.draftTermIds.clear(post.id);
  return ctx.loaders.previewPost.load(post.id);
}

// ── Resolver map ─────────────────────────────────────────────────────────────

export function resolvers(types: CustomFieldTypes): Record<string, Record<string, Resolver>> {
  const r = {
    Query: {
      site: (_: unknown, __: Args, ctx: GqlContext) => ctx.site,
      postTypes: (_: unknown, __: Args, ctx: GqlContext) => ctx.loaders.postTypes(),
      postType: async (_: unknown, a: { key: string }, ctx: GqlContext) => (await ctx.loaders.postTypes()).find((p) => p.key === a.key) ?? null,
      post: (_: unknown, a: Args, ctx: GqlContext) => findOne(ctx, a),
      page: (_: unknown, a: Args, ctx: GqlContext) => {
        const slug = typeof a.slug === "string" ? a.slug.replace(/^\/+|\/+$/g, "") || "home" : undefined;
        return findOne(ctx, { ...a, type: "page", slug });
      },
      posts: async (_: unknown, a: Args, ctx: GqlContext) => findPosts(ctx, (await postTypeByKey(ctx, String(a.type))).id, a),
      pages: async (_: unknown, a: Args, ctx: GqlContext) => findPosts(ctx, (await postTypeByKey(ctx, "page")).id, { ...a, parentFilter: { parentId: (a.parent as string | null | undefined) ?? null } }),
      taxonomies: (_: unknown, __: Args, ctx: GqlContext) => ctx.loaders.taxonomies(),
      taxonomy: async (_: unknown, a: { key: string }, ctx: GqlContext) => (await ctx.loaders.taxonomies()).find((t) => t.key === a.key) ?? null,
      term: async (_: unknown, a: { taxonomy: string; slug: string }, ctx: GqlContext) => {
        const tax = (await ctx.loaders.taxonomies()).find((t) => t.key === a.taxonomy);
        return tax ? ctx.db.term.findFirst({ where: { taxonomyId: tax.id, slug: a.slug } }) : null;
      },
      locales: (_: unknown, __: Args, ctx: GqlContext) => ctx.loaders.locales(),
      mediaAsset: (_: unknown, a: { id: string }, ctx: GqlContext) => ctx.loaders.media.load(a.id),
      mediaAssets: async (_: unknown, a: Args, ctx: GqlContext) => {
        // The library holds files for unpublished work too, so browsing it is private; live entries still return their images.
        requirePreview(ctx);
        const offset = decodeCursor(a.after);
        const take = pageSize(a.first);
        const search = typeof a.search === "string" ? a.search.trim().slice(0, 100) : "";
        const where: Prisma.MediaAssetWhereInput = {
          ...(typeof a.mimeType === "string" && a.mimeType ? { mimeType: { startsWith: a.mimeType.replace(/\*$/, "") } } : {}),
          ...(search ? { OR: [{ originalName: { contains: search, mode: "insensitive" } }, { title: { contains: search, mode: "insensitive" } }, { altText: { contains: search, mode: "insensitive" } }] } : {}),
        };
        const rows = await ctx.db.mediaAsset.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip: offset, take: take + 1 });
        for (const row of rows) ctx.loaders.media.prime(row.id, row);
        return connection(rows, offset, take, () => ctx.db.mediaAsset.count({ where }));
      },
    },

    Mutation: {
      createEntry: async (_: unknown, a: { type: string; title: string }, ctx: GqlContext) => {
        const t = keyTenant(ctx);
        const type = await postTypeByKey(ctx, a.type);
        const { id } = await writeOrThrow(() => createEntry(t, { postTypeId: type.id, title: a.title }));
        return ctx.loaders.previewPost.load(id);
      },
      updateEntry: (_: unknown, a: { id: string; input: EntryUpdateInput }, ctx: GqlContext) => updateEntry(ctx, a.id, a.input),
    },

    Site: {
      tagline: (s: Site) => ((s.settings ?? {}) as { tagline?: string }).tagline ?? null,
      url: (_: Site, __: Args, ctx: GqlContext) => ctx.baseUrl,
      logo: (s: Site, _: Args, ctx: GqlContext) => {
        const id = ((s.branding ?? {}) as { logoAssetId?: string }).logoAssetId;
        return id ? ctx.loaders.media.load(id) : null;
      },
      seo: (s: Site) => readSiteSeo(s.settings),
    },
    SiteSeo: {
      defaultImage: (s: { defaultOgImageId?: string | null }, _: Args, ctx: GqlContext) => (s.defaultOgImageId ? ctx.loaders.media.load(s.defaultOgImageId) : null),
    },

    PostType: {
      taxonomies: async (p: { taxonomies: { id: string }[] }, _: Args, ctx: GqlContext) => {
        const ids = new Set(p.taxonomies.map((t) => t.id));
        return (await ctx.loaders.taxonomies()).filter((t) => ids.has(t.id));
      },
      fields: async (p: { id: string }, _: Args, ctx: GqlContext) => {
        const groups = await ctx.loaders.fieldGroups();
        return groups
          .filter((g) => postTypesForRules(g.location, [p.id]).includes(p.id))
          .flatMap((g) => g.fields)
          .map((f) => ({ key: f.key, label: f.label, type: f.type, required: f.required, multiple: !!(f.config as { multiple?: boolean })?.multiple || LIST_TYPES.has(f.type), instructions: f.instructions }));
      },
    },

    Locale: {
      url: (l: SiteLocaleInfo, _: Args, ctx: GqlContext) => `${localeBase(ctx.baseUrl, l)}/`,
    },

    Post: {
      type: async (n: PostNode, _: Args, ctx: GqlContext) => (await ctx.loaders.postTypes()).find((p) => p.id === n.postTypeId),
      uri: async (n: PostNode, _: Args, ctx: GqlContext) => {
        const type = (await ctx.loaders.postTypes()).find((p) => p.id === n.postTypeId)!;
        const l = await localeOf(ctx, n);
        return l?.domain ? entryPath(type, n.slug) : localePath(l, entryPath(type, n.slug));
      },
      url: async (n: PostNode, _: Args, ctx: GqlContext) => {
        const type = (await ctx.loaders.postTypes()).find((p) => p.id === n.postTypeId)!;
        return `${localeBase(ctx.baseUrl, await localeOf(ctx, n))}${entryPath(type, n.slug)}`;
      },
      locale: async (n: PostNode, _: Args, ctx: GqlContext) => (await localeOf(ctx, n))?.code ?? null,
      translations: async (n: PostNode, _: Args, ctx: GqlContext) => {
        if (!n.translationId) return [];
        const members = (await ctx.loaders.groupMembers.load(n.translationId)).filter((m) => m.postId !== n.id && (n.preview || m.live));
        const loader = n.preview ? ctx.loaders.previewPost : ctx.loaders.livePost;
        return (await Promise.all(members.map(async (m) => visible(ctx, await loader.load(m.postId))))).filter(Boolean);
      },
      hreflangs: async (n: PostNode, _: Args, ctx: GqlContext) => {
        if (!n.translationId) return [];
        const [members, locales, types] = await Promise.all([ctx.loaders.groupMembers.load(n.translationId), ctx.loaders.locales(), ctx.loaders.postTypes()]);
        const live = members.filter((m) => m.live);
        if (!live.some((m) => !m.locale)) return [];
        const list = groupAlternates(
          live.map((m) => ({ localeCode: m.localeCode, path: entryPath(types.find((t) => t.id === m.postTypeId)!, m.slug) })),
          locales,
          ctx.baseUrl,
        );
        return list.length > 1 ? list.map((a) => ({ hreflang: a.hreflang, locale: a.hreflang === "x-default" ? null : a.hreflang, url: a.href })) : [];
      },
      isPreview: (n: PostNode) => n.preview,
      content: async (n: PostNode, _: Args, ctx: GqlContext) => {
        const type = (await ctx.loaders.postTypes()).find((p) => p.id === n.postTypeId);
        return type?.usesBuilder ? null : contentHtml(n.content);
      },
      document: async (n: PostNode, _: Args, ctx: GqlContext) => {
        const type = (await ctx.loaders.postTypes()).find((p) => p.id === n.postTypeId);
        if (!type?.usesBuilder) return null;
        if (!n.locale) return n.content;
        // A translation renders the original's layout with its own text and media.
        const original = await originalOf(ctx, n);
        return original && isBuilderDocument(original.content) ? composeDocument(original.content, n.content) : null;
      },
      date: (n: PostNode) => n.publishedAt?.toISOString() ?? null,
      modified: (n: PostNode) => n.updatedAt.toISOString(),
      author: async (n: PostNode, _: Args, ctx: GqlContext) => {
        if (!n.authorId) return n.authorName ? { id: "", name: n.authorName } : null;
        if (n.authorName !== undefined) return { id: n.authorId, name: n.authorName };
        return ctx.loaders.user.load(n.authorId);
      },
      featuredImage: async (n: PostNode, _: Args, ctx: GqlContext) => {
        const id = n.featuredImageId ?? (await originalOf(ctx, n))?.featuredImageId;
        return id ? ctx.loaders.media.load(id) : null;
      },
      terms: async (n: PostNode, a: { taxonomy?: string | null }, ctx: GqlContext) => {
        // Terms are shared by every language: a translation shows its original's.
        const source = (await originalOf(ctx, n)) ?? n;
        const termIds = source.termIds ?? (await ctx.loaders.draftTermIds.load(source.id));
        const terms = found(await ctx.loaders.term.loadMany(termIds));
        if (!a.taxonomy) return terms;
        const tax = (await ctx.loaders.taxonomies()).find((t) => t.key === a.taxonomy);
        return terms.filter((t) => t.taxonomyId === tax?.id);
      },
      customFields: async (n: PostNode, _: Args, ctx: GqlContext) => {
        const own = n.fields ?? (await ctx.loaders.draftFields.load(n.id));
        const original = await originalOf(ctx, n);
        if (!original) return { values: own, preview: n.preview } satisfies FieldObject;
        // Translatable fields from the translation, shared facts (prices, relations…) from the original.
        const base = original.fields ?? (await ctx.loaders.draftFields.load(original.id));
        return { values: mergeEntryFields(await fieldDefMap(ctx), base, own), preview: n.preview } satisfies FieldObject;
      },
      seo: (n: PostNode) => n.seo,
      parent: async (n: PostNode, _: Args, ctx: GqlContext) => {
        const parentId = n.locale ? (await originalOf(ctx, n))?.parentId : n.parentId;
        return parentId ? (n.preview ? ctx.loaders.previewPost : ctx.loaders.livePost).load(parentId) : null;
      },
      children: (n: PostNode, _: Args, ctx: GqlContext) => (n.preview ? ctx.loaders.previewChildren : ctx.loaders.liveChildren).load(n.id),
    },
    PostSeo: {
      image: (s: PostNode["seo"], _: Args, ctx: GqlContext) => (s.imageId ? ctx.loaders.media.load(s.imageId) : null),
    },

    Taxonomy: {
      terms: (t: Taxonomy, _: Args, ctx: GqlContext) => ctx.loaders.termsByTaxonomy.load(t.id),
      postTypes: async (t: { postTypes: { id: string }[] }, _: Args, ctx: GqlContext) => {
        const ids = new Set(t.postTypes.map((p) => p.id));
        return (await ctx.loaders.postTypes()).filter((p) => ids.has(p.id));
      },
    },
    Term: {
      taxonomy: async (t: Term, _: Args, ctx: GqlContext) => (await ctx.loaders.taxonomies()).find((x) => x.id === t.taxonomyId) ?? ctx.loaders.taxonomy.load(t.taxonomyId),
      parent: (t: Term, _: Args, ctx: GqlContext) => (t.parentId ? ctx.loaders.term.load(t.parentId) : null),
      children: (t: Term, _: Args, ctx: GqlContext) => ctx.loaders.termChildren.load(t.id),
    },

    MediaAsset: {
      srcSet: (m: MediaAsset) => {
        const v = variants(m);
        return v.length && m.width ? [...v.map((x) => `${x.url} ${x.width}w`), `${m.url} ${m.width}w`].join(", ") : null;
      },
      variants: (m: MediaAsset) => variants(m),
    },
  };
  return { ...(r as unknown as Record<string, Record<string, Resolver>>), ...customFieldResolvers(types) };
}
