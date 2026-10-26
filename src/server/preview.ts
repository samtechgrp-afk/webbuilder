import "server-only";
import { isBuilderDocument, type BuilderDocument } from "@/lib/builder/types";
import { composeDocument, mergeEntryFields } from "@/lib/i18n/translate";
import { getTenant } from "@/lib/tenant";
import type { TenantDb } from "@/lib/tenant-db";
import { buildDynamicPosts, draftSource, fieldDefsByKey, loadDynamicData } from "./cms/dynamic";

/** The working copy of a translation's original (any status: previews show unpublished work). */
async function originalDraft(db: TenantDb, postId: string) {
  const group = await db.postTranslation.findUnique({ where: { postId }, select: { translationId: true } });
  return group ? db.post.findFirst({ where: { locale: "", translation: { translationId: group.translationId } } }) : null;
}

/** A translation's working copy over its original's: own text and translatable fields, shared everything else. */
async function draftSourceIn(db: TenantDb, post: { id: string; locale: string }) {
  const own = await draftSource(db, post.id);
  if (!own || !post.locale) return own;
  const original = await originalDraft(db, post.id);
  const base = original && (await draftSource(db, original.id));
  if (!base) return own;
  return { ...own, featuredImageId: own.featuredImageId ?? base.featuredImageId, fields: mergeEntryFields(await fieldDefsByKey(db), base.fields, own.fields) };
}

/**
 * Signed-in preview of unpublished content at its public address
 * (`?preview=1`). Only members who may edit content see drafts; for anyone
 * else this returns null and the page answers 404 like any visitor's.
 */
export async function getPreview(site: { id: string; name: string; settings: unknown; branding: unknown }, slugParts: string[] | undefined, linkBase: string, locale = "") {
  const t = await getTenant(site.id);
  if (!t.can("content.edit") && !t.can("post.editAny") && !t.can("design.layout")) return null;
  const parts = slugParts ?? [];

  const page = await t.db.post.findFirst({ where: { locale, slug: parts.length ? parts.join("/") : "home", postType: { key: "page" } } });
  let document: BuilderDocument | null = page && isBuilderDocument(page.draft) ? page.draft : null;
  if (page && locale) {
    const original = await originalDraft(t.db, page.id);
    document = original && isBuilderDocument(original.draft) ? composeDocument(original.draft, page.draft) : null;
  }
  if (page && document) {
    return { kind: "page" as const, status: page.status, document, data: await loadDynamicData(site.id, document, site, await draftSourceIn(t.db, page), linkBase, locale) };
  }
  if (parts.length !== 2) return null;
  const postType = await t.db.postType.findFirst({
    where: { routePrefix: parts[0], key: { notIn: ["page", "template"] } },
    include: { singleTemplate: { include: { publishedRevision: true } } },
  });
  const post = postType && (await t.db.post.findFirst({ where: { postTypeId: postType.id, locale, slug: parts[1] } }));
  const source = post && (await draftSourceIn(t.db, post));
  if (!postType || !post || !source) return null;
  const [entry] = await buildDynamicPosts(t.db, [source]);
  const tplDoc = postType.singleTemplate?.publishedRevision?.document;
  const template = isBuilderDocument(tplDoc) ? tplDoc : null;
  return {
    kind: "entry" as const,
    status: post.status,
    postType,
    entry,
    template,
    data: template ? await loadDynamicData(site.id, template, site, source, linkBase, locale) : null,
  };
}
