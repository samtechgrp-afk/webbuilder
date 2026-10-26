import { sitemapXml } from "@/lib/seo/sitemap";
import { resolveSite } from "@/server/public-site";
import { publicBaseUrl } from "@/server/seo/public-url";
import { getSitemapUrls } from "@/server/seo/seo-service";

/** /sitemap.xml for one site (the proxy maps the site's own host here). Live, indexable URLs only. */
export async function GET(_req: Request, ctx: RouteContext<"/sites/[site]/sitemap.xml">) {
  const { site: key } = await ctx.params;
  const site = await resolveSite(key);
  if (!site) return new Response("Not found", { status: 404 });
  const base = await publicBaseUrl(site);
  return new Response(sitemapXml(await getSitemapUrls(site.id, base)), {
    headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=0, s-maxage=3600" },
  });
}
