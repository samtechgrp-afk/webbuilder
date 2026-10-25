import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ClientEditor } from "@/components/editor/ClientEditor";
import type { DesignTokens } from "@/lib/builder/styles";
import { isBuilderDocument } from "@/lib/builder/types";
import { getTenant } from "@/lib/tenant";
import { postTypesForRules } from "@/lib/cms/location";
import type { BindingCatalog } from "@/components/editor/store";
import type { FieldType } from "@/lib/cms/fields";
import { acquireEditLock } from "@/server/content-service";
import { draftSource, loadDynamicData } from "@/server/cms/dynamic";

export const metadata: Metadata = { title: "Editor" };

export default async function EditPage({ params }: PageProps<"/admin/sites/[siteId]/pages/[postId]/edit">) {
  const { siteId, postId } = await params;
  const t = await getTenant(siteId);
  if (!t.can("content.edit") && !t.can("design.layout")) notFound();

  const post = await t.db.post.findUnique({ where: { id: postId }, include: { postType: true } });
  if (!post || !post.postType.usesBuilder || !isBuilderDocument(post.draft)) notFound();

  // A single template renders entries of the post type that points at it; anything else renders itself.
  const templateFor = await t.db.postType.findFirst({ where: { singleTemplateId: post.id }, select: { id: true, labelSingular: true } });
  const contextPostTypeId = templateFor?.id ?? post.postTypeId;
  const previewEntry = templateFor
    ? await t.db.post.findFirst({ where: { postTypeId: templateFor.id, status: { not: "TRASHED" } }, orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }], select: { id: true, title: true } })
    : { id: post.id, title: post.title };

  const [lock, assets, revisions, latest, postTypes, groups, taxonomies] = await Promise.all([
    acquireEditLock(t, post.id),
    t.db.mediaAsset.findMany({
      where: { mimeType: { startsWith: "image/" } },
      orderBy: { createdAt: "desc" },
      select: { id: true, url: true, altText: true, width: true, height: true, originalName: true },
    }),
    t.db.postRevision.findMany({
      where: { postId: post.id },
      orderBy: { version: "desc" },
      take: 50,
      include: { author: { select: { name: true } } },
    }),
    t.db.postRevision.aggregate({ where: { postId: post.id }, _max: { version: true } }),
    t.db.postType.findMany({ orderBy: { labelPlural: "asc" }, select: { id: true, key: true, labelPlural: true } }),
    t.db.fieldGroup.findMany({ where: { active: true }, orderBy: { order: "asc" }, include: { fields: { orderBy: { order: "asc" }, select: { key: true, label: true, type: true } } } }),
    t.db.taxonomy.findMany({ include: { postTypes: { select: { id: true } }, terms: { orderBy: { name: "asc" }, select: { id: true, name: true } } } }),
  ]);

  const allIds = postTypes.map((p) => p.id);
  const fields: BindingCatalog["fields"] = {};
  for (const g of groups) {
    for (const ptId of postTypesForRules(g.location, allIds)) {
      const list = (fields[ptId] ??= []);
      for (const f of g.fields) if (!list.some((x) => x.key === f.key)) list.push({ key: f.key, label: f.label, type: f.type as FieldType });
    }
  }
  const catalog: BindingCatalog = {
    postTypes: postTypes.filter((p) => p.key !== "page" && p.key !== "template").map((p) => ({ id: p.id, label: p.labelPlural })),
    fields,
    terms: taxonomies.flatMap((tx) => tx.terms.map((term) => ({ id: term.id, label: `${tx.label}: ${term.name}`, postTypeIds: tx.postTypes.map((p) => p.id) }))),
  };
  const linkBase = `/sites/${t.site.subdomain}`;
  const dynamic = await loadDynamicData(t.site.id, post.draft, t.site, previewEntry ? await draftSource(t.db, previewEntry.id) : null, linkBase);

  return (
    <div className="fixed inset-0 z-50">
      <ClientEditor
        key={`${post.id}:${latest._max.version ?? 0}`}
        site={{ id: t.site.id, name: t.site.name, liveUrl: `/sites/${t.site.subdomain}/${post.slug === "home" ? "" : post.slug}` }}
        post={{ id: post.id, title: post.title, status: post.status }}
        document={post.draft}
        version={latest._max.version ?? 0}
        permissions={[...t.permissions]}
        roleName={t.role.name}
        tokens={(t.site.designTokens ?? {}) as DesignTokens}
        assets={assets}
        revisions={revisions.map((r) => ({
          id: r.id,
          version: r.version,
          kind: r.kind,
          message: r.message,
          authorName: r.author?.name ?? null,
          createdAt: r.createdAt.toISOString(),
          isLive: r.id === post.publishedRevisionId,
        }))}
        lock={lock.ok ? { ok: true } : { ok: false, holder: lock.holder }}
        dynamic={dynamic}
        catalog={catalog}
        contextPostTypeId={contextPostTypeId}
        template={templateFor ? { postTypeLabel: templateFor.labelSingular, previewTitle: previewEntry?.title ?? null } : null}
      />
    </div>
  );
}
