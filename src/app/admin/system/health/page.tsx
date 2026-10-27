import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { runHealthChecks, type HealthStatus } from "@/server/system/health";
import { AutoRefresh } from "./AutoRefresh";

export const metadata: Metadata = { title: "System health", robots: { index: false, follow: false } };

const TONE: Record<HealthStatus, { dot: string; label: string; ring: string }> = {
  ok: { dot: "bg-emerald-500", label: "Healthy", ring: "border-zinc-200" },
  warn: { dot: "bg-amber-500", label: "Needs attention", ring: "border-amber-300" },
  fail: { dot: "bg-red-500", label: "Failing", ring: "border-red-300" },
};

/** Platform admins only: database, migrations, storage, email, DNS and configuration at a glance. */
export default async function SystemHealthPage() {
  const user = await requireUser();
  if (!user.isPlatformAdmin) notFound();
  const checks = await runHealthChecks();
  const overall: HealthStatus = checks.some((c) => c.status === "fail") ? "fail" : checks.some((c) => c.status === "warn") ? "warn" : "ok";
  const checkedAt = new Date();

  return (
    <main className="mx-auto w-full max-w-4xl p-6 sm:p-8" data-system-health={overall}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/admin" className="text-sm text-zinc-500 hover:text-zinc-900">← Your sites</Link>
          <h1 className="mt-2 flex items-center gap-2.5 text-2xl font-semibold text-zinc-900">
            <span className={`h-2.5 w-2.5 rounded-full ${TONE[overall].dot}`} aria-hidden />
            System health
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {overall === "ok" ? "Everything checks out." : `${checks.filter((c) => c.status !== "ok").length} of ${checks.length} checks need attention.`}
          </p>
        </div>
        <AutoRefresh checkedAt={checkedAt.toISOString()} />
      </div>

      <ul className="grid gap-3">
        {checks.map((c) => (
          <li key={c.key} className={`rounded-xl border bg-white px-5 py-4 ${TONE[c.status].ring}`} data-health-check={c.key} data-status={c.status}>
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
              <div className="min-w-0">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${TONE[c.status].dot}`} aria-hidden />
                  {c.label}
                  <span className="sr-only">: {TONE[c.status].label}</span>
                </h2>
                <p className="mt-1 text-sm text-zinc-700" data-health-summary="">{c.summary}</p>
              </div>
              <span className="shrink-0 font-mono text-xs text-zinc-400">{c.ms} ms</span>
            </div>
            {c.details.length > 0 && (
              <ul className="mt-2.5 space-y-1 border-t border-zinc-100 pt-2.5 text-xs text-zinc-500">
                {c.details.map((d) => (
                  <li key={d} className="break-words">{d}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
