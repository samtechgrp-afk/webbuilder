"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/**
 * Builder help: keyboard shortcuts (⌘ on Apple devices, Ctrl elsewhere) and
 * how dynamic, field-bound content works. Opened from the header's ? button
 * or the ? key; Esc closes it and returns focus to where it was.
 */
export function HelpDrawer({ siteId, designMode, canManageFields, onClose }: { siteId: string; designMode: boolean; canManageFields: boolean; onClose: () => void }) {
  const ref = useRef<HTMLElement>(null);
  // Only ever rendered after a click or key press, so reading navigator here can't mismatch hydration.
  const [mod] = useState(() => (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘" : "Ctrl"));
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      previous?.focus?.();
    };
  }, [onClose]);

  const shortcuts: [string[], string, boolean][] = [
    [[mod, "Z"], "Undo", true],
    [[mod, "Shift", "Z"], "Redo (or " + mod + " Y)", true],
    [["Esc"], "Select the parent element; stop editing text", true],
    [["Enter"], "Finish editing a heading (" + mod + " Enter in a paragraph)", true],
    [[mod, "D"], "Duplicate the selected element", false],
    [["Delete"], "Remove the selected element", false],
    [["?"], "Open or close this help", true],
  ];

  return (
    <aside
      ref={ref}
      tabIndex={-1}
      role="dialog"
      aria-label="Builder help"
      className="fixed top-14 right-0 bottom-0 z-40 flex w-[24rem] max-w-full flex-col border-l border-zinc-200 bg-white shadow-2xl outline-none"
      data-help-drawer=""
    >
      <header className="flex items-center justify-between border-b border-zinc-200 px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold">Help</h2>
          <p className="text-[11px] text-zinc-500">{designMode ? "Design mode" : "Client mode"} shortcuts and tips</p>
        </div>
        <button type="button" onClick={onClose} className="text-xs text-zinc-500 hover:text-zinc-900" data-close-help="">
          Close
        </button>
      </header>
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5 text-sm text-zinc-700">
        <section>
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-zinc-500 uppercase">Keyboard shortcuts</h3>
          <table className="w-full" data-shortcuts="">
            <tbody>
              {shortcuts
                .filter(([, , everyone]) => everyone || designMode)
                .map(([keys, what]) => (
                  <tr key={what} className="border-b border-zinc-100 last:border-0">
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {keys.map((k) => (
                        <kbd key={k} className="mr-1 rounded border border-zinc-300 bg-zinc-50 px-1.5 py-0.5 font-mono text-[11px] text-zinc-800 shadow-[0_1px_0_#d4d4d8]">{k}</kbd>
                      ))}
                    </td>
                    <td className="py-2 text-zinc-600">{what}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>

        <section>
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-zinc-500 uppercase">Editing on the page</h3>
          <ul className="list-disc space-y-1.5 pl-4">
            <li>Click an element to select it; click selected text (or double-click) to type.</li>
            {designMode ? (
              <li>Drag widgets from the palette, reorder them in Layers, and style each breakpoint separately. Phone and tablet inherit from desktop until you change them.</li>
            ) : (
              <li>Text, links and media are yours to change. Layouts and grid columns are locked by your designer; the lock badge on a section says so.</li>
            )}
            <li>Save draft keeps your work private; Publish puts it live.</li>
          </ul>
        </section>

        <section>
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-zinc-500 uppercase">Dynamic content and custom fields</h3>
          <ul className="list-disc space-y-1.5 pl-4">
            <li>Elements with a link badge are <strong>bound</strong>: they show a post&apos;s title, a custom field or a site setting, so you edit the value at its source, not on the canvas.</li>
            <li>A <strong>loop grid</strong> lists entries of a content type. Add, reorder or unpublish entries in Content and the grid follows; only its first card is the editable template.</li>
            {designMode && <li>Bind a widget from its inspector: pick the source (post, field or site) and the field. Fields come from field groups attached to the content type.</li>}
            <li>Price fields format in the site&apos;s currency; image fields come from the media library.</li>
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href={`/admin/sites/${siteId}/content`} className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs font-medium hover:bg-zinc-50">Open Content</Link>
            {canManageFields && (
              <Link href={`/admin/sites/${siteId}/fields`} className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs font-medium hover:bg-zinc-50">Manage fields</Link>
            )}
          </div>
        </section>
      </div>
    </aside>
  );
}
