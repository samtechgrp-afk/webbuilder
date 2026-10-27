/**
 * Shared shell for transactional emails: table layout and inline styles only,
 * so it renders the same in Gmail, Outlook and Apple Mail. Every dynamic value
 * goes through `esc`; templates build strings, never raw HTML from input.
 */

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const ENTITIES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export const esc = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (c) => ENTITIES[c]);

/** Only http(s) links make it into an href. */
export const safeHref = (url: string) => (/^https?:\/\//i.test(url) ? esc(url) : "#");

export interface Brand {
  name: string;
  accent?: string | null;
}

const accentOf = (brand: Brand) => (brand.accent && /^#[0-9a-f]{3,8}$/i.test(brand.accent) ? brand.accent : "#18181b");

export function button(label: string, href: string, brand: Brand) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0"><tr><td style="border-radius:8px;background:${accentOf(brand)}"><a href="${safeHref(href)}" style="display:inline-block;padding:12px 22px;font:600 15px/1 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#ffffff;text-decoration:none;border-radius:8px">${esc(label)}</a></td></tr></table>`;
}

export function badge(label: string, tone: "urgent" | "calm") {
  const [bg, fg] = tone === "urgent" ? ["#fef3c7", "#92400e"] : ["#e0f2fe", "#075985"];
  return `<span style="display:inline-block;padding:4px 10px;border-radius:999px;background:${bg};color:${fg};font:600 12px/1.4 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;letter-spacing:.02em">${esc(label)}</span>`;
}

/** Wraps body HTML in the responsive shell. `preheader` is the inbox preview line. */
export function layout(opts: { brand: Brand; preheader: string; body: string; footer: string }) {
  const { brand } = opts;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(brand.name)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(opts.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5"><tr><td align="center" style="padding:32px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;border:1px solid #e4e4e7">
<tr><td style="padding:24px 32px;border-bottom:1px solid #f4f4f5;font:700 18px/1.3 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:${accentOf(brand)}">${esc(brand.name)}</td></tr>
<tr><td style="padding:28px 32px;font:15px/1.6 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#27272a">${opts.body}</td></tr>
<tr><td style="padding:20px 32px;border-top:1px solid #f4f4f5;font:12px/1.6 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#71717a">${opts.footer}</td></tr>
</table></td></tr></table></body></html>`;
}

export const h1 = (text: string) => `<h1 style="margin:0 0 12px;font:700 22px/1.3 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#18181b">${esc(text)}</h1>`;
export const p = (html: string) => `<p style="margin:0 0 14px">${html}</p>`;

export interface Line {
  title: string;
  detail?: string | null;
  quantity: number;
  amount: string;
}

/** Itemised table: one row per line, then label/amount summary rows (bold last). */
export function itemsTable(lines: Line[], summary: [string, string][]) {
  const cell = "padding:10px 0;border-bottom:1px solid #f4f4f5;vertical-align:top";
  const rows = lines
    .map((l) => `<tr><td style="${cell}"><strong style="color:#18181b">${esc(l.title)}</strong>${l.detail ? `<br><span style="color:#71717a;font-size:13px">${esc(l.detail)}</span>` : ""}</td><td style="${cell};text-align:center;color:#52525b;white-space:nowrap">× ${esc(l.quantity)}</td><td style="${cell};text-align:right;white-space:nowrap">${esc(l.amount)}</td></tr>`)
    .join("");
  const sums = summary
    .map(([label, amount], i) => {
      const last = i === summary.length - 1;
      const style = `padding:${last ? "12px" : "6px"} 0 0;${last ? "font-weight:700;color:#18181b;font-size:16px" : "color:#52525b"}`;
      return `<tr><td colspan="2" style="${style}">${esc(label)}</td><td style="${style};text-align:right;white-space:nowrap">${esc(amount)}</td></tr>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;font-size:14px">${rows}${sums}</table>`;
}

export interface PostalAddress {
  name?: string | null;
  address?: { line1?: string | null; line2?: string | null; postal_code?: string | null; city?: string | null; state?: string | null; country?: string | null } | null;
}

/** Address lines from Stripe's shipping_details shape. */
export function addressLines(addr: PostalAddress | null | undefined): string[] {
  if (!addr) return [];
  const a = addr.address ?? {};
  return [addr.name, a.line1, a.line2, [a.postal_code, a.city].filter(Boolean).join(" "), a.state, a.country].filter((x): x is string => !!x && !!String(x).trim());
}

export const addressHtml = (lines: string[]) => lines.map(esc).join("<br>");
