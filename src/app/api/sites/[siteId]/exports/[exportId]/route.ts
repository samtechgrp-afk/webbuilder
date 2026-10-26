import { getTenant } from "@/lib/tenant";
import { readExport } from "@/server/export/export-service";

/**
 * Downloads a finished export. Members without `site.settings` (and anyone
 * who isn't a member of the site) get a 404, same as the export screen.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/sites/[siteId]/exports/[exportId]">) {
  const { siteId, exportId } = await ctx.params;
  let found: Awaited<ReturnType<typeof readExport>>;
  try {
    const t = await getTenant(siteId);
    if (!t.can("site.settings")) return new Response("Not found", { status: 404 });
    found = await readExport(t, exportId);
  } catch {
    return new Response("Not found", { status: 404 });
  }
  if (!found) return new Response("Not found", { status: 404 });
  const stamp = found.job.createdAt.toISOString().slice(0, 16).replace(/[:T]/g, "-");
  return new Response(new Uint8Array(found.data), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="site-export-${stamp}.zip"`,
      "content-length": String(found.data.byteLength),
      "cache-control": "private, no-store",
    },
  });
}
