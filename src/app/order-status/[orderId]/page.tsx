import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/commerce/money";
import { addressLines, type PostalAddress } from "@/lib/email/layout";
import { verifyOrderStatusToken } from "@/lib/order-status-token";
import { siteBaseUrl } from "@/server/email/links";

export const metadata: Metadata = { title: "Order status", robots: { index: false, follow: false } };
export const instant = false;

const STEPS = ["Paid", "Fulfilled"] as const;
const LABEL: Record<string, string> = { PENDING: "Awaiting payment", PAID: "Paid, being prepared", FULFILLED: "Fulfilled", REFUNDED: "Refunded", CANCELLED: "Cancelled" };

/**
 * The customer's order page, linked from the receipt. There are no customer
 * accounts, so access is the HMAC token in the link; the proxy answers a
 * wrong token with a 404 before this page renders (checked again here).
 */
export default async function OrderStatusPage({ params, searchParams }: PageProps<"/order-status/[orderId]">) {
  const { orderId } = await params;
  const { t } = await searchParams;
  if (!verifyOrderStatusToken(orderId, typeof t === "string" ? t : null)) notFound();
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true, site: { select: { name: true, subdomain: true, customDomain: true, branding: true } } } });
  if (!order) notFound();

  const branding = (order.site.branding ?? {}) as { accent?: string; logoText?: string };
  const accent = branding.accent && /^#[0-9a-f]{3,8}$/i.test(branding.accent) ? branding.accent : "#18181b";
  const money = (n: number) => formatMoney(n, order.currency, order.locale || "en-US");
  const subtotal = order.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const addr = addressLines(order.shippingAddr as PostalAddress | null);
  const reached = order.status === "FULFILLED" ? 2 : order.status === "PAID" ? 1 : 0;

  return (
    <main className="min-h-dvh bg-zinc-100 px-4 py-10">
      <div className="mx-auto max-w-xl rounded-2xl border border-zinc-200 bg-white shadow-sm" data-order-status-page={order.status}>
        <header className="border-b border-zinc-100 px-6 py-5">
          <a href={siteBaseUrl(order.site)} className="text-lg font-bold" style={{ color: accent }}>{branding.logoText || order.site.name}</a>
        </header>
        <section className="px-6 py-6">
          <p className="text-sm text-zinc-500">Order #{order.number}</p>
          <h1 className="mt-1 text-2xl font-semibold text-zinc-900">{LABEL[order.status] ?? order.status}</h1>
          {order.status !== "CANCELLED" && order.status !== "REFUNDED" && (
            <ol className="mt-5 flex gap-2" aria-label="Progress">
              {STEPS.map((s, i) => (
                <li key={s} className="flex-1">
                  <div className="h-1.5 rounded-full" style={{ background: i < reached ? accent : "#e4e4e7" }} />
                  <p className={`mt-1.5 text-xs ${i < reached ? "font-semibold text-zinc-900" : "text-zinc-400"}`}>{s}</p>
                </li>
              ))}
            </ol>
          )}
          <table className="mt-6 w-full text-sm">
            <tbody>
              {order.items.map((i) => (
                <tr key={i.id} className="border-b border-zinc-100">
                  <td className="py-2.5">
                    <span className="font-medium text-zinc-900">{i.title}</span>
                    {i.variantTitle && <span className="block text-xs text-zinc-500">{i.variantTitle}</span>}
                  </td>
                  <td className="py-2.5 text-center text-zinc-500">× {i.quantity}</td>
                  <td className="py-2.5 text-right">{money(i.price * i.quantity)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="text-zinc-600">
              <tr><td colSpan={2} className="pt-3">Subtotal</td><td className="pt-3 text-right">{money(subtotal)}</td></tr>
              {order.shippingAmount > 0 && <tr><td colSpan={2}>Shipping</td><td className="text-right">{money(order.shippingAmount)}</td></tr>}
              {order.taxAmount > 0 && <tr><td colSpan={2}>Tax</td><td className="text-right">{money(order.taxAmount)}</td></tr>}
              <tr className="text-base font-semibold text-zinc-900"><td colSpan={2} className="pt-2">Total</td><td className="pt-2 text-right" data-order-total="">{money(order.totalAmount)}</td></tr>
            </tfoot>
          </table>
          {addr.length > 0 && (
            <div className="mt-6 text-sm">
              <p className="font-semibold text-zinc-900">Shipping to</p>
              <p className="mt-1 whitespace-pre-line text-zinc-600">{addr.join("\n")}</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
