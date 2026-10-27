import "server-only";
import { platformDomain } from "@/lib/env.mjs";
import { orderStatusToken } from "@/lib/order-status-token";

/**
 * Absolute links for emails, which are built outside any page request (a
 * Stripe webhook, a server action), so they can't use the Host header.
 */

const isLocal = (host: string) => /^(localhost|127\.|\[::1\])|\.localhost(:|$)/.test(host);

export const platformOrigin = () => {
  const host = platformDomain();
  return `${isLocal(host) ? "http" : "https"}://${host}`;
};

/** A site's address: its custom domain, else the platform path, which always resolves. */
export const siteBaseUrl = (site: { subdomain: string; customDomain: string | null }) =>
  site.customDomain ? `https://${site.customDomain}` : `${platformOrigin()}/sites/${site.subdomain}`;

/** Served by the platform (not the site's host), so it works for every site and domain. */
export const orderStatusUrl = (orderId: string) => `${platformOrigin()}/order-status/${orderId}?t=${orderStatusToken(orderId)}`;
