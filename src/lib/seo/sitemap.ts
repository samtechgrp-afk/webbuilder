/** sitemap.xml and robots.txt bodies. Pure, so they're easy to test. */

export interface SitemapUrl {
  loc: string;
  lastmod?: Date | null;
  changefreq?: "daily" | "weekly" | "monthly";
  priority?: number;
  /** The same page in other languages (hreflang), the URL's own language included. */
  alternates?: { hreflang: string; href: string }[];
}

const xmlEscape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

export function sitemapXml(urls: SitemapUrl[]): string {
  const rows = urls.map((u) => {
    const parts = [`<loc>${xmlEscape(u.loc)}</loc>`];
    if (u.lastmod) parts.push(`<lastmod>${u.lastmod.toISOString()}</lastmod>`);
    if (u.changefreq) parts.push(`<changefreq>${u.changefreq}</changefreq>`);
    if (u.priority !== undefined) parts.push(`<priority>${u.priority.toFixed(1)}</priority>`);
    for (const a of u.alternates ?? []) parts.push(`<xhtml:link rel="alternate" hreflang="${xmlEscape(a.hreflang)}" href="${xmlEscape(a.href)}"/>`);
    return `  <url>${parts.join("")}</url>`;
  });
  const xhtml = urls.some((u) => u.alternates?.length) ? ' xmlns:xhtml="http://www.w3.org/1999/xhtml"' : "";
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${xhtml}>\n${rows.join("\n")}${rows.length ? "\n" : ""}</urlset>\n`;
}

export function robotsTxt({ sitemapUrl, disallowAll }: { sitemapUrl: string; disallowAll: boolean }): string {
  const lines = ["User-agent: *"];
  if (disallowAll) lines.push("Disallow: /");
  else lines.push("Allow: /", "Disallow: /admin", "Disallow: /login", "Disallow: /*?preview=");
  if (!disallowAll) lines.push("", `Sitemap: ${sitemapUrl}`);
  return `${lines.join("\n")}\n`;
}
