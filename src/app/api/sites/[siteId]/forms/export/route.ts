import { getTenant } from "@/lib/tenant";
import { submissionsCsv } from "@/server/forms/admin-service";

/** All non-spam messages (optionally of one form) as CSV, one column per field label. */
export async function GET(req: Request, ctx: RouteContext<"/api/sites/[siteId]/forms/export">) {
  const { siteId } = await ctx.params;
  const form = new URL(req.url).searchParams.get("form")?.slice(0, 60) || undefined;
  let csv: string;
  try {
    const t = await getTenant(siteId);
    if (!t.can("forms.manage")) return new Response("Not found", { status: 404 });
    csv = await submissionsCsv(t, form);
  } catch {
    return new Response("Not found", { status: 404 });
  }
  return new Response(csv, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="form-messages-${new Date().toISOString().slice(0, 10)}.csv"`, "cache-control": "private, no-store" },
  });
}
