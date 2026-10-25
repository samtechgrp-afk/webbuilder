"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A small WYSIWYG editor: headings, emphasis, lists, quotes and links. The
 * HTML it produces is only a suggestion; the server sanitises it to an
 * allowlist before storing it. Pasting inserts plain text, so content copied
 * from Word or a web page doesn't drag its styling along.
 */
const TOOLS = [
  { cmd: "formatBlock", arg: "h2", label: "Heading", short: "H2" },
  { cmd: "formatBlock", arg: "h3", label: "Subheading", short: "H3" },
  { cmd: "formatBlock", arg: "p", label: "Paragraph", short: "¶" },
  { cmd: "bold", label: "Bold", short: "B" },
  { cmd: "italic", label: "Italic", short: "I" },
  { cmd: "insertUnorderedList", label: "Bulleted list", short: "•" },
  { cmd: "insertOrderedList", label: "Numbered list", short: "1." },
  { cmd: "formatBlock", arg: "blockquote", label: "Quote", short: "❝" },
] as const;

export function RichTextEditor({
  id,
  value,
  onChange,
  disabled,
  describedBy,
  label,
  minHeight = 180,
}: {
  id?: string;
  value: string;
  onChange: (html: string) => void;
  disabled?: boolean;
  describedBy?: string;
  label: string;
  minHeight?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<Record<string, boolean>>({});

  // Uncontrolled after mount so the caret never jumps; only external resets rewrite it.
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value && document.activeElement !== ref.current) ref.current.innerHTML = value;
  }, [value]);

  const refreshState = () => {
    setActive({ bold: document.queryCommandState("bold"), italic: document.queryCommandState("italic") });
  };

  const exec = (cmd: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(cmd, false, arg);
    onChange(ref.current?.innerHTML ?? "");
    refreshState();
  };

  const link = () => {
    const url = prompt("Link to (https://…, /page or mailto:)");
    if (url === null) return;
    if (!url) return exec("unlink");
    if (!/^(https?:\/\/|\/(?!\/)|#|mailto:|tel:)/i.test(url)) return alert("Links must start with https://, /, #, mailto: or tel:");
    exec("createLink", url);
  };

  return (
    <div className={`overflow-hidden rounded-lg border border-zinc-300 bg-white focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[var(--accent)]/20 ${disabled ? "opacity-60" : ""}`}>
      <div role="toolbar" aria-label={`${label} formatting`} aria-controls={id} className="flex flex-wrap gap-0.5 border-b border-zinc-200 bg-zinc-50 p-1">
        {TOOLS.map((tool) => (
          <button
            key={tool.label}
            type="button"
            disabled={disabled}
            title={tool.label}
            aria-label={tool.label}
            aria-pressed={tool.cmd === "bold" || tool.cmd === "italic" ? !!active[tool.cmd] : undefined}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec(tool.cmd, "arg" in tool ? `<${tool.arg}>` : undefined)}
            className={`min-w-8 rounded px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-white aria-pressed:bg-white aria-pressed:shadow-sm ${tool.cmd === "italic" ? "italic" : ""}`}
          >
            {tool.short}
          </button>
        ))}
        <button type="button" disabled={disabled} title="Link" aria-label="Link" onMouseDown={(e) => e.preventDefault()} onClick={link} className="rounded px-2 py-1 text-xs font-semibold text-zinc-700 underline hover:bg-white">
          Link
        </button>
      </div>
      <div
        id={id}
        ref={ref}
        role="textbox"
        aria-multiline="true"
        aria-label={label}
        aria-describedby={describedBy}
        contentEditable={!disabled}
        suppressContentEditableWarning
        onInput={() => onChange(ref.current?.innerHTML ?? "")}
        onKeyUp={refreshState}
        onMouseUp={refreshState}
        onPaste={(e) => {
          e.preventDefault();
          document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
        }}
        className="prose-cms px-4 py-3 text-sm leading-relaxed text-zinc-900 outline-none [&_blockquote]:border-l-2 [&_blockquote]:border-zinc-300 [&_blockquote]:pl-3 [&_h2]:mt-3 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mt-2 [&_h3]:font-semibold [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_a]:text-indigo-700 [&_a]:underline"
        style={{ minHeight }}
      />
    </div>
  );
}
