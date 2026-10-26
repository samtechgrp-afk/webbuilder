import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, StatusBadge } from "@/components/cms/ui";
import { formatMoney } from "@/lib/commerce/money";
import { getTenant } from "@/lib/tenant";
import { allowedTransitions, getOrder } from "@/server/commerce/order-service";
import { OrderActions } from "./OrderActions";

export const metadata: Metadata = { title: "Order" };

interface Address {
  name?: string | null;
  address?: { line1?: string | null; line2?: string | null; postal_code?: string | null; city?: string | null; state?: string | null; country?: string | null } | null;
}

const when = (d: Date | null) => (d ? d.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : null);

export default async function OrderPage({ params }: PageProps<"/admin/sites/[siteId]/orders/[orderId]">) {
  const { siteId, orderId } = await params;
  const t = await getTenant(siteId);
  if (!t.can("commerce.manage")) notFound();
  const order = await getOrder(t, orderId);
  if (!order) notFound();
  const money = (n: number) => formatMoney(n, order.currency);
  const ship = (order.shippingAddr ?? null) as Address | null;
  const a = ship?.address;
  const dashboard = order.stripePaymentIntentId ? `https://dashboard.stripe.com/payments/${order.stripePaymentIntentId}` : null;

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <nav className="mb-2 text-sm text-zinc-500">
        <Link href={`/admin/sites/${t.site.id}/orders`} className="hover:text-zinc-900">Orders</Link> /
      </nav>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-zinc-900">Order #{order.number}</h1>
          <span data-order-status={order.status}><StatusBadge status={order.status} /></span>
        </div>
        <OrderActions siteId={t.site.id} orderId={order.id} transitions={allowedTransitions(order.status)} />
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Card title="Items">
          <table className="w-full text-sm" data-order-items="">
            <tbody className="divide-y divide-zinc-100">
              {order.items.map((i) => (
                <tr key={i.id}>
                  <td className="py-2">
                    {i.product ? (
                      <Link href={`/admin/sites/${t.site.id}/products/${i.product.id}`} className="font-medium text-zinc-900 hover:underline">{i.title}</Link>
                    ) : (
                      <span className="font-medium text-zinc-900">{i.title}</span>
                    )}
                    {i.variantTitle && <span className="block text-xs text-zinc-500">{i.variantTitle}</span>}
                    {i.sku && <span className="block text-xs text-zinc-400">SKU {i.sku}</span>}
                  </td>
                  <td className="py-2 text-right tabular-nums text-zinc-600">{money(i.price)} × {i.quantity}</td>
                  <td className="py-2 text-right tabular-nums">{money(i.price * i.quantity)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-zinc-200">
                <td className="pt-3 font-semibold" colSpan={2}>Total {order.status === "PENDING" ? "(not paid)" : "paid"}</td>
                <td className="pt-3 text-right font-semibold tabular-nums" data-order-total="">{money(order.totalAmount)}</td>
              </tr>
            </tfoot>
          </table>
        </Card>
        <div className="space-y-5">
          <Card title="Customer">
            <dl className="space-y-1 text-sm">
              <dd className="font-medium text-zinc-900" data-order-customer="">{order.customerName ?? "—"}</dd>
              <dd className="text-zinc-600">{order.customerEmail ? <a href={`mailto:${order.customerEmail}`} className="hover:underline">{order.customerEmail}</a> : "Email not known yet"}</dd>
            </dl>
            {a && (
              <address className="mt-3 text-sm not-italic text-zinc-600" data-order-address="">
                <span className="block text-xs font-medium uppercase tracking-wider text-zinc-400">Ship to</span>
                {ship?.name && <span className="block">{ship.name}</span>}
                {[a.line1, a.line2].filter(Boolean).map((l) => <span key={l} className="block">{l}</span>)}
                <span className="block">{[a.postal_code, a.city, a.state].filter(Boolean).join(" ")}</span>
                {a.country && <span className="block">{a.country}</span>}
              </address>
            )}
          </Card>
          <Card title="Timeline">
            <ul className="space-y-1.5 text-sm text-zinc-600">
              <li>Checkout started {when(order.createdAt)}</li>
              {order.paidAt && <li>Paid {when(order.paidAt)}</li>}
              {order.fulfilledAt && <li>Fulfilled {when(order.fulfilledAt)}</li>}
              {order.status === "CANCELLED" && <li>Cancelled (checkout expired or failed)</li>}
              {order.status === "REFUNDED" && <li>Marked refunded</li>}
            </ul>
          </Card>
          <Card title="Payment">
            <dl className="space-y-1 text-xs text-zinc-500">
              <div><dt className="inline">Stripe session: </dt><dd className="inline break-all font-mono">{order.stripeSessionId ?? "—"}</dd></div>
              <div><dt className="inline">Payment: </dt><dd className="inline break-all font-mono">{order.stripePaymentIntentId ?? "—"}</dd></div>
            </dl>
            {dashboard && <a href={dashboard} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-medium text-zinc-800 underline underline-offset-2">Open in Stripe ↗</a>}
            <p className="mt-2 text-xs text-zinc-500">Issue refunds in Stripe, then mark the order refunded here.</p>
          </Card>
        </div>
      </div>
    </main>
  );
}
