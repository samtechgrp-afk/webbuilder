import { NextResponse } from "next/server";
import { getApiEntries, resolveSite } from "@/server/public-site";

/**
 * Public, read-only REST endpoint for post types with "Public REST API" on.
 * Only published entries, read from their published revisions.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/v1/sites/[site]/[type]">) {
  const { site: key, type } = await ctx.params;
  const site = await resolveSite(key);
  if (!site) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const page = Math.max(1, Math.min(1000, Number(new URL(request.url).searchParams.get("page")) || 1));
  const data = await getApiEntries(site.id, type, page);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data, { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } });
}
