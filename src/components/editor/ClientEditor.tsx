"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { DesignTokens } from "@/lib/builder/styles";
import { BREAKPOINT_ORDER, BREAKPOINTS, type BuilderDocument } from "@/lib/builder/types";
import type { DynamicData } from "@/lib/cms/binding";
import type { LoopQuery } from "@/lib/builder/types";
import type { CommerceData } from "@/lib/commerce/types";
import { heartbeatEditLock, leaveEditor, previewLoop, restorePageRevision, savePage } from "@/server/editor-actions";
import { Canvas } from "./Canvas";
import { Inspector } from "./Inspector";
import type { PickerAsset } from "./MediaPicker";
import { DesignSidebar } from "./DesignSidebar";
import { DesignSystemDrawer } from "./DesignSystemDrawer";
import { HelpDrawer } from "./HelpDrawer";
import { parentOf, selectIsDirty, selectTokensDirty, useEditor, type BindingCatalog } from "./store";

export interface RevisionSummary {
  id: string;
  version: number;
  kind: string;
  message: string | null;
  authorName: string | null;
  createdAt: string;
  isLive: boolean;
}

export interface ClientEditorProps {
  site: { id: string; name: string; liveUrl: string };
  post: { id: string; title: string; status: string };
  document: BuilderDocument;
  version: number;
  permissions: string[];
  roleName: string;
  tokens: DesignTokens;
  tokensVersion: number;
  assets: PickerAsset[];
  revisions: RevisionSummary[];
  lock: { ok: true } | { ok: false; holder: string };
  dynamic: DynamicData | null;
  catalog: BindingCatalog;
  contextPostTypeId: string | null;
  /** Set when editing a post type's single template. */
  template: { postTypeLabel: string; previewTitle: string | null } | null;
  /** The page's languages on a multilingual site: the canvas edits the shared layout, translations open in their drawer. */
  languages?: EditorLanguage[];
  /** The shop's catalog for product grids, product details and cart widgets. */
  commerce?: CommerceData;
}

export interface EditorLanguage {
  code: string;
  label: string;
  isDefault: boolean;
  /** Where to edit this language's text (the translations drawer), or start its translation. */
  href: string;
  /** This page at its public address in this language, with drafts. */
  previewHref: string;
  status: "original" | "live" | "draft" | "missing";
}

const HEARTBEAT_MS = 45_000;

export function ClientEditor(props: ClientEditorProps) {
  const { site, post } = props;
  const router = useRouter();
  const [assets, setAssets] = useState(props.assets);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const closeHelp = useCallback(() => setHelpOpen(false), []);
  const [tokensOpen, setTokensOpen] = useState(false);
  const [lockLost, setLockLost] = useState<string | null>(props.lock.ok ? null : props.lock.holder);
  const [pending, startTransition] = useTransition();

  const s = useEditor();
  const dirty = useEditor(selectIsDirty);
  const can = (p: string) => props.permissions.includes(p);
  const readOnly = !!lockLost;
  const designMode = can("design.layout") && !readOnly;
  // Global tokens are a Designer tool; Client Mode never sees the drawer.
  const canTokens = designMode && can("design.tokens");
  const tokens = useEditor((st) => st.tokens) ?? props.tokens;

  // Load the server document once per page/version. A read-only session gets no permissions at all.
  useEffect(() => {
    useEditor.getState().init(props.document, { permissions: readOnly ? [] : props.permissions }, props.version);
    useEditor.getState().initDynamic(props.dynamic, props.catalog, props.contextPostTypeId);
    useEditor.getState().initTokens(props.tokens, props.tokensVersion);
    useEditor.getState().initCommerce(props.commerce ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.id, readOnly]);

  useLoopPreviews(site.id);

  // Hold the edit lock while the editor is open. It expires on its own if the
  // tab closes, and is released explicitly when leaving through the toolbar.
  useEffect(() => {
    if (readOnly) return;
    const beat = async () => {
      const res = await heartbeatEditLock({ siteId: site.id, postId: post.id });
      if (res.ok && !res.lock.ok) setLockLost(res.lock.holder);
    };
    void beat();
    const timer = setInterval(beat, HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [site.id, post.id, readOnly]);

  // Keyboard shortcuts and the unsaved-changes guard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      const s = useEditor.getState();
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (key === "?" && !mod) {
        e.preventDefault();
        setHelpOpen((open) => !open);
      } else if (mod && key === "z") {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
      } else if (mod && key === "y") {
        e.preventDefault();
        s.redo();
      } else if (!s.selectedId) {
        return;
      } else if (mod && key === "d") {
        // Designer shortcuts; the store refuses them for anyone without design rights.
        e.preventDefault();
        s.duplicate(s.selectedId);
      } else if (!mod && (key === "delete" || key === "backspace")) {
        if (s.removeNode(s.selectedId)) e.preventDefault();
      } else if (key === "escape") {
        s.select(parentOf(s.doc, s.selectedId) ?? null);
      }
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      if (selectIsDirty(useEditor.getState()) || selectTokensDirty(useEditor.getState())) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, []);

  function save(intent: "draft" | "submit" | "publish") {
    startTransition(async () => {
      const state = useEditor.getState();
      state.setSaveState("saving");
      const res = await savePage({ siteId: site.id, postId: post.id, document: state.doc, baseVersion: state.version, intent });
      if (!res.ok) {
        state.setSaveState("error");
        state.notify({ tone: "error", text: res.error, details: res.violations?.map((v) => v.message) });
        return;
      }
      state.markSaved(res.version);
      state.notify({
        tone: "success",
        text: intent === "publish" ? "Published. Your changes are live." : intent === "submit" ? "Sent to your team for review." : "Draft saved.",
      });
      router.refresh();
    });
  }

  function restore(revisionId: string) {
    startTransition(async () => {
      const state = useEditor.getState();
      const res = await restorePageRevision({ siteId: site.id, postId: post.id, revisionId });
      if (!res.ok) return state.notify({ tone: "error", text: res.error });
      state.markSaved(res.version, res.document);
      state.notify({ tone: "success", text: "Earlier version restored as a draft. Publish to make it live." });
      setHistoryOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="flex h-dvh flex-col bg-zinc-100 text-zinc-900">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-zinc-800 bg-zinc-950 px-4 text-zinc-100">
        <Link
          href={`/admin/sites/${site.id}`}
          onClick={() => !readOnly && void leaveEditor({ siteId: site.id, postId: post.id })}
          className="rounded-md px-2 py-1 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-white">
          ← {site.name}
        </Link>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{post.title}</p>
          <p className="text-[11px] text-zinc-400">
            {designMode ? "Design mode" : "Client mode"} · {props.roleName} · {saveLabel(s.saveState, dirty)}
          </p>
        </div>

        {props.languages && props.languages.length > 1 && <LanguageMenu languages={props.languages} />}

        <div className="mx-auto flex rounded-lg bg-zinc-900 p-0.5" role="group" aria-label="Preview size">
          {BREAKPOINT_ORDER.map((bp) => (
            <button
              key={bp}
              type="button"
              onClick={() => s.setViewport(bp)}
              aria-pressed={s.viewport === bp}
              className={`rounded-md px-3 py-1 text-xs ${s.viewport === bp ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-white"}`}
            >
              {BREAKPOINTS[bp].label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <IconButton label="Undo" onClick={s.undo} disabled={!s.past.length}>↶</IconButton>
          <IconButton label="Redo" onClick={s.redo} disabled={!s.future.length}>↷</IconButton>
          {canTokens && (
            <button
              type="button"
              aria-pressed={tokensOpen}
              onClick={() => setTokensOpen(!tokensOpen)}
              className={`rounded-md px-2.5 py-1.5 text-xs ${tokensOpen ? "bg-zinc-700 text-white" : "text-zinc-300 hover:bg-zinc-800"}`}
            >
              Design system
            </button>
          )}
          <button type="button" onClick={() => setHistoryOpen(true)} className="rounded-md px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800">
            History
          </button>
          <button
            type="button"
            aria-label="Help and keyboard shortcuts"
            aria-pressed={helpOpen}
            title="Help (?)"
            onClick={() => setHelpOpen(!helpOpen)}
            className={`grid h-7 w-7 place-items-center rounded-full border text-xs font-semibold ${helpOpen ? "border-zinc-500 bg-zinc-700 text-white" : "border-zinc-700 text-zinc-300 hover:bg-zinc-800"}`}
            data-open-help=""
          >
            ?
          </button>
          <a href={site.liveUrl} target="_blank" rel="noreferrer" className="rounded-md px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800">
            View live ↗
          </a>
          <button
            type="button"
            disabled={readOnly || pending || !dirty}
            onClick={() => save("draft")}
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-medium hover:bg-zinc-800 disabled:opacity-40"
          >
            Save draft
          </button>
          {can("post.publish") ? (
            <button
              type="button"
              disabled={readOnly || pending}
              onClick={() => save("publish")}
              className="rounded-md bg-indigo-500 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-400 disabled:opacity-40"
            >
              Publish
            </button>
          ) : can("post.submit") ? (
            <button
              type="button"
              disabled={readOnly || pending}
              onClick={() => save("submit")}
              className="rounded-md bg-indigo-500 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-400 disabled:opacity-40"
            >
              Submit for review
            </button>
          ) : null}
        </div>
      </header>

      {props.template && (
        <p className="bg-violet-50 px-4 py-2 text-center text-sm text-violet-900">
          You&apos;re designing the template every {props.template.postTypeLabel} entry uses.{" "}
          {props.template.previewTitle ? `Previewing “${props.template.previewTitle}”.` : "Add an entry to preview real content."}
        </p>
      )}
      {lockLost && (
        <p className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-900">
          {lockLost} is editing this page right now. You can look around, but editing is paused until they finish.
        </p>
      )}
      {s.message && (
        <div
          role="status"
          className={`flex items-start justify-between gap-4 px-4 py-2 text-sm ${
            s.message.tone === "error" ? "bg-red-50 text-red-800" : s.message.tone === "success" ? "bg-emerald-50 text-emerald-800" : "bg-zinc-50"
          }`}
        >
          <div>
            <p>{s.message.text}</p>
            {s.message.details?.length ? (
              <ul className="mt-1 list-disc pl-5 text-xs">
                {s.message.details.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            ) : null}
          </div>
          <button type="button" onClick={() => s.notify(null)} className="text-xs opacity-70 hover:opacity-100">
            Dismiss
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {designMode && <DesignSidebar />}
        {/* Language switchers on the canvas show the site's languages; their links point at previews. */}
        <Canvas tokens={tokens} languages={props.languages?.map((l) => ({ code: l.code, label: l.label, href: l.previewHref, current: l.isDefault, translated: l.status !== "missing" }))} />
        <aside className="w-80 shrink-0 overflow-y-auto border-l border-zinc-200 bg-white" aria-label="Inspector">
          <Inspector
            siteId={site.id}
            tokens={tokens}
            assets={assets}
            canUpload={can("media.upload")}
            onAssetUploaded={(a) => setAssets((list) => [a, ...list])}
          />
        </aside>
      </div>

      {helpOpen && <HelpDrawer siteId={site.id} designMode={designMode} canManageFields={can("schema.manage")} onClose={closeHelp} />}
      {canTokens && tokensOpen && <DesignSystemDrawer siteId={site.id} onClose={() => setTokensOpen(false)} />}

      {historyOpen && (
        <HistoryPanel revisions={props.revisions} canRestore={can("revisions.restore") && !readOnly} onRestore={restore} onClose={() => setHistoryOpen(false)} pending={pending} />
      )}
    </div>
  );
}

/** Refetch a loop grid's entries whenever its query changes, so the canvas previews real content. */
function useLoopPreviews(siteId: string) {
  const doc = useEditor((s) => s.doc);
  const queries = Object.values(doc.nodes)
    .filter((n) => n.type === "loop")
    .map((n) => [n.id, JSON.stringify(n.props.query ?? null)] as const);
  const key = JSON.stringify(queries);
  const fetched = useRef<Record<string, string>>({});
  useEffect(() => {
    for (const [id, q] of JSON.parse(key) as [string, string][]) {
      const first = fetched.current[id] === undefined;
      if (fetched.current[id] === q) continue;
      fetched.current[id] = q;
      if (first && useEditor.getState().dynamic?.loops[id] && initialMatches(id, q)) continue;
      void previewLoop({ siteId, query: JSON.parse(q) as LoopQuery }).then((res) => {
        // Ignore a slow response for a query that has since changed.
        if (res.ok && fetched.current[id] === q) useEditor.getState().setLoopItems(id, res.items);
      });
    }
  }, [key, siteId]);
}

/** The server already loaded loops for the saved document; skip refetching those on first render. */
function initialMatches(id: string, q: string) {
  const saved = useEditor.getState().savedDoc.nodes[id];
  return !!saved && JSON.stringify(saved.props.query ?? null) === q;
}

function saveLabel(state: string, dirty: boolean) {
  if (state === "saving") return "Saving…";
  if (state === "error") return "Not saved";
  if (dirty) return "Unsaved changes";
  return state === "saved" ? "All changes saved" : "Up to date";
}

function IconButton({ label, children, ...rest }: { label: string; children: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" aria-label={label} title={label} {...rest} className="h-8 w-8 rounded-md text-base text-zinc-300 hover:bg-zinc-800 disabled:opacity-30">
      {children}
    </button>
  );
}

const KIND_LABEL: Record<string, string> = {
  DRAFT: "Draft saved",
  SUBMITTED: "Submitted for review",
  PUBLISHED: "Published",
  RESTORED: "Restored",
  AUTOSAVE: "Autosave",
};

function HistoryPanel({
  revisions,
  canRestore,
  onRestore,
  onClose,
  pending,
}: {
  revisions: RevisionSummary[];
  canRestore: boolean;
  onRestore: (id: string) => void;
  onClose: () => void;
  pending: boolean;
}) {
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-zinc-950/30" onClick={onClose}>
      <aside role="dialog" aria-label="Page history" className="h-full w-96 overflow-y-auto bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-zinc-200 px-5 py-3">
          <h2 className="text-sm font-semibold">History</h2>
          <button type="button" onClick={onClose} className="text-xs text-zinc-500 hover:text-zinc-900">
            Close
          </button>
        </header>
        <ol className="divide-y divide-zinc-100">
          {revisions.map((r, i) => (
            <li key={r.id} className="flex items-start justify-between gap-3 px-5 py-3">
              <div>
                <p className="text-sm font-medium">
                  v{r.version} · {KIND_LABEL[r.kind] ?? r.kind}
                  {r.isLive && <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">LIVE</span>}
                </p>
                <p className="text-xs text-zinc-500">
                  {r.authorName ?? "Unknown"} · {new Date(r.createdAt).toLocaleString()}
                </p>
                {r.message && <p className="mt-0.5 text-xs text-zinc-600">{r.message}</p>}
              </div>
              {canRestore && i > 0 && (
                <button type="button" disabled={pending} onClick={() => onRestore(r.id)} className="shrink-0 rounded-md border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-50 disabled:opacity-40">
                  Restore
                </button>
              )}
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}

const LANGUAGE_STATUS: Record<EditorLanguage["status"], string> = { original: "Editing layout", live: "Translated", draft: "Draft translation", missing: "Not translated" };

/** The canvas header's language menu. The canvas always edits the one layout every language shares. */
function LanguageMenu({ languages }: { languages: EditorLanguage[] }) {
  const current = languages.find((l) => l.isDefault) ?? languages[0];
  return (
    <details className="relative" data-canvas-languages="">
      <summary className="cursor-pointer list-none rounded-md px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 [&::-webkit-details-marker]:hidden">
        <span aria-hidden>🌐</span> {current.label} ▾
      </summary>
      <div className="absolute left-0 top-full z-50 mt-1 w-72 rounded-lg border border-zinc-800 bg-zinc-900 p-1.5 text-xs shadow-xl">
        <p className="px-2 py-1.5 text-[11px] leading-snug text-zinc-400">Layout and styles are shared by every language. Translations change text, images and links only.</p>
        <ul>
          {languages.map((l) => (
            <li key={l.code} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-zinc-800">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-zinc-100">{l.label}</p>
                <p className="text-[11px] text-zinc-400">{LANGUAGE_STATUS[l.status]}</p>
              </div>
              {!l.isDefault && (
                <a href={l.href} className="rounded px-1.5 py-0.5 text-zinc-200 hover:bg-zinc-700" data-canvas-translate={l.code}>
                  {l.status === "missing" ? "Translate" : "Edit text"}
                </a>
              )}
              {l.status !== "missing" && (
                <a href={l.previewHref} target="_blank" rel="noreferrer" className="rounded px-1.5 py-0.5 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100">
                  Preview ↗
                </a>
              )}
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
