import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/cms/ui";
import { formatMoney } from "@/lib/commerce/money";
import { getTenant } from "@/lib/tenant";
import { ORDER_TABS, listOrders } from "@/server/commerce/order-service";

export const metadata: Metadata = { title: "Orders" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function OrdersPage({ params, searchParams }: PageProps<"/admin/sites/[siteId]/orders">) {
  const { siteId } = await params;
  const sp = await searchParams;
  const t = await getTenant(siteId);
  if (!t.can("commerce.manage")) notFound();
  const q = (one(sp.q) ?? "").trim().slice(0, 100);
  const data = await listOrders(t, { tab: one(sp.status), q, page: Number(one(sp.page)) || 1 });
  const base = `/admin/sites/${t.site.id}/orders`;
  const href = (patch: Record<string, string | number>) => {
    const next = new URLSearchParams();
    const merged = { status: data.tab, q, page: String(data.page), ...patch };
    for (const [k, v] of Object.entries(merged)) if (v !== "" && !(k === "status" && v === "all") && !(k === "page" && String(v) === "1")) next.set(k, String(v));
    const s = next.toString();
    return s ? `${base}?${s}` : base;
  };

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-zinc-900">Orders</h1>
        <p className="text-sm text-zinc-500">Orders appear when a visitor starts checkout and turn Paid when Stripe confirms the payment.</p>
      </div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Filter by status" className="flex flex-wrap gap-1 text-sm">
          {ORDER_TABS.map((tab) => (
            <Link
              key={tab.key}
              href={href({ status: tab.key, page: 1 })}
              aria-current={tab.key === data.tab ? "true" : undefined}
              className={`rounded-md px-2.5 py-1 ${tab.key === data.tab ? "bg-white font-medium text-zinc-900 shadow-sm ring-1 ring-zinc-200" : "text-zinc-600 hover:text-zinc-900"}`}
            >
              {tab.label} <span className="text-zinc-400">({data.counts[tab.key]})</span>
            </Link>
          ))}
        </nav>
        <form role="search" action={base} className="flex gap-2">
          {data.tab !== "all" && <input type="hidden" name="status" value={data.tab} />}
          <label htmlFor="order-search" className="sr-only">Search orders</label>
          <input id="order-search" name="q" defaultValue={q} placeholder="Order number, email or name…" className="w-64 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20" />
          <button className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50">Search</button>
        </form>
      </div>
      {data.orders.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-12 text-center">
          <p className="font-medium text-zinc-900">{q || data.tab !== "all" ? "No orders match" : "No orders yet"}</p>
          <p className="mt-2 text-sm text-zinc-500">{q || data.tab !== "all" ? "Try another search or filter." : "When someone checks out, their order shows up here."}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <table className="w-full text-sm" data-orders-table="">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-4 py-2.5">Order</th>
                <th className="px-4 py-2.5">Date</th>
                <th className="px-4 py-2.5">Customer</th>
                <th className="px-4 py-2.5">Items</th>
                <th className="px-4 py-2.5 text-right">Total</th>
                <th className="px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {data.orders.map((o) => (
                <tr key={o.id} className="hover:bg-zinc-50" data-order-row={o.number}>
                  <td className="px-4 py-2.5">
                    <Link href={`${base}/${o.id}`} className="font-medium text-zinc-900 hover:underline">
                      #{o.number}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-zinc-600">{new Date(o.createdAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</td>
                  <td className="px-4 py-2.5">
                    {o.customerName ?? o.customerEmail ?? <span className="text-zinc-400">Not yet known</span>}
                    {o.customerName && o.customerEmail && <span className="block text-xs text-zinc-500">{o.customerEmail}</span>}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums">{o.items}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatMoney(o.totalAmount, o.currency)}</td>
                  <td className="px-4 py-2.5"><StatusBadge status={o.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data.pages > 1 && (
        <nav aria-label="Pagination" className="mt-4 flex items-center justify-end gap-2 text-sm text-zinc-600">
          {data.page > 1 && <Link className="rounded-md border border-zinc-300 bg-white px-3 py-1 hover:bg-zinc-50" href={href({ page: data.page - 1 })}>Previous</Link>}
          <span>Page {data.page} of {data.pages}</span>
          {data.page < data.pages && <Link className="rounded-md border border-zinc-300 bg-white px-3 py-1 hover:bg-zinc-50" href={href({ page: data.page + 1 })}>Next</Link>}
        </nav>
      )}
    </main>
  );
}
