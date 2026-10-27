import "server-only";
import { headers } from "next/headers";
import { SITE_ROOT_HEADER } from "@/lib/site-url";
import { platformDomain } from "@/lib/env.mjs";

/**
 * The public base URL of a site, for canonical links, Open Graph URLs and
 * the sitemap. A custom domain is always the canonical home. Otherwise it's
 * the address the request came in on: the site's own host, or the platform
 * path /sites/<subdomain>.
 */
export async function publicBaseUrl(site: { subdomain: string; customDomain: string | null }) {
  if (site.customDomain) return `https://${site.customDomain}`;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (/^(localhost|127\.|\[::1\])|\.localhost(:|$)/.test(host) ? "http" : "https");
  return h.get(SITE_ROOT_HEADER) === "1" ? `${proto}://${host}` : `${proto}://${host}/sites/${site.subdomain}`;
}

/**
 * The site's main base URL when the request may have arrived on one of its
 * languages' own domains (where `publicBaseUrl` would return that domain).
 */
export async function mainBaseUrl(site: { subdomain: string; customDomain: string | null }, hostLocale: string | null) {
  if (site.customDomain || !hostLocale) return publicBaseUrl(site);
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (/^(localhost|127\.|\[::1\])|\.localhost(:|$)/.test(host) ? "http" : "https");
  return `${proto}://${site.subdomain}.${platformDomain()}`;
}
