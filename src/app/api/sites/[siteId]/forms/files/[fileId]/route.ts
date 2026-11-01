import { getTenant } from "@/lib/tenant";
import { readSubmissionFile } from "@/server/forms/admin-service";

/**
 * Downloads a form attachment. Only members with `forms.manage` get it;
 * everyone else (and other sites' members) gets a 404. Always a download,
 * never rendered in the admin's origin.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/sites/[siteId]/forms/files/[fileId]">) {
  const { siteId, fileId } = await ctx.params;
  let found: Awaited<ReturnType<typeof readSubmissionFile>>;
  try {
    const t = await getTenant(siteId);
    if (!t.can("forms.manage")) return new Response("Not found", { status: 404 });
    found = await readSubmissionFile(t, fileId);
  } catch {
    return new Response("Not found", { status: 404 });
  }
  if (!found) return new Response("Not found", { status: 404 });
  const ascii = found.file.originalName.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "attachment";
  return new Response(found.body as Uint8Array<ArrayBuffer>, {
    headers: {
      "content-type": found.file.mimeType,
      "content-disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(found.file.originalName)}`,
      "content-length": String(found.body.byteLength),
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "content-security-policy": "sandbox; default-src 'none'",
    },
  });
}
