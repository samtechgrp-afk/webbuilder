import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/cms/ui";
import { getTenant } from "@/lib/tenant";
import { getSubmission } from "@/server/forms/admin-service";
import { SubmissionActions } from "./SubmissionActions";

export const metadata: Metadata = { title: "Message" };

const kb = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

export default async function SubmissionPage({ params }: PageProps<"/admin/sites/[siteId]/forms/[submissionId]">) {
  const { siteId, submissionId } = await params;
  const t = await getTenant(siteId);
  if (!t.can("forms.manage")) notFound();
  const s = await getSubmission(t, submissionId);
  if (!s) notFound();
  const base = `/admin/sites/${t.site.id}/forms`;
  const fields = s.fields.filter((f) => f.type !== "file");

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <nav className="mb-2 text-sm text-zinc-500">
        <Link href={base} className="hover:text-zinc-900">Forms</Link> /
      </nav>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">{s.formName}</h1>
          <p className="text-sm text-zinc-500">
            Received {s.createdAt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
            {s.pagePath ? <> on <span className="font-mono text-xs">{s.pagePath}</span></> : null}
            {s.status === "SPAM" ? <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Spam</span> : null}
          </p>
        </div>
        <SubmissionActions siteId={t.site.id} id={s.id} status={s.status} email={s.email} />
      </div>
      <div className="space-y-5">
        <Card title="Message">
          <dl className="divide-y divide-zinc-100 text-sm" data-submission-fields="">
            {fields.map((f, i) => (
              <div key={i} className="grid gap-1 py-2.5 sm:grid-cols-[180px_minmax(0,1fr)]">
                <dt className="text-zinc-500">{f.label}</dt>
                <dd className="whitespace-pre-wrap break-words text-zinc-900">{f.value || <span className="text-zinc-400">(empty)</span>}</dd>
              </div>
            ))}
          </dl>
        </Card>
        {s.files.length > 0 && (
          <Card title="Attachments">
            <ul className="space-y-2 text-sm" data-submission-files="">
              {s.files.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate">
                    <span className="text-zinc-500">{f.fieldLabel}:</span> {f.originalName} <span className="text-zinc-400">({kb(f.sizeBytes)})</span>
                  </span>
                  <a href={`/api/sites/${t.site.id}/forms/files/${f.id}`} className="shrink-0 rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium hover:bg-zinc-50">Download</a>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </main>
  );
}
