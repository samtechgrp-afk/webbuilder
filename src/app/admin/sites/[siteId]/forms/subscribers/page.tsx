import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenant } from "@/lib/tenant";
import { listSubscribers } from "@/server/forms/admin-service";
import { FormsTabs } from "../FormsTabs";
import { SubscriberActions } from "./SubscriberActions";

export const metadata: Metadata = { title: "Subscribers" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function SubscribersPage({ params, searchParams }: PageProps<"/admin/sites/[siteId]/forms/subscribers">) {
  const { siteId } = await params;
  const sp = await searchParams;
  const t = await getTenant(siteId);
  if (!t.can("forms.manage")) notFound();
  const q = (one(sp.q) ?? "").trim().slice(0, 100);
  const data = await listSubscribers(t, { status: one(sp.status), q, page: Number(one(sp.page)) || 1 });
  const base = `/admin/sites/${t.site.id}/forms`;
  const here = `${base}/subscribers`;
  const unsub = data.status === "UNSUBSCRIBED";
  const href = (patch: Record<string, string | number>) => {
    const next = new URLSearchParams();
    const merged = { status: unsub ? "unsubscribed" : "", q, page: String(data.page), ...patch };
    for (const [k, v] of Object.entries(merged)) if (v !== "" && !(k === "page" && String(v) === "1")) next.set(k, String(v));
    const s = next.toString();
    return s ? `${here}?${s}` : here;
  };

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Forms</h1>
          <p className="text-sm text-zinc-500">People who signed up through a Newsletter widget. Download them as CSV to import into your email tool.</p>
        </div>
        {data.counts.subscribed + data.counts.unsubscribed > 0 && (
          <a href={`/api/sites/${t.site.id}/forms/subscribers.csv`} className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50" data-export-subscribers="">
            Download CSV
          </a>
        )}
      </div>
      <FormsTabs base={base} current="subscribers" />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Filter subscribers" className="flex gap-1 text-sm">
          {[
            { key: "", label: "Subscribed", n: data.counts.subscribed, on: !unsub },
            { key: "unsubscribed", label: "Unsubscribed", n: data.counts.unsubscribed, on: unsub },
          ].map((tab) => (
            <Link key={tab.label} href={href({ status: tab.key, page: 1 })} aria-current={tab.on ? "true" : undefined} className={`rounded-md px-2.5 py-1 ${tab.on ? "bg-white font-medium text-zinc-900 shadow-sm ring-1 ring-zinc-200" : "text-zinc-600 hover:text-zinc-900"}`}>
              {tab.label} <span className="text-zinc-400">({tab.n})</span>
            </Link>
          ))}
        </nav>
        <form role="search" action={here} className="flex gap-2">
          {unsub && <input type="hidden" name="status" value="unsubscribed" />}
          <label htmlFor="subscriber-search" className="sr-only">Search subscribers</label>
          <input id="subscriber-search" name="q" defaultValue={q} placeholder="Email or name…" className="w-56 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20" />
          <button className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50">Search</button>
        </form>
      </div>
      {data.rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-12 text-center">
          <p className="font-medium text-zinc-900">{q ? "No subscribers match" : unsub ? "Nobody has unsubscribed" : "No subscribers yet"}</p>
          <p className="mt-2 text-sm text-zinc-500">{q ? "Try another search." : "Add a Newsletter sign-up widget to a page and publish it."}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <table className="w-full text-sm" data-subscribers-table="">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-4 py-2.5">Email</th>
                <th className="px-4 py-2.5">Name</th>
                <th className="px-4 py-2.5">Source</th>
                <th className="px-4 py-2.5">Signed up</th>
                <th className="px-4 py-2.5"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {data.rows.map((r) => (
                <tr key={r.id} data-subscriber-row={r.email}>
                  <td className="px-4 py-2.5 font-medium text-zinc-900">{r.email}</td>
                  <td className="px-4 py-2.5 text-zinc-600">{r.name ?? ""}</td>
                  <td className="px-4 py-2.5 text-zinc-600">{r.source}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-zinc-500">{r.createdAt.toLocaleDateString("en-US", { dateStyle: "medium" })}</td>
                  <td className="px-4 py-2.5 text-right"><SubscriberActions siteId={t.site.id} id={r.id} subscribed={!unsub} /></td>
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
