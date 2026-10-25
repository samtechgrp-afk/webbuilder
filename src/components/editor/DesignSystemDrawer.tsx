"use client";

import Link from "next/link";
import { useTransition } from "react";
import { TokensPanel } from "@/components/design/TokensPanel";
import { saveDesignTokensAction } from "@/server/design-actions";
import { selectTokensDirty, useEditor } from "./store";

/**
 * Designer Mode drawer for the global tokens. Edits go straight into the
 * editor store, so the canvas restyles as you drag a picker, with no reload.
 * Saving writes the tokens site-wide (every page, live), independently of
 * this page's draft.
 */
export function DesignSystemDrawer({ siteId, onClose }: { siteId: string; onClose: () => void }) {
  const tokens = useEditor((s) => s.tokens) ?? {};
  const dirty = useEditor(selectTokensDirty);
  const [pending, start] = useTransition();

  function save() {
    start(async () => {
      const s = useEditor.getState();
      const res = await saveDesignTokensAction({ siteId, tokens: s.tokens ?? {}, baseVersion: s.tokensVersion });
      if (!res.ok) return s.notify({ tone: "error", text: res.error });
      s.markTokensSaved(res.tokens, res.version);
      s.notify({ tone: "success", text: "Design system saved. Every page on the live site uses the new tokens." });
    });
  }

  return (
    <aside role="dialog" aria-label="Design system" className="fixed bottom-0 right-0 top-14 z-30 flex w-[22rem] flex-col border-l border-zinc-200 bg-white shadow-2xl">
      <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-2.5">
        <div>
          <h2 className="text-sm font-semibold">Design system</h2>
          <p className="text-[11px] text-zinc-500">Global tokens · applies to every page</p>
        </div>
        <button type="button" onClick={onClose} className="text-xs text-zinc-500 hover:text-zinc-900">
          Close
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4">
        <TokensPanel value={tokens} onChange={(t) => useEditor.getState().setTokens(t)} disabled={pending} />
      </div>
      <footer className="flex items-center gap-2 border-t border-zinc-200 px-4 py-2.5">
        <button
          type="button"
          data-save-tokens
          onClick={save}
          disabled={!dirty || pending}
          className="rounded-md bg-indigo-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-400 disabled:opacity-40"
        >
          {pending ? "Saving…" : "Save tokens"}
        </button>
        <button
          type="button"
          disabled={!dirty || pending}
          onClick={() => {
            const s = useEditor.getState();
            if (s.savedTokens) s.setTokens(s.savedTokens);
          }}
          className="rounded-md px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-100 disabled:opacity-40"
        >
          Discard
        </button>
        <Link href={`/admin/sites/${siteId}/design-system`} target="_blank" className="ml-auto text-[11px] text-zinc-500 hover:text-zinc-900">
          Full page ↗
        </Link>
      </footer>
    </aside>
  );
}
