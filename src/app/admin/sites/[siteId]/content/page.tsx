import type { Prisma } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenant } from "@/lib/tenant";
import { ContentTable, type ContentRow } from "./ContentTable";
import { NewEntryButton } from "./NewEntryButton";

export const metadata: Metadata = { title: "Content" };

const PER_PAGE = 20;

const STATUS_TABS = [
  { key: "all", label: "All", where: { status: { not: "TRASHED" } } },
  { key: "published", label: "Published", where: { status: "PUBLISHED" } },
  { key: "draft", label: "Drafts", where: { status: "DRAFT" } },
  { key: "pending", label: "Pending review", where: { status: "PENDING_REVIEW" } },
  { key: "scheduled", label: "Scheduled", where: { status: "SCHEDULED" } },
  { key: "trash", label: "Trash", where: { status: "TRASHED" } },
] as const satisfies readonly { key: string; label: string; where: Prisma.PostWhereInput }[];

const SORTS = {
  title: (dir: Prisma.SortOrder) => ({ title: dir }),
  updated: (dir: Prisma.SortOrder) => ({ updatedAt: dir }),
  status: (dir: Prisma.SortOrder) => ({ status: dir }),
  author: (dir: Prisma.SortOrder) => ({ author: { name: dir } }),
} satisfies Record<string, (dir: Prisma.SortOrder) => Prisma.PostOrderByWithRelationInput>;
type SortKey = keyof typeof SORTS;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function ContentPage({ params, searchParams }: PageProps<"/admin/sites/[siteId]/content">) {
  const { siteId } = await params;
  const sp = await searchParams;
  const t = await getTenant(siteId);
  if (!t.can("post.create") && !t.can("content.edit") && !t.can("design.layout")) notFound();

  const postTypes = await t.db.postType.findMany({
    where: { key: { not: "template" } },
    orderBy: [{ isSystem: "desc" }, { labelPlural: "asc" }],
    include: { _count: { select: { posts: { where: { status: { not: "TRASHED" } } } } } },
  });
  const type = postTypes.find((p) => p.key === one(sp.type)) ?? postTypes[0];
  if (!type) notFound();

  const statusKey = STATUS_TABS.find((s) => s.key === one(sp.status))?.key ?? "all";
  const q = (one(sp.q) ?? "").trim().slice(0, 100);
  const sort: SortKey = (Object.keys(SORTS) as SortKey[]).find((k) => k === one(sp.sort)) ?? "updated";
  const dir: Prisma.SortOrder = one(sp.dir) === "asc" ? "asc" : "desc";
  const page = Math.max(1, Number(one(sp.page)) || 1);

  const base: Prisma.PostWhereInput = { postTypeId: type.id, ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { slug: { contains: q.toLowerCase() } }] } : {}) };
  const where: Prisma.PostWhereInput = { ...base, ...STATUS_TABS.find((s) => s.key === statusKey)!.where };

  const [counts, total, posts] = await Promise.all([
    Promise.all(STATUS_TABS.map((s) => t.db.post.count({ where: { ...base, ...s.where } }))),
    t.db.post.count({ where }),
    t.db.post.findMany({
      where,
      orderBy: [SORTS[sort](dir), { id: "asc" }],
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      include: {
        author: { select: { name: true, email: true } },
        editLock: { include: { user: { select: { name: true } } } },
        revisions: { orderBy: { version: "desc" }, take: 1, select: { id: true } },
        terms: { include: { term: { select: { name: true } } } },
      },
    }),
  ]);

  const now = new Date();
  const canEditAny = t.can("post.editAny") || t.can("design.layout");
  const rows: ContentRow[] = posts.map((p) => ({
    id: p.id,
    title: p.title,
    slug: p.slug,
    status: p.status,
    authorName: p.author?.name ?? p.author?.email ?? "—",
    updatedAt: p.updatedAt.toISOString(),
    publishedAt: p.publishedAt?.toISOString() ?? null,
    scheduledAt: p.scheduledAt?.toISOString() ?? null,
    isLive: !!p.publishedRevisionId,
    hasPendingChanges: !!p.publishedRevisionId && p.revisions[0]?.id !== p.publishedRevisionId,
    lockedBy: p.editLock && p.editLock.expiresAt > now && p.editLock.userId !== t.user.id ? p.editLock.user.name : null,
    terms: p.terms.map((x) => x.term.name),
    canEdit: canEditAny || (t.can("post.create") && p.authorId === t.user.id),
  }));

  const href = (patch: Record<string, string | number | null>) => {
    const next = new URLSearchParams();
    const merged = { type: type.key, status: statusKey, q, sort, dir, page: String(page), ...patch };
    for (const [k, v] of Object.entries(merged)) if (v !== null && v !== "" && !(k === "page" && v === "1") && !(k === "status" && v === "all")) next.set(k, String(v));
    return `/admin/sites/${t.site.id}/content?${next}`;
  };
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Content</h1>
          <p className="text-sm text-zinc-500">Every page and entry on {t.site.name}.</p>
        </div>
        {t.can("post.create") && (type.key !== "page" || t.can("design.layout")) && (
          <NewEntryButton siteId={t.site.id} postTypeId={type.id} label={type.labelSingular} />
        )}
      </div>

      <nav aria-label="Post types" className="mb-4 flex flex-wrap gap-2">
        {postTypes.map((p) => (
          <Link
            key={p.id}
            href={`/admin/sites/${t.site.id}/content?type=${p.key}`}
            aria-current={p.id === type.id ? "page" : undefined}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${p.id === type.id ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400"}`}
          >
            {p.icon && <span aria-hidden>{p.icon}</span>}
            {p.labelPlural}
            <span className={`text-xs ${p.id === type.id ? "text-zinc-300" : "text-zinc-400"}`}>{p._count.posts}</span>
          </Link>
        ))}
      </nav>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Filter by status" className="flex flex-wrap gap-1 text-sm">
          {STATUS_TABS.map((s, i) => (
            <Link
              key={s.key}
              href={href({ status: s.key, page: 1 })}
              aria-current={s.key === statusKey ? "true" : undefined}
              className={`rounded-md px-2.5 py-1 ${s.key === statusKey ? "bg-white font-medium text-zinc-900 shadow-sm ring-1 ring-zinc-200" : "text-zinc-600 hover:text-zinc-900"}`}
            >
              {s.label} <span className="text-zinc-400">({counts[i]})</span>
            </Link>
          ))}
        </nav>
        <form role="search" action={`/admin/sites/${t.site.id}/content`} className="flex gap-2">
          <input type="hidden" name="type" value={type.key} />
          {statusKey !== "all" && <input type="hidden" name="status" value={statusKey} />}
          <label htmlFor="content-search" className="sr-only">Search {type.labelPlural.toLowerCase()}</label>
          <input
            id="content-search"
            name="q"
            defaultValue={q}
            placeholder={`Search ${type.labelPlural.toLowerCase()}…`}
            className="w-64 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
          />
          <button className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50">Search</button>
        </form>
      </div>

      <ContentTable
        siteId={t.site.id}
        liveBase={`/sites/${t.site.subdomain}`}
        postType={{ key: type.key, label: type.labelSingular, plural: type.labelPlural, usesBuilder: type.usesBuilder, routePrefix: type.routePrefix }}
        rows={rows}
        trash={statusKey === "trash"}
        perms={{
          publish: t.can("post.publish"),
          create: t.can("post.create") && (type.key !== "page" || t.can("design.layout")),
          restore: t.can("revisions.restore"),
          visual: t.can("content.edit") || t.can("design.layout"),
        }}
        sort={{ key: sort, dir, hrefs: Object.fromEntries((Object.keys(SORTS) as SortKey[]).map((k) => [k, href({ sort: k, dir: sort === k && dir === "asc" ? "desc" : "asc", page: 1 })])) }}
      />

      <div className="mt-4 flex items-center justify-between text-sm text-zinc-600">
        <p>
          {total === 0 ? "No entries" : `${(page - 1) * PER_PAGE + 1}–${Math.min(page * PER_PAGE, total)} of ${total}`}
        </p>
        {pages > 1 && (
          <nav aria-label="Pagination" className="flex items-center gap-2">
            {page > 1 ? <Link className="rounded-md border border-zinc-300 bg-white px-3 py-1 hover:bg-zinc-50" href={href({ page: page - 1 })}>Previous</Link> : null}
            <span>
              Page {page} of {pages}
            </span>
            {page < pages ? <Link className="rounded-md border border-zinc-300 bg-white px-3 py-1 hover:bg-zinc-50" href={href({ page: page + 1 })}>Next</Link> : null}
          </nav>
        )}
      </div>
    </main>
  );
}
