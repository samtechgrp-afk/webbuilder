import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session-token";
import { SITE_ROOT_HEADER } from "@/lib/site-url";
import { internalOrigin } from "@/lib/internal-origin";
import { checkPublicRoute } from "@/server/route-check";

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
 *    rewritten to the site's 404 page with HTTP status 404. Signed-in
 *    previews (`?preview=1`) skip the check; the page itself verifies the
 *    viewer may see drafts.
 */
const PORTAL_PATHS = /^\/(admin|login|logout|api|_next|uploads|favicon\.ico)(\/|$)/;

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const host = (request.headers.get("host") ?? "").toLowerCase();
  const root = (process.env.ROOT_DOMAIN ?? "localhost:3000").toLowerCase();
  const isPlatformHost = host === root || host.startsWith("127.0.0.1") || host === `www.${root}`;

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
    return (await notFoundRewrite(request, tenantKey, pathname, headers)) ?? NextResponse.rewrite(url, { request: { headers } });
  }

  const headers = new Headers(request.headers);
  headers.delete(SITE_ROOT_HEADER);
  const site = /^\/sites\/([^/]+)(\/.*)?$/.exec(pathname);
  if (site) {
    const miss = await notFoundRewrite(request, site[1], site[2] ?? "/", headers);
    if (miss) return miss;
  }
  if (pathname.startsWith("/site-404/")) {
    // The proxy's own fetch keeps its x-site-root, so links on the 404 page point at the right base.
    if (request.headers.get(INTERNAL_HEADER) === "1") return NextResponse.next();
    return serveNotFound(request, pathname.slice("/site-404/".length), headers);
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
async function serveNotFound(request: NextRequest, key: string, headers: Headers) {
  const url = request.nextUrl.clone();
  url.pathname = `/site-404/${key}`;
  url.search = "";
  if (request.headers.has("rsc")) return NextResponse.rewrite(url, { status: 404, request: { headers } });
  const forward = new Headers({ [INTERNAL_HEADER]: "1", accept: "text/html" });
  const ua = request.headers.get("user-agent");
  if (ua) forward.set("user-agent", ua);
  if (headers.get(SITE_ROOT_HEADER) === "1") forward.set(SITE_ROOT_HEADER, "1");
  const res = await fetch(new URL(url.pathname, internalOrigin()), { headers: forward, cache: "no-store" });
  return new NextResponse(res.body, {
    status: 404,
    headers: { "content-type": res.headers.get("content-type") ?? "text/html; charset=utf-8", "cache-control": "private, no-cache, no-store, max-age=0, must-revalidate" },
  });
}

async function notFoundRewrite(request: NextRequest, key: string, path: string, headers: Headers) {
  if (SEO_FILES.test(path)) return null;
  if (request.nextUrl.searchParams.has("preview") && (await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value))) return null;
  let check: Awaited<ReturnType<typeof checkPublicRoute>>;
  try {
    check = await checkPublicRoute(key, path.split("/").filter(Boolean).map((p) => decodeURIComponent(p)));
  } catch (err) {
    if (!(err instanceof URIError)) throw err;
    check = { site: true, exists: false };
  }
  if (check.site && check.exists) return null;
  return serveNotFound(request, key, headers);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:png|jpg|jpeg|webp|svg|ico|css|js)$).*)"],
};
