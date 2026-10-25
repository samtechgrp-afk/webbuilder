import type { Prisma } from "@prisma/client";
import type { TenantDb } from "@/lib/tenant-db";
import type { RevisionMeta } from "./dynamic";

type Tx = Omit<TenantDb, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

/**
 * Everything about an entry that lives outside its document, frozen into
 * PostRevision.meta. The live site reads published entries only from this
 * snapshot, so a later draft edit to a field never leaks onto the site.
 */
export async function snapshotMeta(db: Tx, postId: string): Promise<RevisionMeta> {
  const post = await db.post.findUniqueOrThrow({
    where: { id: postId },
    include: {
      fieldValues: { include: { field: { select: { key: true } } } },
      terms: { select: { termId: true } },
      author: { select: { name: true, email: true } },
    },
  });
  return {
    fields: Object.fromEntries(post.fieldValues.map((v) => [v.field.key, v.value])),
    featuredImageId: post.featuredImageId,
    excerpt: post.excerpt,
    termIds: post.terms.map((t) => t.termId),
    template: post.template,
    parentId: post.parentId,
    authorName: post.author?.name ?? post.author?.email ?? null,
    seo: { seoTitle: post.seoTitle, seoDescription: post.seoDescription, noIndex: post.noIndex },
  };
}

export const asJson = (v: unknown) => v as Prisma.InputJsonValue;
