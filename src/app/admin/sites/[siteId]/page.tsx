import type { Metadata } from "next";
import Link from "next/link";
import { getTenant } from "@/lib/tenant";

export const metadata: Metadata = { title: "Dashboard" };

const STATUS_STYLE: Record<string, string> = {
  PUBLISHED: "bg-emerald-50 text-emerald-700",
  DRAFT: "bg-zinc-100 text-zinc-600",
  PENDING_REVIEW: "bg-amber-50 text-amber-700",
  SCHEDULED: "bg-sky-50 text-sky-700",
  ARCHIVED: "bg-zinc-100 text-zinc-400",
};

export default async function SiteDashboard({ params }: PageProps<"/admin/sites/[siteId]">) {
  const { siteId } = await params;
  const t = await getTenant(siteId);

  const [posts, mediaCount, activity] = await Promise.all([
    t.db.post.findMany({
      orderBy: [{ postType: { key: "asc" } }, { menuOrder: "asc" }, { title: "asc" }],
      include: { postType: true, editLock: { include: { user: { select: { name: true } } } } },
    }),
    t.db.mediaAsset.count(),
    t.db.postRevision.findMany({
      orderBy: { createdAt: "desc" },
      take: 6,
      include: { author: { select: { name: true } }, post: { select: { title: true } } },
    }),
  ]);

  const liveUrl = `/sites/${t.site.subdomain}`;
  const canEdit = t.can("content.edit") || t.can("design.layout");

  return (
    <main className="mx-auto grid max-w-6xl gap-8 px-6 py-8 lg:grid-cols-[1fr_320px]">
      <section>
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">Pages & content</h1>
            <p className="text-sm text-zinc-500">Edit anything visually. Your designer has protected the layout, so nothing can break.</p>
          </div>
          <a href={liveUrl} target="_blank" rel="noreferrer" className="text-sm font-medium text-zinc-700 hover:text-zinc-900">
            View site ↗
          </a>
        </div>
        <ul className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 bg-white">
          {posts.map((p) => {
            const lockedBy = p.editLock && p.editLock.expiresAt > new Date() && p.editLock.userId !== t.user.id ? p.editLock.user.name : null;
            return (
              <li key={p.id} className="flex items-center gap-4 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-zinc-900">{p.title}</p>
                  <p className="text-xs text-zinc-500">
                    {p.postType.labelSingular} · /{p.slug === "home" ? "" : p.slug}
                    {lockedBy && <span className="ml-2 text-amber-700">· {lockedBy} is editing</span>}
                  </p>
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[p.status]}`}>{p.status.replace("_", " ").toLowerCase()}</span>
                {canEdit && p.postType.usesBuilder && (
                  <Link
                    href={`/admin/sites/${t.site.id}/pages/${p.id}/edit`}
                    className="rounded-lg px-3 py-1.5 text-sm font-medium text-white"
                    style={{ background: "var(--accent)" }}
                  >
                    Edit visually
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <aside className="space-y-6">
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Pages & posts" value={posts.length} />
          <Stat label="Media files" value={mediaCount} />
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-zinc-900">Recent activity</h2>
          <ul className="space-y-3 text-sm">
            {activity.map((r) => (
              <li key={r.id}>
                <p className="text-zinc-800">
                  {r.author?.name ?? "Someone"} {r.kind === "PUBLISHED" ? "published" : r.kind === "RESTORED" ? "restored" : "edited"} {r.post.title}
                </p>
                <p className="text-xs text-zinc-500">{r.createdAt.toLocaleString()}</p>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <p className="text-2xl font-semibold text-zinc-900">{value}</p>
      <p className="text-xs text-zinc-500">{label}</p>
    </div>
  );
}
