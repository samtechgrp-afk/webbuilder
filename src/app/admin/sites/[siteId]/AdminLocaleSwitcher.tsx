"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setAdminLocaleAction } from "@/server/i18n-actions";

/** The admin bar's language picker: content lists show this language's pages and entries. */
export function AdminLocaleSwitcher({ siteId, locales, current }: { siteId: string; locales: { code: string; label: string; isDefault: boolean }[]; current: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <label className="flex items-center gap-1.5 text-zinc-500">
      <span aria-hidden>🌐</span>
      <span className="sr-only">Content language</span>
      <select
        className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-800"
        value={current}
        disabled={pending}
        data-admin-locale=""
        onChange={(e) => {
          const locale = e.target.value;
          start(async () => {
            await setAdminLocaleAction({ siteId, locale });
            router.refresh();
          });
        }}
      >
        {locales.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
            {l.isDefault ? " (default)" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
