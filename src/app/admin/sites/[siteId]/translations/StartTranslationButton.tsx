"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { createTranslationAction } from "@/server/i18n-actions";

export function StartTranslationButton({ siteId, sourceId, locale, label, listHref }: { siteId: string; sourceId: string; locale: string; label: string; listHref: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      data-start-translation={locale}
      className="rounded-md border border-dashed border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-600 hover:border-zinc-500 hover:text-zinc-900 disabled:opacity-50"
      onClick={() =>
        start(async () => {
          const res = await createTranslationAction({ siteId, sourceId, locale });
          if (!res.ok) return void window.alert(res.error);
          router.push(`${listHref}${listHref.includes("?") ? "&" : "?"}edit=${res.id}`);
        })
      }
    >
      {pending ? "Starting…" : `Translate`}
      <span className="sr-only"> into {label}</span>
    </button>
  );
}
