import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTenant } from "@/lib/tenant";
import { fieldDefFromRow } from "@/server/cms/field-defs";
import { postTypeTemplates } from "@/server/cms/entries";
import { FieldGroupBuilder } from "./FieldGroupBuilder";

export const metadata: Metadata = { title: "Field group" };

export default async function FieldGroupPage({ params, searchParams }: PageProps<"/admin/sites/[siteId]/fields/[groupId]">) {
  const { siteId, groupId } = await params;
  const sp = await searchParams;
  const t = await getTenant(siteId);
  if (!t.can("schema.manage")) notFound();
  const group = groupId === "new" ? null : await t.db.fieldGroup.findUnique({ where: { id: groupId }, include: { fields: { orderBy: { order: "asc" } } } });
  if (groupId !== "new" && !group) notFound();

  const [postTypes, taxonomies, terms, pages] = await Promise.all([
    t.db.postType.findMany({ where: { key: { not: "template" } }, orderBy: { labelPlural: "asc" } }),
    t.db.taxonomy.findMany({ orderBy: { label: "asc" }, select: { id: true, label: true } }),
    t.db.term.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, taxonomyId: true } }),
    t.db.post.findMany({ where: { postType: { hierarchical: true }, status: { not: "TRASHED" } }, orderBy: { title: "asc" }, select: { id: true, title: true, postType: { select: { labelSingular: true } } } }),
  ]);
  const preset = typeof sp.postType === "string" && postTypes.some((p) => p.id === sp.postType) ? sp.postType : postTypes.find((p) => p.key !== "page")?.id ?? postTypes[0]?.id;

  return (
    <FieldGroupBuilder
      siteId={t.site.id}
      justCreated={!!group && sp.created === "1"}
      initial={
        group
          ? { id: group.id, label: group.label, description: group.description ?? "", active: group.active, location: group.location, fields: group.fields.map(fieldDefFromRow) }
          : { label: "", description: "", active: true, location: preset ? [[{ param: "post_type", op: "==", value: preset }]] : [], fields: [] }
      }
      options={{
        postTypes: postTypes.map((p) => ({ id: p.id, label: p.labelPlural })),
        templates: postTypes.flatMap((p) => postTypeTemplates(p.metadata).map((x) => ({ key: x.key, label: `${x.label} (${p.labelPlural})` }))),
        taxonomies,
        terms: terms.map((x) => ({ id: x.id, label: `${taxonomies.find((tx) => tx.id === x.taxonomyId)?.label ?? ""}: ${x.name}` })),
        pages: pages.map((p) => ({ id: p.id, label: `${p.title} (${p.postType.labelSingular})` })),
      }}
    />
  );
}
