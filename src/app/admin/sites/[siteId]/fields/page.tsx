import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/cms/ui";
import { LOCATION_PARAMS, locationRulesSchema } from "@/lib/cms/location";
import { getTenant } from "@/lib/tenant";

export const metadata: Metadata = { title: "Field groups" };

export default async function FieldGroupsPage({ params }: PageProps<"/admin/sites/[siteId]/fields">) {
  const { siteId } = await params;
  const t = await getTenant(siteId);
  if (!t.can("schema.manage")) notFound();
  const [groups, postTypes, terms, posts] = await Promise.all([
    t.db.fieldGroup.findMany({ orderBy: [{ order: "asc" }, { label: "asc" }], include: { _count: { select: { fields: true } } } }),
    t.db.postType.findMany({ select: { id: true, labelPlural: true } }),
    t.db.term.findMany({ select: { id: true, name: true } }),
    t.db.post.findMany({ where: { postType: { hierarchical: true } }, select: { id: true, title: true } }),
  ]);
  const names = new Map<string, string>([...postTypes.map((p) => [p.id, p.labelPlural] as const), ...terms.map((x) => [x.id, x.name] as const), ...posts.map((p) => [p.id, p.title] as const)]);
  const describe = (location: unknown) => {
    const parsed = locationRulesSchema.safeParse(location);
    if (!parsed.success) return "No location rules: hidden everywhere";
    return parsed.data
      .map((g) => g.map((r) => `${LOCATION_PARAMS[r.param]} ${r.op === "==" ? "is" : "is not"} ${names.get(r.value) ?? r.value}`).join(" and "))
      .join(", or ");
  };

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Field groups</h1>
          <p className="text-sm text-zinc-500">Custom fields, and the rules for where they appear.</p>
        </div>
        <Link href={`/admin/sites/${t.site.id}/fields/new`} className="rounded-lg bg-[var(--accent)] px-3.5 py-2 text-sm font-medium text-white hover:opacity-90" data-new-group="">
          New field group
        </Link>
      </div>
      {groups.length ? (
        <ul className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 bg-white">
          {groups.map((g) => (
            <li key={g.id}>
              <Link href={`/admin/sites/${t.site.id}/fields/${g.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-zinc-50">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-zinc-900">
                    {g.label}
                    {!g.active && <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-normal text-zinc-600">Inactive</span>}
                  </p>
                  <p className="truncate text-xs text-zinc-500">{describe(g.location)}</p>
                </div>
                <span className="text-sm text-zinc-500">
                  {g._count.fields} {g._count.fields === 1 ? "field" : "fields"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="No field groups yet">Create one to add custom fields such as price, rating or a gallery to a post type.</EmptyState>
      )}
    </main>
  );
}
