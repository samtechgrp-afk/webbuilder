import "server-only";
import { isBuilderDocument } from "@/lib/builder/types";
import { getTenant } from "@/lib/tenant";
import { buildDynamicPosts, draftSource, loadDynamicData } from "./cms/dynamic";

/**
 * Signed-in preview of unpublished content at its public address
 * (`?preview=1`). Only members who may edit content see drafts; for anyone
 * else this returns null and the page answers 404 like any visitor's.
 */
export async function getPreview(site: { id: string; name: string; settings: unknown; branding: unknown }, slugParts: string[] | undefined, linkBase: string) {
  const t = await getTenant(site.id);
  if (!t.can("content.edit") && !t.can("post.editAny") && !t.can("design.layout")) return null;
  const parts = slugParts ?? [];

  const page = await t.db.post.findFirst({ where: { slug: parts.length ? parts.join("/") : "home", postType: { key: "page" } } });
  if (page && isBuilderDocument(page.draft)) {
    return { kind: "page" as const, status: page.status, document: page.draft, data: await loadDynamicData(site.id, page.draft, site, await draftSource(t.db, page.id), linkBase) };
  }
  if (parts.length !== 2) return null;
  const postType = await t.db.postType.findFirst({
    where: { routePrefix: parts[0], key: { notIn: ["page", "template"] } },
    include: { singleTemplate: { include: { publishedRevision: true } } },
  });
  const post = postType && (await t.db.post.findFirst({ where: { postTypeId: postType.id, slug: parts[1] } }));
  const source = post && (await draftSource(t.db, post.id));
  if (!postType || !post || !source) return null;
  const [entry] = await buildDynamicPosts(t.db, [source]);
  const tplDoc = postType.singleTemplate?.publishedRevision?.document;
  const template = isBuilderDocument(tplDoc) ? tplDoc : null;
  return {
    kind: "entry" as const,
    status: post.status,
    postType,
    entry,
    template,
    data: template ? await loadDynamicData(site.id, template, site, source, linkBase) : null,
  };
}
