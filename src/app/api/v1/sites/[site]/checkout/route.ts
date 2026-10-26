import { NextResponse } from "next/server";
import { startCheckout } from "@/server/commerce/checkout";

/**
 * POST /api/v1/sites/<site>/checkout: { items, path, locale } → { url } of a
 * Stripe Checkout page. Called by the cart drawer on the site's own pages,
 * so it answers same-origin requests only.
 */
export async function POST(request: Request, { params }: RouteContext<"/api/v1/sites/[site]/checkout">) {
  const { site } = await params;
  const origin = requestOrigin(request);
  const sent = request.headers.get("origin");
  if (sent && sent !== origin) return NextResponse.json({ error: "Cross-site checkout requests aren't allowed" }, { status: 403 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const result = await startCheckout(site, body, origin);
  if (!result.ok) return NextResponse.json({ error: result.error, problems: result.problems }, { status: result.status, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ url: result.url }, { headers: { "Cache-Control": "no-store" } });
}

/** The origin the visitor is on (the site's own host, or the platform host for /sites/<sub>). */
function requestOrigin(request: Request) {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host;
  const proto = (request.headers.get("x-forwarded-proto") ?? (/^(localhost|127\.|\[::1\])|\.localhost(:|$)/.test(host) ? "http" : "https")).split(",")[0].trim();
  return `${proto}://${host}`;
}
