import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/cms/ui";
import { formatMoney } from "@/lib/commerce/money";
import { getTenant } from "@/lib/tenant";
import { listProducts } from "@/server/commerce/product-service";
import { readStore } from "@/server/commerce/store-service";
import { NewProductButton } from "./NewProductButton";

export const metadata: Metadata = { title: "Products" };

const TABS = [
  { key: "", label: "All" },
  { key: "ACTIVE", label: "Active" },
  { key: "DRAFT", label: "Drafts" },
  { key: "ARCHIVED", label: "Archived" },
] as const;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function ProductsPage({ params, searchParams }: PageProps<"/admin/sites/[siteId]/products">) {
  const { siteId } = await params;
  const sp = await searchParams;
  const t = await getTenant(siteId);
  if (!t.can("commerce.manage")) notFound();
  const status = TABS.find((x) => x.key === one(sp.status))?.key ?? "";
  const q = (one(sp.q) ?? "").trim().slice(0, 100);
  const [{ products, counts }, { store, currency, locale }] = await Promise.all([listProducts(t, { q, status }), readStore(t.site.id)]);
  const total = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);
  const base = `/admin/sites/${t.site.id}`;
  const checkoutReady = !!store?.enabled && !!store.stripeSecretKey;

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Products</h1>
          <p className="text-sm text-zinc-500">Everything {t.site.name} sells. Prices are in {currency}.</p>
        </div>
        <NewProductButton siteId={t.site.id} />
      </div>

      {!checkoutReady && (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900" data-checkout-warning="">
          Checkout is off, so visitors can fill their cart but not pay yet.{" "}
          {t.can("site.settings") ? (
            <Link href={`${base}/settings/payments`} className="font-medium underline underline-offset-2">
              Connect Stripe
            </Link>
          ) : (
            "A designer can connect Stripe under Settings."
          )}
        </p>
      )}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Filter by status" className="flex flex-wrap gap-1 text-sm">
          {TABS.map((tab) => (
            <Link
              key={tab.key}
              href={`${base}/products${tab.key ? `?status=${tab.key}` : ""}`}
              aria-current={tab.key === status ? "true" : undefined}
              className={`rounded-md px-2.5 py-1 ${tab.key === status ? "bg-white font-medium text-zinc-900 shadow-sm ring-1 ring-zinc-200" : "text-zinc-600 hover:text-zinc-900"}`}
            >
              {tab.label} <span className="text-zinc-400">({tab.key ? (counts[tab.key] ?? 0) : total})</span>
            </Link>
          ))}
        </nav>
        <form role="search" action={`${base}/products`} className="flex gap-2">
          {status && <input type="hidden" name="status" value={status} />}
          <label htmlFor="product-search" className="sr-only">Search products</label>
          <input id="product-search" name="q" defaultValue={q} placeholder="Search by name or SKU…" className="w-64 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20" />
          <button className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50">Search</button>
        </form>
      </div>

      {products.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-12 text-center">
          <p className="font-medium text-zinc-900">{q || status ? "No products match" : "No products yet"}</p>
          <p className="mt-2 text-sm text-zinc-500">{q || status ? "Try another search or filter." : "Add your first product, then drop a Product grid onto a page in the builder."}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <table className="w-full text-sm" data-products-table="">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-4 py-2.5" colSpan={2}>Product</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Price</th>
                <th className="px-4 py-2.5">Stock</th>
                <th className="px-4 py-2.5">SKU</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {products.map((p) => (
                <tr key={p.id} className="hover:bg-zinc-50" data-product-row={p.slug}>
                  <td className="w-14 py-2 pl-4">
                    {p.cover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.cover.url} alt="" className="h-10 w-10 rounded-md object-cover" />
                    ) : (
                      <span className="block h-10 w-10 rounded-md bg-zinc-100" aria-hidden />
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <Link href={`${base}/products/${p.id}`} className="font-medium text-zinc-900 hover:underline">
                      {p.title}
                    </Link>
                    <p className="text-xs text-zinc-500">{p.variants ? `${p.variants} variants` : `/products/${p.slug}`}</p>
                  </td>
                  <td className="px-4 py-2"><StatusBadge status={p.status} /></td>
                  <td className="px-4 py-2 tabular-nums">{formatMoney(p.price, currency, locale)}{p.variants ? "+" : ""}</td>
                  <td className="px-4 py-2 tabular-nums" data-stock-cell="">
                    {p.stock === null ? <span className="text-zinc-400">Not tracked</span> : <span className={p.stock <= 0 ? "font-medium text-red-700" : p.stock <= 5 ? "text-amber-700" : ""}>{p.stock <= 0 ? `Out of stock (${p.stock})` : `${p.stock} in stock`}</span>}
                  </td>
                  <td className="px-4 py-2 text-zinc-500">{p.sku ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
