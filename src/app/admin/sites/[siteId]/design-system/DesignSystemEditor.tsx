"use client";

import { useState, useTransition } from "react";
import { TokenSpecimen } from "@/components/design/TokenSpecimen";
import { TokensPanel } from "@/components/design/TokensPanel";
import { FontManagerModal } from "@/components/design/FontManager";
import type { ManagedFont } from "@/lib/design/fonts";
import type { DesignTokens } from "@/lib/design/tokens";
import { restoreTokenRevisionAction, saveDesignTokensAction } from "@/server/design-actions";
import type { TokenRevisionSummary } from "@/server/design/tokens-service";

interface State {
  tokens: DesignTokens;
  version: number;
  revisions: TokenRevisionSummary[];
}

export function DesignSystemEditor({ siteId, initial, fonts: initialFonts = [] }: { siteId: string; initial: State; fonts?: ManagedFont[] }) {
  const [saved, setSaved] = useState(initial);
  const [fonts, setFonts] = useState(initialFonts);
  const [fontsOpen, setFontsOpen] = useState(false);
  const [draft, setDraft] = useState(initial.tokens);
  const [notice, setNotice] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved.tokens);

  const apply = (res: Awaited<ReturnType<typeof saveDesignTokensAction>>, text: string) => {
    if (!res.ok) return setNotice({ tone: "error", text: res.error });
    setSaved({ tokens: res.tokens, version: res.version, revisions: res.revisions });
    setDraft(res.tokens);
    setNotice({ tone: "success", text });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
      <aside className="h-fit rounded-xl border border-zinc-200 bg-white p-4 lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto">
        <TokensPanel value={draft} onChange={setDraft} disabled={pending} fonts={fonts} onManageFonts={() => setFontsOpen(true)} />
        <FontManagerModal open={fontsOpen} onClose={() => setFontsOpen(false)} siteId={siteId} fonts={fonts} onChange={setFonts} />
        <div className="sticky bottom-0 -mx-4 -mb-4 flex items-center gap-2 border-t border-zinc-200 bg-white p-3">
          <button
            type="button"
            data-save-tokens
            disabled={!dirty || pending}
            onClick={() => start(async () => apply(await saveDesignTokensAction({ siteId, tokens: draft, baseVersion: saved.version }), "Saved. Every page on the live site uses the new tokens."))}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-700 disabled:opacity-40"
          >
            {pending ? "Saving…" : "Save design system"}
          </button>
          <button type="button" disabled={!dirty || pending} onClick={() => setDraft(saved.tokens)} className="rounded-md px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-100 disabled:opacity-40">
            Discard
          </button>
          <span className="ml-auto text-[11px] text-zinc-400">v{saved.version}</span>
        </div>
      </aside>

      <div className="min-w-0 space-y-4">
        {notice && (
          <p role="status" className={`rounded-md px-3 py-2 text-sm ${notice.tone === "error" ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"}`}>
            {notice.text}
          </p>
        )}
        <div className="overflow-hidden rounded-xl border border-zinc-200 shadow-sm">
          <TokenSpecimen tokens={fonts.length ? { ...draft, fontFaces: fonts } : draft} />
        </div>
        <section className="rounded-xl border border-zinc-200 bg-white">
          <h2 className="border-b border-zinc-100 px-4 py-2.5 text-sm font-semibold text-zinc-900">History</h2>
          {saved.revisions.length === 0 ? (
            <p className="px-4 py-3 text-sm text-zinc-500">No saved versions yet. Your first save keeps the current tokens as version 0.</p>
          ) : (
            <ol className="divide-y divide-zinc-100">
              {saved.revisions.map((r, i) => (
                <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5" data-token-revision={r.version}>
                  <div>
                    <p className="text-sm font-medium text-zinc-900">
                      v{r.version} · {r.message ?? (r.preset ? `Preset ${r.preset}` : "Saved")}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {r.authorName ?? "System"} · {new Date(r.createdAt).toLocaleString()}
                    </p>
                  </div>
                  {i > 0 && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => start(async () => apply(await restoreTokenRevisionAction({ siteId, revisionId: r.id, baseVersion: saved.version }), `Restored v${r.version}. It's live now.`))}
                      className="rounded-md border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-50 disabled:opacity-40"
                    >
                      Restore
                    </button>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
