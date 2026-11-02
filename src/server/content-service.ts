import "server-only";
import type { Prisma, RevisionKind } from "@prisma/client";
import { updateTag } from "next/cache";
import { contentSchema } from "@/lib/builder/content";
import { authorizeChanges, diffDocuments, type Violation } from "@/lib/builder/policy";
import { isBuilderDocument, type BuilderDocument, type ImageValue, type VideoValue } from "@/lib/builder/types";
import { structuralProblem } from "@/lib/builder/tree";
import { mediaSettings } from "@/lib/builder/settings";
import { WIDGETS, contentField } from "@/lib/builder/widgets";
import { sanitizeRichText } from "./sanitize";
import type { TenantContext } from "@/lib/tenant";
import { toImage } from "./cms/dynamic";
import { snapshotMeta } from "./cms/snapshot";
import { siteCacheTag } from "./public-site";

/**
 * Content write path for builder pages: save draft, submit, publish, restore.
 * Every write appends an immutable PostRevision, so nothing is ever lost.
 */

export class EditError extends Error {
  constructor(
    message: string,
    public code: "not_found" | "forbidden" | "locked" | "conflict" | "invalid" | "guardrail",
    public violations: Violation[] = [],
  ) {
    super(message);
  }
}

const LOCK_TTL_MS = 90_000;
const MAX_NODES = 2_000;
const MAX_DOC_BYTES = 1_000_000;

export type SaveIntent = "draft" | "submit" | "publish";

const INTENT_KIND: Record<SaveIntent, RevisionKind> = {
  draft: "DRAFT",
  submit: "SUBMITTED",
  publish: "PUBLISHED",
};

async function loadPost(t: TenantContext, postId: string) {
  const post = await t.db.post.findUnique({ where: { id: postId }, include: { postType: true } });
  if (!post) throw new EditError("Page not found", "not_found");
  // A translation has no layout of its own: it only overrides the original's text and media.
  if (post.locale) throw new EditError("Translations share the original page's layout. Edit their text and images under Translations.", "guardrail");
  return post;
}

async function latestVersion(t: TenantContext, postId: string) {
  const agg = await t.db.postRevision.aggregate({ where: { postId }, _max: { version: true } });
  return agg._max.version ?? 0;
}

async function assertLockHeld(t: TenantContext, postId: string) {
  const lock = await t.db.editLock.findUnique({ where: { postId } });
  if (!lock || lock.userId !== t.user.id || lock.expiresAt < new Date()) {
    throw new EditError("Your editing session expired or someone else is editing this page. Reload to continue.", "locked");
  }
}

function assertWellFormed(doc: unknown): asserts doc is BuilderDocument {
  if (!isBuilderDocument(doc)) throw new EditError("Malformed page document", "invalid");
  if (JSON.stringify(doc).length > MAX_DOC_BYTES) throw new EditError("Page is too large", "invalid");
  const ids = Object.keys(doc.nodes);
  if (ids.length > MAX_NODES) throw new EditError("Page has too many elements", "invalid");
  for (const [id, node] of Object.entries(doc.nodes)) {
    if (node.id !== id) throw new EditError("Node id mismatch", "invalid");
    for (const child of node.children ?? []) {
      if (!doc.nodes[child]) throw new EditError("Dangling child reference", "invalid");
    }
  }
  const problem = structuralProblem(doc);
  if (problem) throw new EditError(problem, "invalid");
}

/**
 * Validates changed content values and rewrites image values from the media
 * library. The browser sends an assetId; the URL and dimensions always come
 * from this site's MediaAsset row, which also proves the asset is this
 * tenant's.
 */
async function resolveImage(t: TenantContext, img: ImageValue): Promise<ImageValue | null> {
  if (!img.assetId) return null;
  const asset = await t.db.mediaAsset.findUnique({ where: { id: img.assetId } });
  if (!asset || !asset.mimeType.startsWith("image/")) return null;
  return { ...toImage(asset), alt: img.alt || asset.altText || "" };
}

/** A video from this site's library: its URL always comes from the MediaAsset row. */
async function resolveVideo(t: TenantContext, assetId: string, kind: "video" | "audio" = "video"): Promise<string | null> {
  const asset = await t.db.mediaAsset.findUnique({ where: { id: assetId }, select: { url: true, mimeType: true } });
  return asset && asset.mimeType.startsWith(`${kind}/`) ? asset.url : null;
}

export async function normaliseContent(t: TenantContext, next: BuilderDocument, changed: { nodeId: string; field: string }[]) {
  const violations: Violation[] = [];
  for (const { nodeId, field } of changed) {
    const node = next.nodes[nodeId];
    if (!node) continue;
    const def = contentField(node.type, field);
    if (!def) continue;
    const parsed = contentSchema(def).safeParse(node.props[field]);
    if (!parsed.success) {
      violations.push({ nodeId, message: `${def.label}: ${parsed.error.issues[0]?.message ?? "invalid value"}` });
      continue;
    }
    let value: unknown = parsed.data;
    if (def.kind === "image") {
      const img = parsed.data as ImageValue;
      if (!img.assetId) {
        // An empty image slot (a freshly dropped widget) renders as a placeholder.
        node.props = { ...node.props, [field]: { assetId: null, src: "", alt: img.alt } satisfies ImageValue };
        continue;
      }
      const resolved = await resolveImage(t, img);
      if (!resolved) {
        violations.push({ nodeId, message: "That image isn't in this site's media library" });
        continue;
      }
      value = resolved;
    }
    if (def.kind === "html") value = await sanitizeRichText(parsed.data as string);
    if (def.kind === "video" || def.kind === "audio") {
      const v = parsed.data as VideoValue;
      if (v.assetId) {
        const src = await resolveVideo(t, v.assetId, def.kind);
        if (!src) {
          violations.push({ nodeId, message: `That ${def.kind} isn't in this site's media library` });
          continue;
        }
        value = { assetId: v.assetId, src } satisfies VideoValue;
      }
    }
    if (def.kind === "items") {
      // Images inside list records get the same treatment as an image field.
      const imageKeys = (def.itemFields ?? []).filter((f) => f.kind === "image").map((f) => f.key);
      if (imageKeys.length) {
        const out: Record<string, unknown>[] = [];
        let bad = false;
        for (const item of parsed.data as Record<string, unknown>[]) {
          const copy = { ...item };
          for (const k of imageKeys) {
            const img = copy[k] as ImageValue | undefined;
            if (!img) continue;
            if (!img.assetId) {
              copy[k] = { assetId: null, src: "", alt: img.alt } satisfies ImageValue;
              continue;
            }
            const resolved = await resolveImage(t, img);
            if (!resolved) bad = true;
            else copy[k] = resolved;
          }
          out.push(copy);
        }
        if (bad) {
          violations.push({ nodeId, message: `${def.label}: an image isn't in this site's media library` });
          continue;
        }
        value = out;
      }
    }
    if (def.kind === "gallery") {
      const out: ImageValue[] = [];
      for (const img of parsed.data as ImageValue[]) {
        const resolved = await resolveImage(t, img);
        if (!resolved) {
          violations.push({ nodeId, message: "A gallery image isn't in this site's media library" });
          break;
        }
        out.push(resolved);
      }
      value = out;
    }
    node.props = { ...node.props, [field]: value };
  }
  if (violations.length) throw new EditError("Some changes need fixing", "invalid", violations);
}

/**
 * Rich content never stores HTML of its own (it only shows bound, sanitised
 * data), every loop grid must query one of this site's post types, and a
 * product details widget may only feature one of this site's products.
 */
async function checkDynamicNodes(t: TenantContext, doc: BuilderDocument) {
  for (const node of Object.values(doc.nodes)) {
    if (node.type === "richtext" && "html" in node.props) {
      const { html: _drop, ...rest } = node.props;
      void _drop;
      node.props = rest;
    }
    if (node.type === "product" && typeof node.props.productId === "string") {
      if (!(await t.db.product.findUnique({ where: { id: node.props.productId }, select: { id: true } }))) {
        throw new EditError("A product details widget points at a product that doesn't exist", "invalid");
      }
    }
    for (const { key, ref } of mediaSettings(WIDGETS[node.type].settings, node.props)) {
      const src = await resolveVideo(t, ref.assetId);
      if (!src) throw new EditError("A background video isn't in this site's media library", "invalid");
      node.props = { ...node.props, [key]: { assetId: ref.assetId, src } };
    }
    if (node.type !== "loop") continue;
    const q = node.props.query as { postTypeId: string | null; termId?: string | null };
    if (q.postTypeId) {
      const pt = await t.db.postType.findUnique({ where: { id: q.postTypeId }, select: { key: true } });
      if (!pt || pt.key === "template") throw new EditError("A loop grid points at a post type that doesn't exist", "invalid");
    }
    if (q.termId && !(await t.db.term.findUnique({ where: { id: q.termId }, select: { id: true } }))) {
      throw new EditError("A loop grid filters by a term that doesn't exist", "invalid");
    }
  }
}

export async function saveDocument(
  t: TenantContext,
  input: { postId: string; document: unknown; baseVersion: number; intent: SaveIntent; message?: string },
) {
  if (!t.can("content.edit") && !t.can("design.layout")) throw new EditError("You can't edit pages on this site", "forbidden");
  if (input.intent === "publish" && !t.can("post.publish")) throw new EditError("You can't publish on this site", "forbidden");
  if (input.intent === "submit" && !t.can("post.submit")) throw new EditError("You can't submit for review", "forbidden");

  const post = await loadPost(t, input.postId);
  await assertLockHeld(t, post.id);

  const current = await latestVersion(t, post.id);
  if (input.baseVersion !== current) {
    throw new EditError("This page changed since you opened it. Reload to get the latest version.", "conflict");
  }

  const prev = post.draft;
  assertWellFormed(prev);
  const next = structuredClone(input.document);
  assertWellFormed(next);

  const changes = diffDocuments(prev, next);
  const violations = authorizeChanges(prev, changes, { permissions: t.permissions });
  if (violations.length) throw new EditError("Some changes touch locked design areas", "guardrail", violations);
  await checkDynamicNodes(t, next);

  await normaliseContent(
    t,
    next,
    changes.flatMap((c) => {
      if (c.kind === "content") return [{ nodeId: c.nodeId, field: c.field }];
      // New elements bring content of their own; it gets the same checks as an edit.
      if (c.kind === "structure" && c.detail === "node added") {
        return WIDGETS[next.nodes[c.nodeId].type].contentFields.map((f) => ({ nodeId: c.nodeId, field: f.key }));
      }
      return [];
    }),
  );

  if (!changes.length && input.intent === "draft") return { version: current, changed: 0 };

  const version = current + 1;
  const now = new Date();
  const document = next as unknown as Prisma.InputJsonValue;

  await t.db.$transaction(async (tx) => {
    const revision = await tx.postRevision.create({
      data: {
        siteId: t.site.id,
        postId: post.id,
        version,
        kind: INTENT_KIND[input.intent],
        title: post.title,
        document,
        // Fields, featured image and SEO ride along, so publishing the canvas publishes the whole entry.
        meta: (await snapshotMeta(tx, post.id)) as Prisma.InputJsonValue,
        message: input.message?.slice(0, 500),
        authorId: t.user.id,
      },
    });
    await tx.post.update({
      where: { id: post.id },
      data: {
        draft: document,
        ...(input.intent === "publish"
          ? { status: "PUBLISHED", publishedRevisionId: revision.id, publishedAt: post.publishedAt ?? now, scheduledAt: null, scheduledRevisionId: null }
          : input.intent === "submit"
            ? { status: "PENDING_REVIEW" }
            : {}),
      },
    });
    await tx.auditLog.create({
      data: {
        siteId: t.site.id,
        userId: t.user.id,
        action: `post.${input.intent}`,
        targetId: post.id,
        data: { version, changes: changes.length },
      },
    });
  });

  // Expire this tenant's cached public pages; visitors get the new version on their next request.
  if (input.intent === "publish") updateTag(siteCacheTag(t.site.id));
  return { version, changed: changes.length, publishedAt: input.intent === "publish" ? now.toISOString() : undefined };
}

/** Copies an old revision into the draft as a new RESTORED revision. Publishing it is a separate step. */
export async function restoreRevision(t: TenantContext, input: { postId: string; revisionId: string }) {
  t.assert("revisions.restore");
  const post = await loadPost(t, input.postId);
  await assertLockHeld(t, post.id);
  const source = await t.db.postRevision.findFirst({ where: { id: input.revisionId, postId: post.id } });
  if (!source) throw new EditError("Revision not found", "not_found");

  const version = (await latestVersion(t, post.id)) + 1;
  await t.db.$transaction(async (tx) => {
    await tx.postRevision.create({
      data: {
        siteId: t.site.id,
        postId: post.id,
        version,
        kind: "RESTORED",
        title: source.title,
        document: source.document as Prisma.InputJsonValue,
        meta: (await snapshotMeta(tx, post.id)) as Prisma.InputJsonValue,
        message: `Restored version ${source.version}`,
        authorId: t.user.id,
      },
    });
    await tx.post.update({ where: { id: post.id }, data: { draft: source.document as Prisma.InputJsonValue } });
    await tx.auditLog.create({
      data: { siteId: t.site.id, userId: t.user.id, action: "post.restore", targetId: post.id, data: { from: source.version, version } },
    });
  });
  return { version, document: source.document as unknown as BuilderDocument };
}

export async function acquireEditLock(t: TenantContext, postId: string) {
  await loadPost(t, postId);
  const now = new Date();
  const existing = await t.db.editLock.findUnique({
    where: { postId },
    include: { user: { select: { name: true, email: true } } },
  });
  if (existing && existing.userId !== t.user.id && existing.expiresAt > now) {
    return { ok: false as const, holder: existing.user.name ?? existing.user.email, expiresAt: existing.expiresAt.toISOString() };
  }
  const expiresAt = new Date(now.getTime() + LOCK_TTL_MS);
  await t.db.editLock.upsert({
    where: { postId },
    create: { siteId: t.site.id, postId, userId: t.user.id, expiresAt },
    update: { userId: t.user.id, expiresAt },
  });
  return { ok: true as const, expiresAt: expiresAt.toISOString() };
}

export async function releaseEditLock(t: TenantContext, postId: string) {
  await t.db.editLock.deleteMany({ where: { postId, userId: t.user.id } });
}
