import type { Prisma } from "@prisma/client";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTenant } from "@/lib/tenant";
import { MediaLibrary } from "./MediaLibrary";

export const metadata: Metadata = { title: "Media" };

const KIND_WHERE: Record<string, Prisma.MediaAssetWhereInput> = {
  image: { mimeType: { startsWith: "image/" } },
  video: { mimeType: { startsWith: "video/" } },
  document: { NOT: [{ mimeType: { startsWith: "image/" } }, { mimeType: { startsWith: "video/" } }] },
};

export default async function MediaPage({ params, searchParams }: PageProps<"/admin/sites/[siteId]/media">) {
  const { siteId } = await params;
  const sp = await searchParams;
  const t = await getTenant(siteId);
  if (!t.can("media.upload") && !t.can("media.manage")) notFound();
  const kind = typeof sp.kind === "string" && KIND_WHERE[sp.kind] ? sp.kind : "all";
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const view = sp.view === "list" ? "list" : "grid";

  const where: Prisma.MediaAssetWhereInput = {
    ...(KIND_WHERE[kind] ?? {}),
    ...(q
      ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { originalName: { contains: q, mode: "insensitive" } }, { altText: { contains: q, mode: "insensitive" } }, { tags: { has: q.toLowerCase() } }] }
      : {}),
  };
  const [assets, counts] = await Promise.all([
    t.db.mediaAsset.findMany({ where, orderBy: { createdAt: "desc" }, take: 300, include: { uploadedBy: { select: { name: true } } } }),
    Promise.all(["all", "image", "video", "document"].map((k) => t.db.mediaAsset.count({ where: KIND_WHERE[k] ?? {} }))),
  ]);

  return (
    <MediaLibrary
      key={`${kind}:${q}`}
      siteId={t.site.id}
      kind={kind}
      q={q}
      view={view}
      counts={{ all: counts[0], image: counts[1], video: counts[2], document: counts[3] }}
      perms={{ upload: t.can("media.upload"), manage: t.can("media.manage"), userId: t.user.id }}
      assets={assets.map((a) => ({
        id: a.id,
        url: a.url,
        title: a.title,
        altText: a.altText,
        caption: a.caption,
        description: a.description,
        tags: a.tags,
        originalName: a.originalName,
        mimeType: a.mimeType,
        width: a.width,
        height: a.height,
        sizeBytes: a.sizeBytes,
        variants: Object.keys((a.variants ?? {}) as object).map(Number).sort((x, y) => x - y),
        createdAt: a.createdAt.toISOString(),
        uploadedById: a.uploadedById,
        uploadedBy: a.uploadedBy?.name ?? null,
      }))}
    />
  );
}
