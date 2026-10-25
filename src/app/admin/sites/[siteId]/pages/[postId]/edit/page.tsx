import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ClientEditor } from "@/components/editor/ClientEditor";
import type { DesignTokens } from "@/lib/builder/styles";
import { isBuilderDocument } from "@/lib/builder/types";
import { getTenant } from "@/lib/tenant";
import { acquireEditLock } from "@/server/content-service";

export const metadata: Metadata = { title: "Editor" };

export default async function EditPage({ params }: PageProps<"/admin/sites/[siteId]/pages/[postId]/edit">) {
  const { siteId, postId } = await params;
  const t = await getTenant(siteId);
  if (!t.can("content.edit") && !t.can("design.layout")) notFound();

  const post = await t.db.post.findUnique({ where: { id: postId }, include: { postType: true } });
  if (!post || !post.postType.usesBuilder || !isBuilderDocument(post.draft)) notFound();

  const [lock, assets, revisions, latest] = await Promise.all([
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
  ]);

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
      />
    </div>
  );
}
