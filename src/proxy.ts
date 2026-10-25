import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session-token";

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
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:png|jpg|jpeg|webp|svg|ico|css|js)$).*)"],
};
