import { connection } from "next/server";
import { absoluteUrl } from "@/lib/seo/meta";
import { readSiteSeo } from "@/lib/seo/settings";
import { robotsTxt } from "@/lib/seo/sitemap";
import { resolveSite } from "@/server/public-site";
import { publicBaseUrl } from "@/server/seo/public-url";

/**
 * /robots.txt for one site. Sites that aren't live yet, or that ask not to
 * be indexed, disallow everything; others point crawlers at the sitemap.
 */
export async function GET(_req: Request, ctx: RouteContext<"/sites/[site]/robots.txt">) {
  // Rendered per request (the CDN caches it), so builds never need the database.
  await connection();
  const { site: key } = await ctx.params;
  const site = await resolveSite(key);
  if (!site) return new Response("Not found", { status: 404 });
  const base = await publicBaseUrl(site);
  const disallowAll = site.status !== "LIVE" || !!readSiteSeo(site.settings).discourageIndexing;
  return new Response(robotsTxt({ sitemapUrl: absoluteUrl(base, "/sitemap.xml"), disallowAll }), {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=0, s-maxage=3600" },
  });
}
