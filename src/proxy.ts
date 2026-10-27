import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session-token";
import { SITE_ROOT_HEADER } from "@/lib/site-url";
import { internalOrigin } from "@/lib/internal-origin";
import { LOCALE_COOKIE, LOCALE_HEADER, groupAlternates, linkHeader, localeHref, matchAcceptLanguage } from "@/lib/i18n/locales";
import { checkPublicRoute, type RouteCheck } from "@/server/route-check";
import { platformDomain } from "@/lib/env.mjs";
import { verifyOrderStatusToken } from "@/lib/order-status-token";

/**
 * Edge of the platform (Next.js 16 "proxy", formerly middleware).
 *
 * 1. Host routing: the platform host serves the admin app. Any other host is
 *    a client website: `aurelia.<ROOT_DOMAIN>` or `www.aurelia.com` is
 *    rewritten to `/sites/<host>/…`, which resolves the tenant by subdomain
 *    or custom domain. Portal paths (/admin, /login) work on every host, so a
 *    client can sign in at their own domain.
 * 2. Optimistic auth: /admin without a valid session cookie goes to /login.
 *    This is only a fast path; every page and action re-checks the session
 *    and the site Membership on the server.
 * 3. Real 404s: a public URL that doesn't resolve to live content is
 *    rewritten to the site's 404 page with HTTP status 404 (in the
 *    visitor's language when that page is translated). Signed-in previews
 *    (`?preview=1`) skip the check; the page itself verifies the viewer may
 *    see drafts.
 * 4. Languages: /fr/… selects a language (or the host is a language's own
 *    domain). A default-language address that has a translation at another
 *    slug redirects there; one without a translation shows the default
 *    content. Opt-in Accept-Language detection sends first-time visitors
 *    of a clean URL to their language once (then a cookie remembers the
 *    choice), and every page announces its translations in a Link header.
 */
const PORTAL_PATHS = /^\/(admin|login|logout|signup|order-status|api|_next|uploads|favicon\.ico)(\/|$)/;

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const host = (request.headers.get("host") ?? "").toLowerCase();
  const root = platformDomain();
  const isPlatformHost = host === root || host.startsWith("127.0.0.1") || host === `www.${root}`;

  const orderStatus = /^\/order-status\/([^/]+)$/.exec(pathname);
  if (orderStatus && !verifyOrderStatusToken(decodeURIComponent(orderStatus[1]), request.nextUrl.searchParams.get("t"))) {
    return new NextResponse("<!doctype html><title>Not found</title><p style=\"font:16px system-ui;margin:3rem auto;max-width:32rem\">This order link isn’t valid. Use the link in your receipt email.</p>", {
      status: 404,
      headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex" },
    });
  }

  if (pathname.startsWith("/admin")) {
    const sid = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
    if (!sid) {
      const url = new URL("/login", request.url);
      url.searchParams.set("next", pathname + search);
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (!isPlatformHost && !PORTAL_PATHS.test(pathname) && !pathname.startsWith("/sites/")) {
    const tenantKey = host.endsWith(`.${root}`) ? host.slice(0, -(root.length + 1)) : host;
    const url = request.nextUrl.clone();
    url.pathname = `/sites/${encodeURIComponent(tenantKey)}${pathname === "/" ? "" : pathname}`;
    // Tells the site renderer its links live at the domain root, not under /sites/<key>.
    const headers = new Headers(request.headers);
    headers.set(SITE_ROOT_HEADER, "1");
    const route = await publicRoute(request, tenantKey, pathname, headers, true);
    if (route instanceof NextResponse) return route;
    return withLink(NextResponse.rewrite(url, { request: { headers } }), route.link);
  }

  const headers = new Headers(request.headers);
  headers.delete(SITE_ROOT_HEADER);
  const site = /^\/sites\/([^/]+)(\/.*)?$/.exec(pathname);
  if (site) {
    const route = await publicRoute(request, site[1], site[2] ?? "/", headers, false);
    if (route instanceof NextResponse) return route;
    return withLink(NextResponse.next({ request: { headers } }), route.link);
  }
  if (pathname.startsWith("/site-404/")) {
    // The proxy's own fetch keeps its x-site-root, so links on the 404 page point at the right base.
    if (request.headers.get(INTERNAL_HEADER) === "1") return NextResponse.next();
    headers.delete(LOCALE_HEADER);
    return serveNotFound(request, pathname.slice("/site-404/".length), headers, null);
  }
  return NextResponse.next({ request: { headers } });
}

const INTERNAL_HEADER = "x-site-404-internal";

/** Served by their own route handlers (which 404 unknown sites themselves), not by the page resolver. */
const SEO_FILES = /^\/(robots\.txt|sitemap\.xml)$/;

/**
 * Responds with the site's 404 page and HTTP status 404. With Partial
 * Prerendering a rewritten page keeps its prerendered 200, so documents are
 * fetched from the 404 route and streamed back under a 404 status. Client
 * navigations (RSC requests) are rewritten as usual: the browser shows the
 * 404 layout and the status doesn't matter there.
 */
async function serveNotFound(request: NextRequest, key: string, headers: Headers, locale: string | null) {
  const url = request.nextUrl.clone();
  url.pathname = `/site-404/${key}`;
  url.search = "";
  if (locale) headers.set(LOCALE_HEADER, locale);
  if (request.headers.has("rsc")) return NextResponse.rewrite(url, { status: 404, request: { headers } });
  const forward = new Headers({ [INTERNAL_HEADER]: "1", accept: "text/html" });
  if (locale) forward.set(LOCALE_HEADER, locale);
  const ua = request.headers.get("user-agent");
  if (ua) forward.set("user-agent", ua);
  if (headers.get(SITE_ROOT_HEADER) === "1") forward.set(SITE_ROOT_HEADER, "1");
  const res = await fetch(new URL(url.pathname, internalOrigin()), { headers: forward, cache: "no-store" });
  return new NextResponse(res.body, {
    status: 404,
    headers: { "content-type": res.headers.get("content-type") ?? "text/html; charset=utf-8", "cache-control": "private, no-cache, no-store, max-age=0, must-revalidate" },
  });
}

const BOT_UA = /bot|crawl|spider|slurp|facebookexternalhit|embedly|preview|lighthouse|headless/i;

function withLink(res: NextResponse, link: string | null) {
  if (link) res.headers.set("link", link);
  return res;
}

/** The site's main public base URL (for absolute hreflang links), seen from this request. */
function mainBase(request: NextRequest, key: string, check: Extract<RouteCheck, { site: true }>, onOwnHost: boolean) {
  if (check.customDomain) return `https://${check.customDomain}`;
  const origin = request.nextUrl.origin;
  if (!onOwnHost) return `${origin}/sites/${key}`;
  if (!check.hostLocale) return origin;
  const root = platformDomain();
  return `${request.nextUrl.protocol}//${check.subdomain}.${root}`;
}

/** Routing for one public site URL: a response (404, redirect) or the Link header to add. */
async function publicRoute(request: NextRequest, key: string, path: string, headers: Headers, onOwnHost: boolean): Promise<NextResponse | { link: string | null }> {
  headers.delete(LOCALE_HEADER);
  if (SEO_FILES.test(path)) return { link: null };
  if (request.nextUrl.searchParams.has("preview") && (await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value))) return { link: null };
  let check: RouteCheck;
  try {
    check = await checkPublicRoute(key, path.split("/").filter(Boolean).map((p) => decodeURIComponent(p)));
  } catch (err) {
    if (!(err instanceof URIError)) throw err;
    return serveNotFound(request, key, headers, null);
  }
  if (!check.site) return serveNotFound(request, key, headers, null);
  if (!check.exists) return serveNotFound(request, key, headers, check.locale && check.locales.find((l) => l.code === check.locale && !l.isDefault) ? check.locale : null);

  const base = mainBase(request, key, check, onOwnHost);
  const ctx = { siteBase: onOwnHost ? "" : `/sites/${key}`, hostLocale: check.hostLocale, mainOrigin: base };
  const href = (code: string, sitePath: string) => {
    const target = localeHref(check.locales.find((l) => l.code === code) ?? null, sitePath, ctx);
    return new URL(target + request.nextUrl.search, request.url);
  };

  if (check.redirect && check.locale) return NextResponse.redirect(href(check.locale, check.redirect), 308);

  if (
    check.localeDetection &&
    request.method === "GET" &&
    !check.prefixed &&
    !check.hostLocale &&
    !request.headers.has("rsc") &&
    !request.cookies.has(LOCALE_COOKIE) &&
    !BOT_UA.test(request.headers.get("user-agent") ?? "")
  ) {
    const wanted = matchAcceptLanguage(request.headers.get("accept-language"), check.locales);
    const target = wanted && !wanted.isDefault ? check.alternates.find((a) => a.localeCode === wanted.code) : undefined;
    if (wanted && target) {
      const res = NextResponse.redirect(href(wanted.code, target.path), 307);
      // Once is enough: a visitor who then picks another language keeps it.
      res.cookies.set(LOCALE_COOKIE, wanted.code, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
      res.headers.set("vary", "accept-language, cookie");
      return res;
    }
  }
  const alternates = groupAlternates(check.alternates, check.locales, base);
  return { link: alternates.length > 1 ? linkHeader(alternates) : null };
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:png|jpg|jpeg|webp|svg|ico|css|js)$).*)"],
};
