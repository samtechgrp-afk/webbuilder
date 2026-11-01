import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenant } from "@/lib/tenant";
import { SUBMISSION_TABS, listSubmissions } from "@/server/forms/admin-service";
import { FormsTabs } from "./FormsTabs";

export const metadata: Metadata = { title: "Forms" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function FormsPage({ params, searchParams }: PageProps<"/admin/sites/[siteId]/forms">) {
  const { siteId } = await params;
  const sp = await searchParams;
  const t = await getTenant(siteId);
  if (!t.can("forms.manage")) notFound();
  const q = (one(sp.q) ?? "").trim().slice(0, 100);
  const form = (one(sp.form) ?? "").slice(0, 60);
  const data = await listSubmissions(t, { tab: one(sp.tab), form: form || undefined, q, page: Number(one(sp.page)) || 1 });
  const base = `/admin/sites/${t.site.id}/forms`;
  const href = (patch: Record<string, string | number>) => {
    const next = new URLSearchParams();
    const merged = { tab: data.tab, form, q, page: String(data.page), ...patch };
    for (const [k, v] of Object.entries(merged)) if (v !== "" && !(k === "tab" && v === "inbox") && !(k === "page" && String(v) === "1")) next.set(k, String(v));
    const s = next.toString();
    return s ? `${base}?${s}` : base;
  };
  const exportHref = `/api/sites/${t.site.id}/forms/export${form ? `?form=${encodeURIComponent(form)}` : ""}`;

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Forms</h1>
          <p className="text-sm text-zinc-500">Messages sent through Contact form widgets on your site. Each one is also emailed to your team.</p>
        </div>
        {data.forms.length > 0 && (
          <a href={exportHref} className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50" data-export-messages="">
            Download CSV
          </a>
        )}
      </div>
      <FormsTabs base={base} current="messages" />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Filter messages" className="flex flex-wrap gap-1 text-sm">
          {SUBMISSION_TABS.map((tab) => (
            <Link
              key={tab.key}
              href={href({ tab: tab.key, page: 1 })}
              aria-current={tab.key === data.tab ? "true" : undefined}
              className={`rounded-md px-2.5 py-1 ${tab.key === data.tab ? "bg-white font-medium text-zinc-900 shadow-sm ring-1 ring-zinc-200" : "text-zinc-600 hover:text-zinc-900"}`}
            >
              {tab.label} <span className="text-zinc-400">({data.counts[tab.key]})</span>
            </Link>
          ))}
        </nav>
        <form role="search" action={base} className="flex flex-wrap gap-2">
          {data.tab !== "inbox" && <input type="hidden" name="tab" value={data.tab} />}
          {data.forms.length > 1 && (
            <>
              <label htmlFor="form-filter" className="sr-only">Form</label>
              <select id="form-filter" name="form" defaultValue={form} className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm">
                <option value="">All forms</option>
                {data.forms.map((f) => (
                  <option key={f.name} value={f.name}>{f.name} ({f.count})</option>
                ))}
              </select>
            </>
          )}
          <label htmlFor="message-search" className="sr-only">Search messages</label>
          <input id="message-search" name="q" defaultValue={q} placeholder="Email, form or page…" className="w-56 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20" />
          <button className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50">Search</button>
        </form>
      </div>
      {data.rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-12 text-center">
          <p className="font-medium text-zinc-900">{q || form || data.tab !== "inbox" ? "No messages match" : "No messages yet"}</p>
          <p className="mt-2 text-sm text-zinc-500">{q || form || data.tab !== "inbox" ? "Try another search or filter." : "Add a Contact form widget to a page and publish it. Messages people send show up here."}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <table className="w-full text-sm" data-submissions-table="">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-4 py-2.5">From</th>
                <th className="px-4 py-2.5">Message</th>
                <th className="px-4 py-2.5">Form</th>
                <th className="px-4 py-2.5">Received</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {data.rows.map((r) => (
                <tr key={r.id} className="hover:bg-zinc-50" data-submission-row={r.id} data-unread={r.status === "NEW" ? "" : undefined}>
                  <td className="px-4 py-2.5">
                    <Link href={`${base}/${r.id}`} className={`hover:underline ${r.status === "NEW" ? "font-semibold text-zinc-900" : "text-zinc-800"}`}>
                      {r.status === "NEW" && <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[var(--accent)]" aria-label="Unread" />}
                      {r.email ?? "No email given"}
                    </Link>
                  </td>
                  <td className="max-w-md truncate px-4 py-2.5 text-zinc-600">
                    {r.preview}
                    {r.files > 0 && <span className="ml-2 text-xs text-zinc-400">📎 {r.files}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-zinc-600">{r.formName}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-zinc-500">{new Date(r.createdAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</td>
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
