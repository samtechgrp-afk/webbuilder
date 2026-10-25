import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTenant } from "@/lib/tenant";
import { fieldDefFromRow } from "@/server/cms/field-defs";
import { contentHtml } from "@/server/cms/dynamic";
import { postTypeTemplates } from "@/server/cms/entries";
import { EntryForm } from "./EntryForm";

export const metadata: Metadata = { title: "Edit entry" };

/** Depth-first term list so hierarchical categories read as a tree. */
function orderTerms<T extends { id: string; parentId: string | null; taxonomyId: string }>(terms: T[]) {
  const out: (T & { depth: number })[] = [];
  const walk = (parentId: string | null, depth: number, taxonomyId: string) => {
    for (const t of terms.filter((x) => x.parentId === parentId && x.taxonomyId === taxonomyId)) {
      out.push({ ...t, depth });
      walk(t.id, depth + 1, taxonomyId);
    }
  };
  for (const tax of new Set(terms.map((t) => t.taxonomyId))) walk(null, 0, tax);
  return out;
}

export default async function EntryPage({ params }: PageProps<"/admin/sites/[siteId]/content/[postId]">) {
  const { siteId, postId } = await params;
  const t = await getTenant(siteId);
  const post = await t.db.post.findUnique({
    where: { id: postId },
    include: {
      postType: { include: { taxonomies: { orderBy: { label: "asc" } } } },
      fieldValues: { include: { field: { select: { key: true } } } },
      terms: { select: { termId: true } },
      editLock: { include: { user: { select: { name: true } } } },
      author: { select: { name: true, email: true } },
    },
  });
  if (!post || post.postType.key === "template") notFound();
  const canEdit = t.can("post.editAny") || t.can("design.layout") || (t.can("post.create") && post.authorId === t.user.id);
  if (!canEdit) notFound();

  const [groups, latest, assets, entries, members, terms, parents] = await Promise.all([
    t.db.fieldGroup.findMany({ where: { active: true }, orderBy: { order: "asc" }, include: { fields: { orderBy: { order: "asc" } } } }),
    t.db.postRevision.aggregate({ where: { postId }, _max: { version: true } }),
    t.db.mediaAsset.findMany({
      orderBy: { createdAt: "desc" },
      take: 500,
      select: { id: true, url: true, title: true, altText: true, originalName: true, mimeType: true, width: true, height: true, sizeBytes: true },
    }),
    t.db.post.findMany({
      where: { status: { not: "TRASHED" }, postType: { key: { not: "template" } }, id: { not: postId } },
      orderBy: { title: "asc" },
      take: 500,
      select: { id: true, title: true, postTypeId: true, postType: { select: { labelSingular: true } } },
    }),
    t.db.membership.findMany({ select: { userId: true, user: { select: { name: true, email: true } } } }),
    t.db.term.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, taxonomyId: true, parentId: true } }),
    post.postType.hierarchical
      ? t.db.post.findMany({ where: { postTypeId: post.postTypeId, id: { not: post.id }, status: { not: "TRASHED" } }, orderBy: { title: "asc" }, select: { id: true, title: true } })
      : Promise.resolve([]),
  ]);

  const lock = post.editLock && post.editLock.userId !== t.user.id && post.editLock.expiresAt > new Date() ? post.editLock.user.name : null;
  const live = `/sites/${t.site.subdomain}${post.postType.key === "page" ? (post.slug === "home" ? "" : `/${post.slug}`) : `/${post.postType.routePrefix ?? post.postType.key}/${post.slug}`}`;

  return (
    <EntryForm
      key={`${post.id}:${latest._max.version ?? 0}`}
      siteId={t.site.id}
      version={latest._max.version ?? 0}
      post={{
        id: post.id,
        title: post.title,
        slug: post.slug,
        status: post.status,
        excerpt: post.excerpt,
        content: contentHtml(post.draft),
        featuredImageId: post.featuredImageId,
        template: post.template,
        parentId: post.parentId,
        menuOrder: post.menuOrder,
        termIds: post.terms.map((x) => x.termId),
        fields: Object.fromEntries(post.fieldValues.map((v) => [v.field.key, v.value])),
        seo: { seoTitle: post.seoTitle, seoDescription: post.seoDescription, noIndex: post.noIndex },
        scheduledAt: post.scheduledAt?.toISOString() ?? null,
        publishedAt: post.publishedAt?.toISOString() ?? null,
        isLive: !!post.publishedRevisionId,
        authorName: post.author?.name ?? post.author?.email ?? "Unknown",
        liveUrl: live,
      }}
      postType={{
        id: post.postType.id,
        key: post.postType.key,
        label: post.postType.labelSingular,
        plural: post.postType.labelPlural,
        usesBuilder: post.postType.usesBuilder,
        hierarchical: post.postType.hierarchical,
        routePrefix: post.postType.routePrefix,
        templates: postTypeTemplates(post.postType.metadata),
        taxonomies: post.postType.taxonomies.map((x) => ({ id: x.id, label: x.label, hierarchical: x.hierarchical })),
      }}
      groups={groups.map((g) => ({ id: g.id, label: g.label, description: g.description, location: g.location, fields: g.fields.map(fieldDefFromRow) }))}
      ctxData={{
        assets,
        entries: entries.map((e) => ({ id: e.id, title: e.title, postTypeId: e.postTypeId, typeLabel: e.postType.labelSingular })),
        members: members.map((m) => ({ id: m.userId, name: m.user.name ?? m.user.email })),
        terms: orderTerms(terms),
      }}
      parents={parents}
      perms={{
        publish: t.can("post.publish"),
        submit: t.can("post.submit"),
        designer: t.can("schema.manage"),
        upload: t.can("media.upload"),
        visual: t.can("content.edit") || t.can("design.layout"),
        restore: t.can("revisions.restore"),
        canPreview: t.can("content.edit") || t.can("post.editAny") || t.can("design.layout"),
      }}
      lockedBy={lock}
    />
  );
}
