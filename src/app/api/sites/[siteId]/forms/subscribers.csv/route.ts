import { getTenant } from "@/lib/tenant";
import { subscribersCsv } from "@/server/forms/admin-service";

/** Every subscriber (and unsubscribe) as CSV, for importing into an email tool. */
export async function GET(_req: Request, ctx: RouteContext<"/api/sites/[siteId]/forms/subscribers.csv">) {
  const { siteId } = await ctx.params;
  let csv: string;
  try {
    const t = await getTenant(siteId);
    if (!t.can("forms.manage")) return new Response("Not found", { status: 404 });
    csv = await subscribersCsv(t);
  } catch {
    return new Response("Not found", { status: 404 });
  }
  return new Response(csv, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="subscribers-${new Date().toISOString().slice(0, 10)}.csv"`, "cache-control": "private, no-store" },
  });
}
