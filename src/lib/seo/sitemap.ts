/** sitemap.xml and robots.txt bodies. Pure, so they're easy to test. */

export interface SitemapUrl {
  loc: string;
  lastmod?: Date | null;
  changefreq?: "daily" | "weekly" | "monthly";
  priority?: number;
}

const xmlEscape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

export function sitemapXml(urls: SitemapUrl[]): string {
  const rows = urls.map((u) => {
    const parts = [`<loc>${xmlEscape(u.loc)}</loc>`];
    if (u.lastmod) parts.push(`<lastmod>${u.lastmod.toISOString()}</lastmod>`);
    if (u.changefreq) parts.push(`<changefreq>${u.changefreq}</changefreq>`);
    if (u.priority !== undefined) parts.push(`<priority>${u.priority.toFixed(1)}</priority>`);
    return `  <url>${parts.join("")}</url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.join("\n")}${rows.length ? "\n" : ""}</urlset>\n`;
}

export function robotsTxt({ sitemapUrl, disallowAll }: { sitemapUrl: string; disallowAll: boolean }): string {
  const lines = ["User-agent: *"];
  if (disallowAll) lines.push("Disallow: /");
  else lines.push("Allow: /", "Disallow: /admin", "Disallow: /login", "Disallow: /*?preview=");
  if (!disallowAll) lines.push("", `Sitemap: ${sitemapUrl}`);
  return `${lines.join("\n")}\n`;
}
