import "server-only";
import type { Prisma } from "@prisma/client";
import { updateTag } from "next/cache";
import { z } from "zod";
import { nodeCapabilities, parentMap, isBoundField, type Violation } from "@/lib/builder/policy";
import { isBuilderDocument, type BuilderDocument } from "@/lib/builder/types";
import { contentField, SHARED_CONTENT_KINDS } from "@/lib/builder/widgets";
import { isEmptyValue, valueSchema, type FieldDef } from "@/lib/cms/fields";
import { SLUG_RE, uniqueSlug } from "@/lib/cms/slug";
import { defaultLocale, type SiteLocaleInfo } from "@/lib/i18n/locales";
import { emptyTranslation, isTranslatableField, isTranslationDocument, translatableNodes, type TranslationDocument } from "@/lib/i18n/translate";
import type { TenantContext } from "@/lib/tenant";
import { EditError, normaliseContent } from "../content-service";
import { contentHtml, entryPath } from "../cms/dynamic";
import { relaxRequired, sanitizeValue, verifyRefs } from "../cms/entries";
import { fieldDefFromRow } from "../cms/field-defs";
import { asJson, snapshotMeta } from "../cms/snapshot";
import { siteCacheTag } from "../public-site";
import { sanitizeRichText } from "../sanitize";
import { readSiteLocales } from "./locale-service";

/**
 * Translations of pages and entries.
 *
 * A translation is its own Post (with `locale` set) grouped with its
 * original through PostTranslation. What it may hold is deliberately narrow:
 *
 * - Builder pages: only content overrides for the original's existing
 *   elements. Layout, structure and styles always come from the original,
 *   and every override is checked here against the original's document and
 *   the designer's content locks, whatever the browser sends.
 * - Entries: own title, slug, excerpt, body, SEO and translatable fields.
 *   Prices, numbers, choices, relations and terms stay shared.
 */

export interface TranslationCell {
  postId: string;
  status: string;
  live: boolean;
  slug: string;
  /** Site path without the language prefix. */
  path: string;
}

async function siteLocales(t: TenantContext) {
  const locales = await readSiteLocales(t.site.id);
  const def = defaultLocale(locales);
  return { locales, def, secondary: locales.filter((l) => !l.isDefault) };
}

const canTranslate = (t: TenantContext) => t.can("content.edit") || t.can("design.layout");

function assertCanTranslate(t: TenantContext) {
  if (!canTranslate(t)) throw new EditError("You can't edit translations on this site", "forbidden");
}

/** Originals with the state of each of their translations, for the Translations screen. */
export async function listTranslations(t: TenantContext, opts: { postTypeId?: string | null; q?: string | null } = {}) {
  assertCanTranslate(t);
  const { locales, secondary } = await siteLocales(t);
  if (!secondary.length) return { locales, sources: [], postTypes: [] };
  const postTypes = await t.db.postType.findMany({ where: { key: { not: "template" } }, orderBy: { labelPlural: "asc" }, select: { id: true, labelPlural: true, key: true } });
  const sources = await t.db.post.findMany({
    where: {
      locale: "",
      status: { not: "TRASHED" },
      postType: { key: { not: "template" } },
      ...(opts.postTypeId ? { postTypeId: opts.postTypeId } : {}),
      ...(opts.q ? { title: { contains: opts.q, mode: "insensitive" as const } } : {}),
    },
    orderBy: [{ postType: { labelPlural: "asc" } }, { menuOrder: "asc" }, { updatedAt: "desc" }],
    take: 200,
    select: { id: true, title: true, slug: true, status: true, publishedRevisionId: true, postType: { select: { key: true, labelSingular: true, routePrefix: true } }, translation: { select: { translationId: true } } },
  });
  const groups = sources.map((s) => s.translation?.translationId).filter((x): x is string => !!x);
  const members = groups.length
    ? await t.db.postTranslation.findMany({
        where: { translationId: { in: groups }, post: { locale: { not: "" } } },
        select: { translationId: true, localeCode: true, post: { select: { id: true, status: true, slug: true, publishedRevisionId: true } } },
      })
    : [];
  return {
    locales,
    postTypes,
    sources: sources.map((s) => {
      const cells: Record<string, TranslationCell> = {};
      for (const m of members) {
        if (m.translationId !== s.translation?.translationId) continue;
        cells[m.localeCode] = { postId: m.post.id, status: m.post.status, live: !!m.post.publishedRevisionId && m.post.status !== "TRASHED", slug: m.post.slug, path: entryPath(s.postType, m.post.slug) };
      }
      return { id: s.id, title: s.title, path: entryPath(s.postType, s.slug), type: s.postType.labelSingular, live: !!s.publishedRevisionId, translations: cells };
    }),
  };
}

/** Starts a translation of `sourceId` in `locale` (or returns the one that exists). */
export async function createTranslation(t: TenantContext, input: { sourceId: string; locale: string }) {
  assertCanTranslate(t);
  if (!t.can("post.create") && !t.can("design.layout")) throw new EditError("You can't create entries on this site", "forbidden");
  const { def, secondary } = await siteLocales(t);
  const target = secondary.find((l) => l.code === input.locale);
  if (!def || !target) throw new EditError("Add that language under Settings → Languages first", "invalid");
  const source = await t.db.post.findUnique({ where: { id: input.sourceId }, include: { postType: true, translation: true } });
  if (!source || source.locale || source.postType.key === "template") throw new EditError("Original not found", "not_found");
  if (source.status === "TRASHED") throw new EditError("Restore the original from the trash first", "invalid");

  const translationId = source.translation?.translationId ?? source.id;
  const existing = await t.db.postTranslation.findFirst({ where: { translationId, localeCode: target.code }, select: { postId: true } });
  if (existing) return { id: existing.postId, created: false };

  const isHome = source.postType.key === "page" && source.slug === "home";
  const slug = isHome
    ? "home"
    : await uniqueSlug(source.slug, async (s) => !!(await t.db.post.findFirst({ where: { postTypeId: source.postTypeId, locale: target.code, slug: s }, select: { id: true } })));
  const draft = source.postType.usesBuilder ? emptyTranslation() : { type: "html", html: "" };

  const post = await t.db.$transaction(async (tx) => {
    if (!source.translation) await tx.postTranslation.create({ data: { siteId: t.site.id, translationId, postId: source.id, localeCode: def.code } });
    const post = await tx.post.create({
      data: { siteId: t.site.id, postTypeId: source.postTypeId, authorId: t.user.id, locale: target.code, title: source.title, slug, draft: asJson(draft), status: "DRAFT", parentId: null, menuOrder: source.menuOrder },
    });
    await tx.postTranslation.create({ data: { siteId: t.site.id, translationId, postId: post.id, localeCode: target.code } });
    await tx.postRevision.create({
      data: { siteId: t.site.id, postId: post.id, version: 1, kind: "DRAFT", title: post.title, document: asJson(draft), meta: asJson(await snapshotMeta(tx, post.id)), message: `Started the ${target.label} translation`, authorId: t.user.id },
    });
    await tx.auditLog.create({ data: { siteId: t.site.id, userId: t.user.id, action: "translation.create", targetId: post.id, data: { source: source.id, locale: target.code } } });
    return post;
  });
  return { id: post.id, created: true };
}

/** The original of a translation (the group's default-language member). */
async function originalOf(t: TenantContext, postId: string) {
  const group = await t.db.postTranslation.findUnique({ where: { postId }, select: { translationId: true } });
  if (!group) return null;
  return t.db.post.findFirst({
    where: { locale: "", translation: { translationId: group.translationId } },
    include: { postType: true, publishedRevision: true, fieldValues: { include: { field: true } } },
  });
}

/** The document translations are laid over: the original's working copy (what its designer sees). */
const sourceDocument = (source: { draft: unknown }): BuilderDocument | null => (isBuilderDocument(source.draft) ? source.draft : null);

async function translatableDefs(t: TenantContext) {
  const rows = await t.db.customField.findMany({ where: { group: { active: true } }, orderBy: [{ group: { order: "asc" } }, { order: "asc" }] });
  return rows.map(fieldDefFromRow).filter(isTranslatableField);
}

/** Everything the side-by-side drawer needs. */
export async function getTranslationEditor(t: TenantContext, postId: string) {
  assertCanTranslate(t);
  const post = await t.db.post.findUnique({ where: { id: postId }, include: { postType: true, fieldValues: { include: { field: true } } } });
  if (!post || !post.locale) return null;
  const source = await originalOf(t, post.id);
  if (!source) return null;
  const { locales } = await siteLocales(t);
  const locale = locales.find((l) => l.code === post.locale) ?? null;
  const version = (await t.db.postRevision.aggregate({ where: { postId: post.id }, _max: { version: true } }))._max.version ?? 0;

  const doc = source.postType.usesBuilder ? sourceDocument(source) : null;
  const parents = doc ? parentMap(doc) : null;
  const nodes = doc
    ? translatableNodes(doc).map((n) => ({
        ...n,
        locked: !nodeCapabilities(doc, n.id, { permissions: t.permissions }, parents!).canEditContent,
        source: Object.fromEntries(n.fields.map((f) => [f.key, doc.nodes[n.id].props[f.key] ?? null])),
      }))
    : [];
  const overrides = isTranslationDocument(post.draft) ? post.draft.overrides : {};

  const designerFields = t.can("schema.manage");
  const sourceValues = Object.fromEntries(source.fieldValues.map((v) => [v.field.key, v.value]));
  const ownValues = Object.fromEntries(post.fieldValues.map((v) => [v.field.key, v.value]));
  const fields = (await translatableDefs(t))
    .filter((d) => !isEmptyValue(sourceValues[d.key]) || !isEmptyValue(ownValues[d.key]))
    .map((d) => ({ key: d.key, label: d.label, type: d.type, locked: !d.clientEditable && !designerFields, source: sourceValues[d.key] ?? null, value: ownValues[d.key] ?? null }));

  return {
    locale,
    defaultLocale: defaultLocale(locales),
    translation: {
      id: post.id,
      version,
      status: post.status,
      live: !!post.publishedRevisionId,
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt ?? "",
      content: contentHtml(post.draft),
      seoTitle: post.seoTitle ?? "",
      seoDescription: post.seoDescription ?? "",
    },
    source: {
      id: source.id,
      title: source.title,
      slug: source.slug,
      path: entryPath(source.postType, source.slug),
      excerpt: source.excerpt ?? "",
      content: contentHtml(source.draft),
      seoTitle: source.seoTitle ?? "",
      seoDescription: source.seoDescription ?? "",
      live: !!source.publishedRevisionId,
      isHome: source.postType.key === "page" && source.slug === "home",
      usesBuilder: source.postType.usesBuilder,
      typeLabel: source.postType.labelSingular,
      routePrefix: source.postType.key === "page" ? null : (source.postType.routePrefix ?? source.postType.key),
    },
    nodes,
    overrides,
    fields,
    canPublish: t.can("post.publish"),
  };
}

export const translationInputSchema = z
  .object({
    postId: z.string().min(1).max(40),
    baseVersion: z.number().int().nonnegative(),
    intent: z.enum(["draft", "publish"]),
    title: z.string().trim().min(1, "Add a title").max(200),
    slug: z.string().trim().max(160),
    excerpt: z.string().max(500).nullish(),
    content: z.string().max(500_000).nullish(),
    seoTitle: z.string().max(70).nullish(),
    seoDescription: z.string().max(170).nullish(),
    fields: z.record(z.string(), z.unknown()).default({}),
    overrides: z.record(z.string().max(64), z.record(z.string().max(64), z.unknown())).default({}),
  })
  // Anything else (a document, styles, locks, terms, a parent) is structure, and structure is shared.
  .strict();

export type TranslationInput = z.input<typeof translationInputSchema>;

/**
 * Checks content overrides against the original's document and the
 * designer's locks, and resolves images from this site's media library.
 */
async function validateOverrides(t: TenantContext, doc: BuilderDocument, raw: TranslationDocument["overrides"], previous: TranslationDocument["overrides"], violations: Violation[]) {
  const parents = parentMap(doc);
  const clone = structuredClone(doc);
  const changed: { nodeId: string; field: string }[] = [];
  const out: TranslationDocument["overrides"] = {};
  for (const [nodeId, fields] of Object.entries(raw)) {
    const node = doc.nodes[nodeId];
    if (!node) {
      violations.push({ nodeId, message: "Translations can't add or remove elements; the layout comes from the original" });
      continue;
    }
    const caps = nodeCapabilities(doc, nodeId, { permissions: t.permissions }, parents);
    for (const [key, value] of Object.entries(fields)) {
      const def = contentField(node.type, key);
      if (!def) {
        violations.push({ nodeId, message: `"${key}" isn't text, an image or a link. Layout and styles are shared by every language.` });
        continue;
      }
      if (SHARED_CONTENT_KINDS.has(def.kind)) {
        violations.push({ nodeId, message: `${def.label} is the same in every language` });
        continue;
      }
      if (isBoundField(doc, nodeId, key)) {
        violations.push({ nodeId, message: `${def.label} shows dynamic data, which comes from the translated entry` });
        continue;
      }
      const same = JSON.stringify(previous[nodeId]?.[key] ?? null) === JSON.stringify(value ?? null);
      if (!caps.canEditContent && !same) {
        violations.push({ nodeId, message: `${def.label} is locked by the designer` });
        continue;
      }
      if (isEmptyValue(value) || (typeof value === "object" && value && "assetId" in value && !(value as { assetId?: unknown }).assetId)) continue;
      clone.nodes[nodeId] = { ...clone.nodes[nodeId], props: { ...clone.nodes[nodeId].props, [key]: value } };
      changed.push({ nodeId, field: key });
    }
  }
  // Throws with its own messages when a value is malformed or an image isn't this site's.
  if (!violations.length) await normaliseContent(t, clone, changed);
  for (const { nodeId, field } of changed) (out[nodeId] ??= {})[field] = clone.nodes[nodeId].props[field];
  return out;
}

export async function saveTranslation(t: TenantContext, raw: TranslationInput) {
  assertCanTranslate(t);
  const parsed = translationInputSchema.safeParse(raw);
  if (!parsed.success) {
    const extra = parsed.error.issues.find((i) => i.code === "unrecognized_keys");
    throw new EditError(extra ? "Translations can only change text, images, links and SEO. Layout and structure are shared by every language." : (parsed.error.issues[0]?.message ?? "Invalid translation"), extra ? "guardrail" : "invalid");
  }
  const input = parsed.data;
  if (input.intent === "publish" && !t.can("post.publish")) throw new EditError("You can't publish on this site", "forbidden");

  const post = await t.db.post.findUnique({ where: { id: input.postId }, include: { postType: true, fieldValues: { include: { field: true } } } });
  if (!post || !post.locale) throw new EditError("Translation not found", "not_found");
  if (post.status === "TRASHED") throw new EditError("Restore this translation from the trash first", "invalid");
  const source = await originalOf(t, post.id);
  if (!source) throw new EditError("This translation's original no longer exists", "invalid");

  const current = (await t.db.postRevision.aggregate({ where: { postId: post.id }, _max: { version: true } }))._max.version ?? 0;
  if (input.baseVersion !== current) throw new EditError("This translation changed since you opened it. Reload to get the latest version.", "conflict");
  const lock = await t.db.editLock.findUnique({ where: { postId: post.id } });
  if (lock && lock.userId !== t.user.id && lock.expiresAt > new Date()) throw new EditError("Someone else is editing this translation", "locked");

  const violations: Violation[] = [];
  const v = (nodeId: string, message: string) => violations.push({ nodeId, message });

  const isHome = source.postType.key === "page" && source.slug === "home";
  const slug = isHome ? "home" : input.slug || post.slug;
  if (!SLUG_RE.test(slug)) v("slug", "Slugs use lowercase letters, numbers and hyphens");
  if (slug !== post.slug) {
    if (post.publishedRevisionId && !t.can("post.publish")) v("slug", "Only publishers can change the address of a live translation");
    const clash = await t.db.post.findFirst({ where: { postTypeId: post.postTypeId, locale: post.locale, slug, id: { not: post.id } }, select: { id: true } });
    if (clash) v("slug", "Another entry in this language already uses that address");
  }

  let draft: Prisma.InputJsonValue;
  if (source.postType.usesBuilder) {
    const doc = sourceDocument(source);
    if (!doc) throw new EditError("The original page has no layout yet", "invalid");
    const previous = isTranslationDocument(post.draft) ? post.draft.overrides : {};
    if (input.content) v("content", "Pages are translated element by element");
    draft = asJson({ ...emptyTranslation(), overrides: await validateOverrides(t, doc, input.overrides, previous, violations) });
  } else {
    if (Object.keys(input.overrides).length) v("overrides", "Only builder pages have element overrides");
    draft = asJson({ type: "html", html: sanitizeRichText(input.content ?? "") });
  }

  // Translatable custom fields only; everything else always comes from the original.
  const defs = new Map((await translatableDefs(t)).map((d) => [d.key, d]));
  const designerFields = t.can("schema.manage");
  const existing = new Map(post.fieldValues.map((fv) => [fv.field.key, fv.value]));
  const next = new Map<FieldDef, unknown>();
  for (const [key, value] of Object.entries(input.fields)) {
    const def = defs.get(key);
    if (!def) {
      v(key, `"${key}" is shared by every language and can't be translated`);
      continue;
    }
    if (!def.clientEditable && !designerFields) {
      if (JSON.stringify(existing.get(key) ?? null) !== JSON.stringify(value ?? null)) v(key, `${def.label} is locked by the designer`);
      continue;
    }
    const result = valueSchema(relaxRequired(def)).safeParse(value ?? null);
    if (!result.success) {
      for (const issue of result.error.issues) v(key, `${def.label}: ${issue.message}`);
      continue;
    }
    next.set(def, sanitizeValue(def, result.data));
  }
  violations.push(...(await verifyRefs(t, [...next.keys()], Object.fromEntries([...next].map(([d, val]) => [d.key, val])))));
  if (violations.length) throw new EditError("Some fields need fixing", "invalid", violations);

  const version = current + 1;
  const now = new Date();
  await t.db.$transaction(async (tx) => {
    await tx.post.update({
      where: { id: post.id },
      data: {
        title: input.title,
        slug,
        excerpt: input.excerpt?.trim() || null,
        draft,
        seoTitle: input.seoTitle?.trim() || null,
        seoDescription: input.seoDescription?.trim() || null,
        ...(input.intent === "publish" ? { status: "PUBLISHED", publishedAt: post.publishedAt ?? now, scheduledAt: null, scheduledRevisionId: null } : {}),
      },
    });
    for (const [def, value] of next) {
      if (isEmptyValue(value)) await tx.fieldValue.deleteMany({ where: { postId: post.id, fieldId: def.id! } });
      else
        await tx.fieldValue.upsert({
          where: { postId_fieldId: { postId: post.id, fieldId: def.id! } },
          create: { siteId: t.site.id, postId: post.id, fieldId: def.id!, value: asJson(value) },
          update: { value: asJson(value) },
        });
    }
    const revision = await tx.postRevision.create({
      data: { siteId: t.site.id, postId: post.id, version, kind: input.intent === "publish" ? "PUBLISHED" : "DRAFT", title: input.title, document: draft, meta: asJson(await snapshotMeta(tx, post.id)), authorId: t.user.id },
    });
    if (input.intent === "publish") await tx.post.update({ where: { id: post.id }, data: { publishedRevisionId: revision.id } });
    await tx.auditLog.create({ data: { siteId: t.site.id, userId: t.user.id, action: `translation.${input.intent}`, targetId: post.id, data: { version } } });
  });
  if (input.intent === "publish") updateTag(siteCacheTag(t.site.id));
  const saved = await t.db.post.findUniqueOrThrow({ where: { id: post.id }, select: { status: true, slug: true } });
  return { version, status: saved.status, slug: saved.slug };
}

/** Members of an entry's translation group, for language menus in the admin. */
export async function translationMenu(t: TenantContext, postId: string, locales: SiteLocaleInfo[]) {
  const group = await t.db.postTranslation.findUnique({ where: { postId }, select: { translationId: true } });
  const members = group ? await t.db.postTranslation.findMany({ where: { translationId: group.translationId }, select: { localeCode: true, post: { select: { id: true, status: true, publishedRevisionId: true } } } }) : [];
  return locales.map((l) => {
    const m = members.find((x) => x.localeCode === l.code);
    return { code: l.code, label: l.label, isDefault: l.isDefault, postId: m?.post.id ?? (l.isDefault ? postId : null), live: !!m?.post.publishedRevisionId };
  });
}
