import "server-only";
import type { PostStatus, Prisma, RevisionKind } from "@prisma/client";
import { updateTag } from "next/cache";
import { z } from "zod";
import type { Violation } from "@/lib/builder/policy";
import { collectRefs, emptyRefs, isEmptyValue, valueSchema, type FieldDef, type FlexibleBlock, type RepeaterRow } from "@/lib/cms/fields";
import { matchesLocation } from "@/lib/cms/location";
import { SLUG_RE, slugFromRule, uniqueSlug } from "@/lib/cms/slug";
import type { TenantContext } from "@/lib/tenant";
import { EditError } from "../content-service";
import { siteCacheTag } from "../public-site";
import { sanitizeRichText } from "../sanitize";
import type { RevisionMeta } from "./dynamic";
import { fieldDefFromRow } from "./field-defs";
import { asJson, snapshotMeta } from "./snapshot";

/**
 * Entry write path for the CMS screens: create, save (draft, submit,
 * publish, schedule), bulk actions and rollback. Builder pages share it for
 * everything outside their canvas document (title, slug, fields, SEO).
 */

export type EntryIntent = "draft" | "submit" | "publish" | "schedule";

const INTENT_KIND: Record<EntryIntent, RevisionKind> = { draft: "DRAFT", submit: "SUBMITTED", publish: "PUBLISHED", schedule: "SCHEDULED" };

export interface PageTemplate {
  key: string;
  label: string;
}

export function postTypeTemplates(metadata: unknown): PageTemplate[] {
  const list = (metadata as { templates?: PageTemplate[] } | null)?.templates;
  return Array.isArray(list) ? list.filter((t) => t && typeof t.key === "string" && typeof t.label === "string") : [];
}

export function blankBuilderDoc() {
  return {
    version: 1,
    rootId: "root",
    nodes: { root: { id: "root", type: "section", tag: "main", props: {}, style: { desktop: { display: "flex", flexDirection: "column", gap: "var(--space-md)", padding: "var(--space-xl) 2rem" } }, children: [] } },
  };
}

async function latestVersion(t: TenantContext, postId: string) {
  const agg = await t.db.postRevision.aggregate({ where: { postId }, _max: { version: true } });
  return agg._max.version ?? 0;
}

function canEdit(t: TenantContext, post: { authorId: string | null }) {
  return t.can("post.editAny") || t.can("design.layout") || (t.can("post.create") && post.authorId === t.user.id);
}

async function assertNoForeignLock(t: TenantContext, postId: string) {
  const lock = await t.db.editLock.findUnique({ where: { postId }, include: { user: { select: { name: true, email: true } } } });
  if (lock && lock.userId !== t.user.id && lock.expiresAt > new Date()) {
    throw new EditError(`${lock.user.name ?? lock.user.email} is editing this page right now. Try again when they're done.`, "locked");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Create
// ─────────────────────────────────────────────────────────────────────────────

export async function createEntry(t: TenantContext, input: { postTypeId: string; title?: string }) {
  t.assert("post.create");
  const postType = await t.db.postType.findUnique({ where: { id: input.postTypeId } });
  if (!postType || postType.key === "template") throw new EditError("Post type not found", "not_found");
  if (postType.key === "page" && !t.can("design.layout")) throw new EditError("Only designers can add pages", "forbidden");

  const title = input.title?.trim().slice(0, 200) || `New ${postType.labelSingular.toLowerCase()}`;
  const slug = await uniqueSlug(slugFromRule(postType.slugRule, title), async (s) => !!(await t.db.post.findFirst({ where: { postTypeId: postType.id, slug: s }, select: { id: true } })));
  const draft = postType.usesBuilder ? blankBuilderDoc() : { type: "html", html: "" };

  const post = await t.db.$transaction(async (tx) => {
    const post = await tx.post.create({
      data: { siteId: t.site.id, postTypeId: postType.id, authorId: t.user.id, title, slug, draft: asJson(draft), status: "DRAFT" },
    });
    await tx.postRevision.create({
      data: { siteId: t.site.id, postId: post.id, version: 1, kind: "DRAFT", title, document: asJson(draft), meta: asJson(await snapshotMeta(tx, post.id)), message: "Created", authorId: t.user.id },
    });
    await tx.auditLog.create({ data: { siteId: t.site.id, userId: t.user.id, action: "post.create", targetId: post.id } });
    return post;
  });
  return { id: post.id };
}

// ─────────────────────────────────────────────────────────────────────────────
// Save
// ─────────────────────────────────────────────────────────────────────────────

export const entryInputSchema = z.object({
  postId: z.string().min(1),
  baseVersion: z.number().int().nonnegative(),
  intent: z.enum(["draft", "submit", "publish", "schedule"]),
  scheduledAt: z.string().datetime({ offset: true }).nullish(),
  message: z.string().max(500).nullish(),
  title: z.string().trim().min(1, "Add a title").max(200),
  slug: z.string().trim().max(160),
  excerpt: z.string().max(500).nullish(),
  content: z.string().max(500_000).nullish(),
  featuredImageId: z.string().max(40).nullish(),
  template: z.string().max(40).nullish(),
  parentId: z.string().max(40).nullish(),
  menuOrder: z.number().int().min(-10_000).max(10_000).optional(),
  termIds: z.array(z.string().max(40)).max(200),
  fields: z.record(z.string(), z.unknown()),
  seo: z.object({
    seoTitle: z.string().max(70).nullish(),
    seoDescription: z.string().max(170).nullish(),
    noIndex: z.boolean().optional(),
  }),
});

export type EntryInput = z.input<typeof entryInputSchema>;

/** Rich text anywhere in a value (including inside repeater rows and blocks) gets sanitised. */
function sanitizeValue(def: FieldDef, value: unknown): unknown {
  if (isEmptyValue(value)) return value;
  switch (def.type) {
    case "RICH_TEXT":
      return sanitizeRichText(String(value));
    case "REPEATER":
      return (value as RepeaterRow[]).map((row) =>
        Object.fromEntries((def.config.subFields ?? []).map((sf) => [sf.key, sanitizeValue(sf, row[sf.key] ?? null)])),
      );
    case "FLEXIBLE":
      return (value as FlexibleBlock[]).map((block) => {
        const layout = def.config.layouts?.find((l) => l.key === block.layout);
        return { layout: block.layout, values: Object.fromEntries((layout?.subFields ?? []).map((sf) => [sf.key, sanitizeValue(sf, block.values[sf.key] ?? null)])) };
      });
    default:
      return value;
  }
}

/** Drafts may leave required fields empty; submitting, publishing and scheduling may not. */
function relaxRequired(def: FieldDef): FieldDef {
  return {
    ...def,
    required: false,
    config: {
      ...def.config,
      minRows: undefined,
      subFields: def.config.subFields?.map(relaxRequired),
      layouts: def.config.layouts?.map((l) => ({ ...l, subFields: l.subFields.map(relaxRequired) })),
    },
  };
}

/** Proves every id a set of values points at belongs to this site (and fits the field's config). */
async function verifyRefs(t: TenantContext, defs: FieldDef[], values: Record<string, unknown>): Promise<Violation[]> {
  const violations: Violation[] = [];
  for (const def of defs) {
    const refs = emptyRefs();
    collectRefs(def, values[def.key], refs);
    const [assets, posts, members, terms] = await Promise.all([
      refs.assets.size ? t.db.mediaAsset.findMany({ where: { id: { in: [...refs.assets] } }, select: { id: true, mimeType: true } }) : [],
      refs.posts.size ? t.db.post.findMany({ where: { id: { in: [...refs.posts] }, status: { not: "TRASHED" } }, select: { id: true, postTypeId: true } }) : [],
      refs.users.size ? t.db.membership.findMany({ where: { userId: { in: [...refs.users] } }, select: { userId: true } }) : [],
      refs.terms.size ? t.db.term.findMany({ where: { id: { in: [...refs.terms] } }, select: { id: true, taxonomyId: true } }) : [],
    ]);
    const bad = (msg: string) => violations.push({ nodeId: def.key, message: `${def.label}: ${msg}` });
    if (assets.length !== refs.assets.size) bad("a file isn't in this site's media library");
    if ((def.type === "IMAGE" || def.type === "GALLERY") && assets.some((a) => !a.mimeType.startsWith("image/"))) bad("pick images only");
    if (posts.length !== refs.posts.size) bad("a linked entry no longer exists");
    const allowed = def.config.postTypeIds ?? [];
    if (allowed.length && posts.some((p) => !allowed.includes(p.postTypeId))) bad("a linked entry is the wrong type");
    if (members.length !== refs.users.size) bad("that person isn't on this site");
    if (terms.length !== refs.terms.size) bad("a term no longer exists");
    if (def.type === "TAXONOMY" && terms.some((x) => x.taxonomyId !== def.config.taxonomyId)) bad("a term is from another taxonomy");
  }
  return violations;
}

async function wouldCycle(t: TenantContext, postId: string, parentId: string) {
  let current: string | null = parentId;
  for (let i = 0; current && i < 50; i++) {
    if (current === postId) return true;
    const p: { parentId: string | null } | null = await t.db.post.findUnique({ where: { id: current }, select: { parentId: true } });
    current = p?.parentId ?? null;
  }
  return false;
}

export async function saveEntry(t: TenantContext, raw: EntryInput) {
  const parsed = entryInputSchema.safeParse(raw);
  if (!parsed.success) throw new EditError(parsed.error.issues[0]?.message ?? "Invalid entry", "invalid");
  const input = parsed.data;

  const post = await t.db.post.findUnique({
    where: { id: input.postId },
    include: { postType: { include: { taxonomies: { select: { id: true } } } }, fieldValues: { include: { field: true } } },
  });
  if (!post || post.postType.key === "template") throw new EditError("Entry not found", "not_found");
  if (!canEdit(t, post)) throw new EditError("You can't edit this entry", "forbidden");
  if (post.status === "TRASHED") throw new EditError("Restore this entry from the trash before editing it", "invalid");
  if ((input.intent === "publish" || input.intent === "schedule") && !t.can("post.publish")) throw new EditError("You can't publish on this site", "forbidden");
  if (input.intent === "submit" && !t.can("post.submit")) throw new EditError("You can't submit for review", "forbidden");

  const current = await latestVersion(t, post.id);
  if (input.baseVersion !== current) throw new EditError("This entry changed since you opened it. Reload to get the latest version.", "conflict");
  await assertNoForeignLock(t, post.id);

  const violations: Violation[] = [];
  const v = (nodeId: string, message: string) => violations.push({ nodeId, message });

  // Slug: unique per post type; changing a live URL is a publishing decision.
  const slug = input.slug || post.slug;
  if (!SLUG_RE.test(slug)) v("slug", "Slugs use lowercase letters, numbers and hyphens");
  if (slug !== post.slug) {
    if (post.publishedRevisionId && !t.can("post.publish")) v("slug", "Only publishers can change the address of a live entry");
    if (post.slug === "home" && post.postType.key === "page") v("slug", "The home page's address can't change");
    const clash = await t.db.post.findFirst({ where: { postTypeId: post.postTypeId, slug, id: { not: post.id } }, select: { id: true } });
    if (clash) v("slug", "Another entry already uses that address");
  }

  let featuredImageId: string | null = input.featuredImageId ?? null;
  if (featuredImageId) {
    const asset = await t.db.mediaAsset.findUnique({ where: { id: featuredImageId }, select: { mimeType: true } });
    if (!asset || !asset.mimeType.startsWith("image/")) {
      v("featuredImage", "Pick an image from this site's media library");
      featuredImageId = post.featuredImageId;
    }
  }

  const templates = postTypeTemplates(post.postType.metadata);
  const template = input.template && input.template !== "default" ? input.template : null;
  if (template && !templates.some((x) => x.key === template)) v("template", "Unknown page template");

  const parentId = input.parentId || null;
  if (parentId) {
    if (!post.postType.hierarchical) v("parent", `${post.postType.labelPlural} can't have parents`);
    const parent = await t.db.post.findUnique({ where: { id: parentId }, select: { postTypeId: true } });
    if (!parent || parent.postTypeId !== post.postTypeId) v("parent", "Pick a parent of the same type");
    else if (await wouldCycle(t, post.id, parentId)) v("parent", "An entry can't be its own ancestor");
  }

  const termIds = [...new Set(input.termIds)];
  if (termIds.length) {
    const allowed = new Set(post.postType.taxonomies.map((x) => x.id));
    const terms = await t.db.term.findMany({ where: { id: { in: termIds } }, select: { taxonomyId: true } });
    if (terms.length !== termIds.length || terms.some((x) => !allowed.has(x.taxonomyId))) v("terms", "A category or tag doesn't belong to this post type");
  }

  // Custom fields: only groups whose location rules match the entry as submitted.
  const groups = await t.db.fieldGroup.findMany({ where: { active: true }, include: { fields: { orderBy: { order: "asc" } } }, orderBy: { order: "asc" } });
  const subject = { postTypeId: post.postTypeId, template, termIds, parentId };
  const applicable = groups.filter((g) => matchesLocation(g.location, subject)).flatMap((g) => g.fields.map(fieldDefFromRow));
  const existing = new Map(post.fieldValues.map((fv) => [fv.fieldId, fv.value]));
  const strict = input.intent !== "draft";
  const nextValues = new Map<string, unknown>();
  const designerFields = t.can("schema.manage");

  for (const def of applicable) {
    const locked = !def.clientEditable && !designerFields;
    // Fields the designer keeps for themselves keep their stored value, whatever was sent.
    const submitted = locked ? (existing.get(def.id!) ?? null) : (input.fields[def.key] ?? null);
    const result = valueSchema(strict ? def : relaxRequired(def)).safeParse(submitted);
    if (!result.success) {
      for (const issue of result.error.issues) v(def.key, issue.message);
      continue;
    }
    nextValues.set(def.id!, sanitizeValue(def, result.data));
  }
  violations.push(...(await verifyRefs(t, applicable, Object.fromEntries(applicable.map((d) => [d.key, nextValues.get(d.id!)])))));

  let scheduledAt: Date | null = null;
  if (input.intent === "schedule") {
    scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
    if (!scheduledAt || scheduledAt.getTime() < Date.now() + 5_000) v("scheduledAt", "Pick a time in the future");
  }
  if (violations.length) throw new EditError("Some fields need fixing", "invalid", violations);

  const usesBuilder = post.postType.usesBuilder;
  const draft = usesBuilder ? post.draft : { type: "html", html: sanitizeRichText(input.content ?? "") };
  const version = current + 1;
  const now = new Date();

  const statusData: Prisma.PostUncheckedUpdateInput =
    input.intent === "publish"
      ? { status: "PUBLISHED", publishedAt: post.publishedAt ?? now, scheduledAt: null, scheduledRevisionId: null }
      : input.intent === "schedule"
        ? { status: "SCHEDULED", scheduledAt }
        : input.intent === "submit"
          ? { status: "PENDING_REVIEW" }
          : {};

  await t.db.$transaction(async (tx) => {
    await tx.post.update({
      where: { id: post.id },
      data: {
        title: input.title,
        slug,
        excerpt: input.excerpt?.trim() || null,
        draft: asJson(draft),
        featuredImageId,
        template,
        parentId,
        ...(input.menuOrder !== undefined ? { menuOrder: input.menuOrder } : {}),
        seoTitle: input.seo.seoTitle?.trim() || null,
        seoDescription: input.seo.seoDescription?.trim() || null,
        noIndex: !!input.seo.noIndex,
        ...statusData,
      },
    });
    for (const [fieldId, value] of nextValues) {
      if (isEmptyValue(value)) await tx.fieldValue.deleteMany({ where: { postId: post.id, fieldId } });
      else
        await tx.fieldValue.upsert({
          where: { postId_fieldId: { postId: post.id, fieldId } },
          create: { siteId: t.site.id, postId: post.id, fieldId, value: asJson(value) },
          update: { value: asJson(value) },
        });
    }
    await tx.postTerm.deleteMany({ where: { postId: post.id } });
    if (termIds.length) await tx.postTerm.createMany({ data: termIds.map((termId) => ({ postId: post.id, termId })) });

    const revision = await tx.postRevision.create({
      data: {
        siteId: t.site.id,
        postId: post.id,
        version,
        kind: INTENT_KIND[input.intent],
        title: input.title,
        document: asJson(draft),
        meta: asJson(await snapshotMeta(tx, post.id)),
        message: input.message?.slice(0, 500) || (input.intent === "schedule" ? `Scheduled for ${scheduledAt!.toISOString()}` : null),
        authorId: t.user.id,
      },
    });
    if (input.intent === "publish") await tx.post.update({ where: { id: post.id }, data: { publishedRevisionId: revision.id } });
    if (input.intent === "schedule") await tx.post.update({ where: { id: post.id }, data: { scheduledRevisionId: revision.id } });
    await tx.auditLog.create({ data: { siteId: t.site.id, userId: t.user.id, action: `post.${input.intent}`, targetId: post.id, data: { version } } });
  });

  if (input.intent === "publish") updateTag(siteCacheTag(t.site.id));
  const saved = await t.db.post.findUniqueOrThrow({ where: { id: post.id }, select: { status: true, slug: true } });
  return { version, status: saved.status, slug: saved.slug };
}

// ─────────────────────────────────────────────────────────────────────────────
// Bulk actions
// ─────────────────────────────────────────────────────────────────────────────

export type BulkAction = "publish" | "draft" | "trash" | "restore" | "delete" | "duplicate";

/** Required fields that are empty in a meta snapshot, for publishing without the form. */
async function missingRequired(t: TenantContext, post: { postTypeId: string; template: string | null; parentId: string | null }, meta: RevisionMeta) {
  const groups = await t.db.fieldGroup.findMany({ where: { active: true }, include: { fields: true } });
  const subject = { postTypeId: post.postTypeId, template: post.template, termIds: meta.termIds ?? [], parentId: post.parentId };
  return groups
    .filter((g) => matchesLocation(g.location, subject))
    .flatMap((g) => g.fields)
    .filter((f) => f.required && isEmptyValue(meta.fields?.[f.key]))
    .map((f) => f.label);
}

export async function bulkAction(t: TenantContext, input: { ids: string[]; action: BulkAction }) {
  const ids = [...new Set(input.ids)].slice(0, 200);
  const posts = await t.db.post.findMany({ where: { id: { in: ids }, postType: { key: { not: "template" } } }, include: { postType: true } });
  const done: string[] = [];
  const skipped: { id: string; title: string; reason: string }[] = [];
  let liveChanged = false;
  const skip = (p: { id: string; title: string }, reason: string) => skipped.push({ id: p.id, title: p.title, reason });

  for (const post of posts) {
    const lock = await t.db.editLock.findUnique({ where: { postId: post.id } });
    if (lock && lock.userId !== t.user.id && lock.expiresAt > new Date() && input.action !== "duplicate") {
      skip(post, "someone is editing it");
      continue;
    }
    switch (input.action) {
      case "publish": {
        if (!t.can("post.publish")) return forbidden("publish");
        if (post.status === "TRASHED") {
          skip(post, "it's in the trash");
          continue;
        }
        const meta = await snapshotMeta(t.db, post.id);
        const missing = await missingRequired(t, post, meta);
        if (missing.length) {
          skip(post, `required fields are empty: ${missing.join(", ")}`);
          continue;
        }
        const version = (await latestVersion(t, post.id)) + 1;
        await t.db.$transaction(async (tx) => {
          const rev = await tx.postRevision.create({
            data: { siteId: t.site.id, postId: post.id, version, kind: "PUBLISHED", title: post.title, document: asJson(post.draft), meta: asJson(meta), message: "Bulk publish", authorId: t.user.id },
          });
          await tx.post.update({
            where: { id: post.id },
            data: { status: "PUBLISHED", publishedRevisionId: rev.id, publishedAt: post.publishedAt ?? new Date(), scheduledAt: null, scheduledRevisionId: null },
          });
        });
        liveChanged = true;
        break;
      }
      case "draft":
        if (!t.can("post.publish")) return forbidden("unpublish");
        if (post.postType.key === "page" && post.slug === "home") {
          skip(post, "the home page must stay live");
          continue;
        }
        await t.db.post.update({ where: { id: post.id }, data: { status: "DRAFT", publishedRevisionId: null, scheduledAt: null, scheduledRevisionId: null } });
        liveChanged ||= !!post.publishedRevisionId;
        break;
      case "trash": {
        const ownUnpublished = post.authorId === t.user.id && !post.publishedRevisionId && t.can("post.create");
        if (!t.can("post.publish") && !ownUnpublished) {
          skip(post, "you can only trash your own unpublished drafts");
          continue;
        }
        if (post.postType.key === "page" && post.slug === "home") {
          skip(post, "the home page can't be trashed");
          continue;
        }
        await t.db.post.update({
          where: { id: post.id },
          data: { status: "TRASHED", trashedAt: new Date(), publishedRevisionId: null, scheduledAt: null, scheduledRevisionId: null },
        });
        liveChanged ||= !!post.publishedRevisionId;
        break;
      }
      case "restore":
        if (post.status !== "TRASHED") continue;
        if (!t.can("post.publish") && post.authorId !== t.user.id) {
          skip(post, "you can only restore your own entries");
          continue;
        }
        await t.db.post.update({ where: { id: post.id }, data: { status: "DRAFT", trashedAt: null } });
        break;
      case "delete":
        if (!t.can("post.publish")) return forbidden("delete");
        if (post.status !== "TRASHED") {
          skip(post, "move it to the trash first");
          continue;
        }
        await t.db.post.delete({ where: { id: post.id } });
        break;
      case "duplicate": {
        if (!t.can("post.create") || (post.postType.key === "page" && !t.can("design.layout"))) {
          skip(post, "you can't create this kind of entry");
          continue;
        }
        await duplicateEntry(t, post.id);
        break;
      }
    }
    done.push(post.id);
    await t.db.auditLog.create({ data: { siteId: t.site.id, userId: t.user.id, action: `post.bulk.${input.action}`, targetId: post.id } });
  }
  if (liveChanged) updateTag(siteCacheTag(t.site.id));
  return { done: done.length, skipped };
}

function forbidden(what: string): never {
  throw new EditError(`You can't ${what} entries on this site`, "forbidden");
}

async function duplicateEntry(t: TenantContext, postId: string) {
  const src = await t.db.post.findUniqueOrThrow({ where: { id: postId }, include: { fieldValues: true, terms: true } });
  const title = `${src.title} (copy)`.slice(0, 200);
  const slug = await uniqueSlug(`${src.slug}-copy`, async (s) => !!(await t.db.post.findFirst({ where: { postTypeId: src.postTypeId, slug: s }, select: { id: true } })));
  return t.db.$transaction(async (tx) => {
    const post = await tx.post.create({
      data: {
        siteId: t.site.id, postTypeId: src.postTypeId, authorId: t.user.id, parentId: src.parentId, title, slug, status: "DRAFT",
        excerpt: src.excerpt, draft: asJson(src.draft), featuredImageId: src.featuredImageId, template: src.template, menuOrder: src.menuOrder,
        seoTitle: src.seoTitle, seoDescription: src.seoDescription, noIndex: src.noIndex,
      },
    });
    if (src.fieldValues.length) {
      await tx.fieldValue.createMany({ data: src.fieldValues.map((fv) => ({ siteId: t.site.id, postId: post.id, fieldId: fv.fieldId, value: asJson(fv.value) })) });
    }
    if (src.terms.length) await tx.postTerm.createMany({ data: src.terms.map((x) => ({ postId: post.id, termId: x.termId })) });
    await tx.postRevision.create({
      data: { siteId: t.site.id, postId: post.id, version: 1, kind: "DRAFT", title, document: asJson(src.draft), meta: asJson(await snapshotMeta(tx, post.id)), message: `Duplicated from ${src.title}`, authorId: t.user.id },
    });
    return post;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Revisions
// ─────────────────────────────────────────────────────────────────────────────

export async function listEntryRevisions(t: TenantContext, postId: string) {
  const post = await t.db.post.findUnique({ where: { id: postId }, select: { id: true, title: true, authorId: true, publishedRevisionId: true, scheduledRevisionId: true } });
  if (!post || !canEdit(t, post)) throw new EditError("Entry not found", "not_found");
  const revisions = await t.db.postRevision.findMany({
    where: { postId },
    orderBy: { version: "desc" },
    take: 100,
    select: { id: true, version: true, kind: true, title: true, message: true, createdAt: true, author: { select: { name: true, email: true } } },
  });
  return {
    title: post.title,
    canRestore: t.can("revisions.restore"),
    revisions: revisions.map((r) => ({
      id: r.id,
      version: r.version,
      kind: r.kind,
      title: r.title,
      message: r.message,
      createdAt: r.createdAt.toISOString(),
      authorName: r.author?.name ?? r.author?.email ?? "Someone",
      isLive: r.id === post.publishedRevisionId,
      isScheduled: r.id === post.scheduledRevisionId,
    })),
  };
}

/** Rolls the working copy (document, fields, terms, image) back to a revision, as a new RESTORED revision. Publishing is separate. */
export async function restoreEntryRevision(t: TenantContext, input: { postId: string; revisionId: string }) {
  t.assert("revisions.restore");
  const post = await t.db.post.findUnique({ where: { id: input.postId }, include: { postType: true } });
  if (!post || !canEdit(t, post)) throw new EditError("Entry not found", "not_found");
  if (post.status === "TRASHED") throw new EditError("Restore this entry from the trash first", "invalid");
  await assertNoForeignLock(t, post.id);
  const source = await t.db.postRevision.findFirst({ where: { id: input.revisionId, postId: post.id } });
  if (!source) throw new EditError("Revision not found", "not_found");
  const meta = (source.meta ?? {}) as RevisionMeta;

  // Only restore references that still exist.
  const fields = await t.db.customField.findMany({ where: { key: { in: Object.keys(meta.fields ?? {}) } } });
  const terms = meta.termIds?.length ? await t.db.term.findMany({ where: { id: { in: meta.termIds } }, select: { id: true } }) : [];
  const image = meta.featuredImageId ? await t.db.mediaAsset.findUnique({ where: { id: meta.featuredImageId }, select: { id: true } }) : null;
  const version = (await latestVersion(t, post.id)) + 1;

  await t.db.$transaction(async (tx) => {
    await tx.post.update({
      where: { id: post.id },
      data: {
        title: source.title,
        draft: asJson(source.document),
        ...(source.meta && Object.keys(meta).length
          ? { excerpt: meta.excerpt ?? null, featuredImageId: image?.id ?? null, template: meta.template ?? null }
          : {}),
      },
    });
    if (meta.fields) {
      await tx.fieldValue.deleteMany({ where: { postId: post.id } });
      const rows = fields.filter((f) => !isEmptyValue(meta.fields![f.key])).map((f) => ({ siteId: t.site.id, postId: post.id, fieldId: f.id, value: asJson(meta.fields![f.key]) }));
      if (rows.length) await tx.fieldValue.createMany({ data: rows });
    }
    if (meta.termIds) {
      await tx.postTerm.deleteMany({ where: { postId: post.id } });
      if (terms.length) await tx.postTerm.createMany({ data: terms.map((x) => ({ postId: post.id, termId: x.id })) });
    }
    await tx.postRevision.create({
      data: {
        siteId: t.site.id, postId: post.id, version, kind: "RESTORED", title: source.title, document: asJson(source.document),
        meta: asJson(await snapshotMeta(tx, post.id)), message: `Restored version ${source.version}`, authorId: t.user.id,
      },
    });
    await tx.auditLog.create({ data: { siteId: t.site.id, userId: t.user.id, action: "post.restore", targetId: post.id, data: { from: source.version, version } } });
  });
  return { version };
}

// ─────────────────────────────────────────────────────────────────────────────
// Scheduling
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Promotes scheduled revisions whose time has come. Runs from the cron route
 * (all sites). Returns the site ids whose live content changed so the caller
 * can expire their caches.
 */
export async function promoteScheduled(db: { post: Prisma.TransactionClient["post"] }, now = new Date()) {
  const due = await db.post.findMany({
    where: { status: "SCHEDULED", scheduledAt: { lte: now }, scheduledRevisionId: { not: null } },
    select: { id: true, siteId: true, scheduledAt: true, scheduledRevisionId: true, publishedAt: true },
    take: 500,
  });
  for (const p of due) {
    await db.post.update({
      where: { id: p.id },
      data: { status: "PUBLISHED" satisfies PostStatus, publishedRevisionId: p.scheduledRevisionId, publishedAt: p.publishedAt ?? p.scheduledAt, scheduledAt: null, scheduledRevisionId: null },
    });
  }
  return [...new Set(due.map((p) => p.siteId))];
}
