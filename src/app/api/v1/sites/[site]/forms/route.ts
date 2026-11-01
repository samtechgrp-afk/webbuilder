import { NextResponse } from "next/server";
import { submitForm } from "@/server/forms/form-service";

/**
 * POST /api/v1/sites/<site>/forms: a Contact form or Newsletter widget's
 * submission (multipart/form-data, `_form` = the widget's id).
 *
 * The site script sends `Accept: application/json` and shows the answer in
 * place. Without JavaScript the browser posts the form itself and gets a small
 * page back, with a link to where the visitor came from.
 */

const MAX_BODY = 4.5 * 1024 * 1024;

export async function POST(request: Request, { params }: RouteContext<"/api/v1/sites/[site]/forms">) {
  const { site } = await params;
  const wantsJson = (request.headers.get("accept") ?? "").includes("application/json");
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY) return reply(wantsJson, request, { ok: false, status: 413, message: "That's too much to send at once. Attach a smaller file." });

  let data: FormData;
  try {
    data = await request.formData();
  } catch {
    return reply(wantsJson, request, { ok: false, status: 400, message: "We couldn't read the form. Please try again." });
  }
  const referer = safeReferer(request);
  const outcome = await submitForm(site, data, {
    ip: (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || request.headers.get("x-real-ip"),
    userAgent: request.headers.get("user-agent"),
    pagePath: referer ? new URL(referer).pathname : null,
  });
  return reply(wantsJson, request, outcome);
}

type Outcome = Awaited<ReturnType<typeof submitForm>>;

function reply(json: boolean, request: Request, outcome: Outcome) {
  const status = outcome.ok ? 200 : outcome.status;
  if (json) return NextResponse.json(outcome.ok ? { ok: true } : { ok: false, message: outcome.message, errors: outcome.errors ?? {} }, { status, headers: { "Cache-Control": "no-store" } });
  const back = safeReferer(request);
  const title = outcome.ok ? (outcome.kind === "newsletter" ? "You're subscribed" : "Message sent") : "Something's not right";
  const text = outcome.ok ? (outcome.kind === "newsletter" ? "Thanks for signing up." : "Thanks! We got your message.") : outcome.message;
  const list = !outcome.ok && outcome.errors ? Object.values(outcome.errors) : [];
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title>
<style>body{margin:0;min-height:100dvh;display:grid;place-items:center;font:16px/1.6 system-ui,sans-serif;background:#fafafa;color:#18181b}main{max-width:32rem;margin:1.5rem;padding:2rem;border-radius:12px;background:#fff;box-shadow:0 10px 40px -20px rgba(0,0,0,.3)}h1{margin:0 0 .5rem;font-size:1.4rem}ul{padding-left:1.2rem;color:#b91c1c}a{color:inherit}</style></head>
<body><main><h1>${esc(title)}</h1><p>${esc(text)}</p>${list.length ? `<ul>${list.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>` : ""}${back ? `<p><a href="${esc(back)}">${outcome.ok ? "← Back to the site" : "← Go back and fix it"}</a></p>` : ""}</main></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

/** Only http(s) pages; used for the "back" link and the page path stored with a message. */
function safeReferer(request: Request) {
  const ref = request.headers.get("referer");
  if (!ref) return null;
  try {
    const u = new URL(ref);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
