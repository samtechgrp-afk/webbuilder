"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

const EVERY_MS = 15_000;

/** Re-runs the checks every 15 seconds while the tab is visible, plus a manual "Check now". */
export function AutoRefresh({ checkedAt }: { checkedAt: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") startTransition(() => router.refresh());
    }, EVERY_MS);
    return () => clearInterval(id);
  }, [paused, router]);

  return (
    <div className="flex items-center gap-3 text-xs text-zinc-500" data-health-refresh="">
      <span>
        Checked <time dateTime={checkedAt} data-health-checked-at={checkedAt}>{new Date(checkedAt).toLocaleTimeString()}</time>
        {paused ? " · auto-refresh paused" : " · refreshes every 15 s"}
      </span>
      <button type="button" onClick={() => setPaused(!paused)} className="text-zinc-500 underline-offset-2 hover:text-zinc-900 hover:underline">
        {paused ? "Resume" : "Pause"}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => router.refresh())}
        className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
        data-health-check-now=""
      >
        {pending ? "Checking…" : "Check now"}
      </button>
    </div>
  );
}
