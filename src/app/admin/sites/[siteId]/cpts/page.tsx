import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenant } from "@/lib/tenant";
import { PostTypeForm } from "./PostTypeForm";

export const metadata: Metadata = { title: "Post types" };

export default async function PostTypesPage({ params }: PageProps<"/admin/sites/[siteId]/cpts">) {
  const { siteId } = await params;
  const t = await getTenant(siteId);
  if (!t.can("schema.manage")) notFound();
  const types = await t.db.postType.findMany({
    where: { key: { not: "template" } },
    orderBy: [{ isSystem: "desc" }, { labelPlural: "asc" }],
    include: { taxonomies: { select: { label: true } }, _count: { select: { posts: { where: { status: { not: "TRASHED" } } } } } },
  });

  return (
    <main className="mx-auto grid max-w-7xl gap-8 px-6 py-8 lg:grid-cols-[minmax(0,1fr)_420px]">
      <section>
        <h1 className="text-2xl font-semibold text-zinc-900">Post types</h1>
        <p className="mb-5 text-sm text-zinc-500">Kinds of content this site holds. Each gets its own list, fields, taxonomies and URLs.</p>
        <ul className="grid gap-3 sm:grid-cols-2">
          {types.map((p) => (
            <li key={p.id}>
              <Link href={`/admin/sites/${t.site.id}/cpts/${p.id}`} className="flex h-full flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-4 hover:border-zinc-400" data-post-type={p.key}>
                <div className="flex items-center gap-3">
                  <span aria-hidden className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-100 text-lg">{p.icon ?? "📄"}</span>
                  <div className="min-w-0">
                    <p className="font-medium text-zinc-900">{p.labelPlural}</p>
                    <p className="text-xs text-zinc-500">
                      {p.key === "page" ? "/" : `/${p.routePrefix ?? p.key}/…`} · {p._count.posts} {p._count.posts === 1 ? "entry" : "entries"}
                    </p>
                  </div>
                  {p.isSystem && <span className="ml-auto rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600">Built in</span>}
                </div>
                <p className="text-xs text-zinc-500">
                  {p.usesBuilder ? "Visual canvas" : "Form + rich text"}
                  {p.hasArchive ? " · archive" : ""}
                  {p.apiEnabled ? " · REST API" : ""}
                  {p.taxonomies.length ? ` · ${p.taxonomies.map((x) => x.label).join(", ")}` : ""}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <aside>
        <PostTypeForm siteId={t.site.id} />
      </aside>
    </main>
  );
}
