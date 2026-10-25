import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenant } from "@/lib/tenant";
import { postTypeTemplates } from "@/server/cms/entries";
import { PostTypeForm } from "../PostTypeForm";
import { PostTypeExtras } from "./PostTypeExtras";
import { TaxonomyManager } from "./TaxonomyManager";

export const metadata: Metadata = { title: "Post type" };

export default async function PostTypePage({ params }: PageProps<"/admin/sites/[siteId]/cpts/[postTypeId]">) {
  const { siteId, postTypeId } = await params;
  const t = await getTenant(siteId);
  if (!t.can("schema.manage")) notFound();
  const pt = await t.db.postType.findUnique({
    where: { id: postTypeId },
    include: { singleTemplate: { select: { id: true, publishedRevisionId: true } }, _count: { select: { posts: true } } },
  });
  if (!pt || pt.key === "template") notFound();
  const [taxonomies, terms, groups] = await Promise.all([
    t.db.taxonomy.findMany({ orderBy: { label: "asc" }, include: { postTypes: { select: { id: true } } } }),
    t.db.term.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, slug: true, parentId: true, taxonomyId: true } }),
    t.db.fieldGroup.findMany({ select: { id: true, label: true, location: true } }),
  ]);
  const groupsHere = groups.filter((g) => JSON.stringify(g.location).includes(pt.id));

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <Link href={`/admin/sites/${t.site.id}/cpts`} className="text-sm text-zinc-500 hover:text-zinc-900">← Post types</Link>
      <h1 className="mb-6 mt-1 flex items-center gap-3 text-2xl font-semibold text-zinc-900">
        <span aria-hidden>{pt.icon ?? "📄"}</span>
        {pt.labelPlural}
      </h1>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-6">
          <PostTypeExtras
            siteId={t.site.id}
            postType={{ id: pt.id, key: pt.key, label: pt.labelSingular, plural: pt.labelPlural, isSystem: pt.isSystem, usesBuilder: pt.usesBuilder, entries: pt._count.posts }}
            template={pt.singleTemplate ? { id: pt.singleTemplate.id, published: !!pt.singleTemplate.publishedRevisionId } : null}
            groups={groupsHere.map((g) => ({ id: g.id, label: g.label }))}
            canDesign={t.can("design.layout")}
          />
          <TaxonomyManager
            siteId={t.site.id}
            postTypeId={pt.id}
            taxonomies={taxonomies.map((x) => ({ id: x.id, key: x.key, label: x.label, hierarchical: x.hierarchical, postTypeIds: x.postTypes.map((p) => p.id) }))}
            terms={terms}
          />
        </div>
        <aside>
          <PostTypeForm
            siteId={t.site.id}
            siteKey={t.site.subdomain}
            initial={{
              id: pt.id,
              labelSingular: pt.labelSingular,
              labelPlural: pt.labelPlural,
              key: pt.key,
              description: pt.description ?? "",
              icon: pt.icon ?? "📄",
              routePrefix: pt.routePrefix ?? "",
              slugRule: pt.slugRule,
              usesBuilder: pt.usesBuilder,
              hasArchive: pt.hasArchive,
              hierarchical: pt.hierarchical,
              apiEnabled: pt.apiEnabled,
              templates: postTypeTemplates(pt.metadata),
              isSystem: pt.isSystem,
            }}
          />
        </aside>
      </div>
    </main>
  );
}
