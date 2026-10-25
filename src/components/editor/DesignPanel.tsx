"use client";

import { useState, type ReactNode } from "react";
import { contrastRatio, resolveColor, type DesignTokens } from "@/lib/builder/styles";
import { isTokenRef, tokenOptions, type TokenKind } from "@/lib/design/tokens";
import { cascadedStyle, findParent, isContainer } from "@/lib/builder/tree";
import { BREAKPOINTS, type BuilderNode, type SemanticTag, type StyleKey } from "@/lib/builder/types";
import { WIDGETS } from "@/lib/builder/widgets";
import { useEditor } from "./store";

/**
 * Designer style panel. Every value is written to the breakpoint currently
 * previewed; an empty field shows what it inherits from larger screens, so
 * the desktop-first cascade is always visible.
 */
export function DesignPanel({ node, tokens }: { node: BuilderNode; tokens: DesignTokens }) {
  const def = WIDGETS[node.type];
  const textual = ["heading", "text", "button", "price"].includes(node.type);
  return (
    <div className="space-y-1">
      <ElementSection node={node} />
      {def.isContainer && <LayoutSection node={node} tokens={tokens} />}
      <Section title="Spacing">
        <BoxField node={node} k="padding" label="Padding" tokens={tokens} />
        <BoxField node={node} k="margin" label="Margin" tokens={tokens} />
      </Section>
      <Section title="Size">
        <div className="grid grid-cols-2 gap-2">
          <StyleField node={node} k="width" label="Width" placeholder="auto" />
          <StyleField node={node} k="maxWidth" label="Max width" placeholder="none" />
          <StyleField node={node} k="minHeight" label="Min height" placeholder="auto" />
          <StyleField node={node} k="aspectRatio" label="Aspect ratio" placeholder="4 / 3" />
        </div>
        {node.type === "image" && <Choice node={node} k="objectFit" label="Fit" options={["cover", "contain"]} />}
        <StyleField node={node} k="gridColumn" label="Grid column (inside a grid)" placeholder="span 2" />
      </Section>
      {(textual || def.isContainer) && <TypeSection node={node} tokens={tokens} />}
      <Section title="Fill & border">
        <ColorField node={node} k="background" label="Background" tokens={tokens} />
        <div className="grid grid-cols-2 gap-2">
          <StyleField node={node} k="borderRadius" label="Radius" tokens={tokens} tokenKind="radius" />
          <StyleField node={node} k="opacity" label="Opacity" placeholder="1" />
        </div>
        <StyleField node={node} k="border" label="Border" placeholder="1px solid rgba(0,0,0,.12)" />
        <StyleField node={node} k="boxShadow" label="Shadow" tokens={tokens} tokenKind="shadow" />
        <StyleField node={node} k="backdropFilter" label="Backdrop blur" placeholder="blur(12px)" tokens={tokens} tokenKind="blur" />
      </Section>
    </div>
  );
}

function Section({ title, children, defaultOpen = true }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-b border-zinc-100 last:border-0">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between py-2.5 text-left">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{title}</span>
        <span aria-hidden className="text-xs text-zinc-400">{open ? "−" : "+"}</span>
      </button>
      {open && <div className="space-y-2.5 pb-3">{children}</div>}
    </section>
  );
}

const inputCls =
  "w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20";

function useStyleValue(node: BuilderNode, k: StyleKey) {
  const viewport = useEditor((s) => s.viewport);
  const own = node.style[viewport]?.[k];
  const inherited = own === undefined ? cascadedStyle(node, viewport, k) : {};
  return { viewport, own: own === undefined ? undefined : String(own), inherited };
}

function FieldLabel({ label, own, from, onReset, mode }: { label: string; own?: string; from?: string; onReset: () => void; mode?: ModeToggle }) {
  return (
    <span className="mb-0.5 flex items-center justify-between gap-1 text-[11px] text-zinc-500">
      <span className="truncate">
        {label}
        {own === undefined && from && <span className="ml-1 text-zinc-400">· from {BREAKPOINTS[from as keyof typeof BREAKPOINTS].label}</span>}
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        {own !== undefined && (
          <button type="button" onClick={onReset} className="text-zinc-400 hover:text-zinc-900" aria-label={`Reset ${label}`}>
            reset
          </button>
        )}
        {mode && <SourceToggle label={label} {...mode} />}
      </span>
    </span>
  );
}

/**
 * Raw custom value or global token. A token field stores `var(--…)`, so the
 * element follows the design system when the tokens change; a raw value is
 * fixed. Opens on whichever the current value is.
 */
type ModeToggle = { token: boolean; setToken: (token: boolean) => void };

function useSourceMode(own: string | undefined, enabled: boolean): ModeToggle | undefined {
  const [token, setToken] = useState(() => isTokenRef(own));
  return enabled ? { token, setToken } : undefined;
}

function SourceToggle({ label, token, setToken }: { label: string } & ModeToggle) {
  return (
    <span className="flex overflow-hidden rounded border border-zinc-200 text-[10px]" role="radiogroup" aria-label={`${label} value source`}>
      {([true, false] as const).map((t) => (
        <button
          key={String(t)}
          type="button"
          role="radio"
          aria-checked={token === t}
          data-source={t ? "token" : "raw"}
          onClick={() => setToken(t)}
          className={`px-1.5 py-px ${token === t ? "bg-zinc-900 text-white" : "bg-white text-zinc-500 hover:text-zinc-900"}`}
        >
          {t ? "Token" : "Raw"}
        </button>
      ))}
    </span>
  );
}

const selectCls = `${"w-full rounded-md border border-zinc-300 bg-white px-1.5 py-1 text-xs text-zinc-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"}`;

function TokenSelect({ value, options, onPick, ...rest }: { value?: string; options: { label: string; value: string; preview: string }[]; onPick: (v: string | undefined) => void } & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange"> & { "data-style"?: string }) {
  const known = options.some((o) => o.value === value);
  return (
    <select {...rest} className={selectCls} value={known ? value : ""} onChange={(e) => onPick(e.target.value || undefined)} data-token-select="">
      <option value="">{value && !known ? `Raw: ${value}` : "Pick a token…"}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value} title={o.preview}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** A style input that commits on blur/Enter; with `tokenKind` it can switch to picking a global token. */
function StyleField({
  node,
  k,
  label,
  placeholder,
  options,
  tokens,
  tokenKind,
}: {
  node: BuilderNode;
  k: StyleKey;
  label: string;
  placeholder?: string;
  options?: { value: string; label: string }[];
  tokens?: DesignTokens;
  tokenKind?: TokenKind;
}) {
  const setStyle = useEditor((s) => s.setStyle);
  const { own, inherited } = useStyleValue(node, k);
  const mode = useSourceMode(own, !!tokenKind && !!tokens);
  const tokenOpts = tokenKind && tokens ? tokenOptions(tokens, tokenKind) : [];
  const suggestions = options ?? tokenOpts;
  const listId = suggestions.length ? `opts-${node.id}-${k}` : undefined;
  return (
    <label className="block">
      <FieldLabel label={label} own={own} from={inherited.from} onReset={() => setStyle(node.id, k, undefined)} mode={mode} />
      {mode?.token ? (
        <TokenSelect value={own} options={tokenOpts} onPick={(v) => setStyle(node.id, k, v)} aria-label={label} data-style={k} />
      ) : (
        <CommitText
          key={`${node.id}:${k}:${own}`}
          value={own ?? ""}
          placeholder={inherited.value ?? placeholder}
          list={listId}
          onCommit={(v) => setStyle(node.id, k, v.trim() || undefined)}
          aria-label={label}
          data-style={k}
        />
      )}
      {listId && !mode?.token && (
        <datalist id={listId}>
          {suggestions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </datalist>
      )}
    </label>
  );
}

function CommitText({ value, onCommit, ...rest }: { value: string; onCommit: (v: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & { "data-style"?: string }) {
  const [draft, setDraft] = useState(value);
  return (
    <input
      {...rest}
      className={inputCls}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onCommit(draft)}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
    />
  );
}

function Choice({ node, k, label, options, labels }: { node: BuilderNode; k: StyleKey; label: string; options: string[]; labels?: string[] }) {
  const setStyle = useEditor((s) => s.setStyle);
  const { own, inherited } = useStyleValue(node, k);
  const current = own ?? inherited.value;
  return (
    <div>
      <FieldLabel label={label} own={own} from={inherited.from} onReset={() => setStyle(node.id, k, undefined)} />
      <div className="flex overflow-hidden rounded-md border border-zinc-300" role="radiogroup" aria-label={label}>
        {options.map((o, i) => (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={current === o}
            data-choice={`${k}:${o}`}
            onClick={() => setStyle(node.id, k, o)}
            className={`flex-1 px-1 py-1 text-[11px] ${
              own === o ? "bg-zinc-900 text-white" : current === o ? "bg-zinc-200 text-zinc-900" : "bg-white text-zinc-700 hover:bg-zinc-50"
            }`}
          >
            {labels?.[i] ?? o.replace("flex-", "").replace("space-", "")}
          </button>
        ))}
      </div>
    </div>
  );
}

function ColorField({ node, k, label, tokens }: { node: BuilderNode; k: "color" | "background"; label: string; tokens: DesignTokens }) {
  const setStyle = useEditor((s) => s.setStyle);
  const { own, inherited } = useStyleValue(node, k);
  const current = own ?? inherited.value;
  const mode = useSourceMode(own === undefined ? "var(--)" : own, true)!;
  const swatches = tokenOptions(tokens, k === "background" ? "background" : "color");
  const hex = own && /^#[0-9a-f]{6}$/i.test(own) ? own : undefined;
  return (
    <div>
      <FieldLabel label={label} own={own} from={inherited.from} onReset={() => setStyle(node.id, k, undefined)} mode={mode} />
      {mode.token ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {swatches.map((o) => (
            <button
              key={o.value}
              type="button"
              title={o.label}
              aria-label={`${label} ${o.label}`}
              onClick={() => setStyle(node.id, k, o.value)}
              className={`h-5 w-5 rounded-full border ${current === o.value ? "ring-2 ring-indigo-500 ring-offset-1" : "border-zinc-300"}`}
              style={{ background: o.preview }}
            />
          ))}
          {!swatches.length && <span className="text-[11px] text-zinc-400">No colour tokens yet. Add them in Design system.</span>}
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <input
            type="color"
            aria-label={`${label} picker`}
            value={hex ?? "#000000"}
            onChange={(e) => setStyle(node.id, k, e.target.value.toUpperCase())}
            className="h-6 w-7 shrink-0 cursor-pointer rounded border border-zinc-300 bg-white p-0.5"
          />
          <CommitText
            key={`${node.id}:${k}:${own}`}
            value={own ?? ""}
            placeholder="#hex, rgb(), gradient"
            onCommit={(v) => setStyle(node.id, k, v.trim() || undefined)}
            aria-label={`${label} custom`}
          />
        </div>
      )}
    </div>
  );
}

const SIDES = ["Top", "Right", "Bottom", "Left"] as const;

function splitBox(v?: string): string[] {
  const parts = (v ?? "").trim().split(/\s+(?![^(]*\))/).filter(Boolean);
  if (!parts.length) return ["", "", "", ""];
  const [t, r = t, b = t, l = r] = parts;
  return [t, r, b, l];
}

function joinBox([t, r, b, l]: string[]): string | undefined {
  if (![t, r, b, l].some(Boolean)) return undefined;
  const v = [t, r, b, l].map((x) => x || "0");
  if (v.every((x) => x === v[0])) return v[0];
  if (v[0] === v[2] && v[1] === v[3]) return `${v[0]} ${v[1]}`;
  return v.join(" ");
}

function BoxField({ node, k, label, tokens }: { node: BuilderNode; k: "padding" | "margin"; label: string; tokens: DesignTokens }) {
  const setStyle = useEditor((s) => s.setStyle);
  const { own, inherited } = useStyleValue(node, k);
  const sides = splitBox(own);
  const ghost = splitBox(inherited.value);
  const allTokens = !!own && sides.every((x) => isTokenRef(x));
  const mode = useSourceMode(allTokens ? "var(--)" : undefined, true)!;
  const space = tokenOptions(tokens, "space");
  const listId = `space-${node.id}-${k}`;
  const commit = (i: number, v: string) => {
    const next = own ? [...sides] : [...ghost];
    next[i] = v.trim();
    setStyle(node.id, k, joinBox(next));
  };
  return (
    <div>
      <FieldLabel label={label} own={own} from={inherited.from} onReset={() => setStyle(node.id, k, undefined)} mode={mode} />
      <div className="grid grid-cols-4 gap-1">
        {SIDES.map((side, i) =>
          mode.token ? (
            <TokenSelect
              key={`${node.id}:${k}:${i}`}
              value={own ? sides[i] : undefined}
              options={space}
              onPick={(v) => commit(i, v ?? "")}
              title={`${label} ${side.toLowerCase()}`}
              aria-label={`${label} ${side.toLowerCase()}`}
            />
          ) : (
            <CommitText
              key={`${node.id}:${k}:${own}:${i}`}
              value={own ? sides[i] : ""}
              placeholder={ghost[i] || "0"}
              list={listId}
              title={`${label} ${side.toLowerCase()}`}
              aria-label={`${label} ${side.toLowerCase()}`}
              onCommit={(v) => commit(i, v)}
            />
          ),
        )}
      </div>
      <datalist id={listId}>
        {space.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </datalist>
    </div>
  );
}

function LayoutSection({ node, tokens }: { node: BuilderNode; tokens: DesignTokens }) {
  const { inherited, own } = useStyleValue(node, "display");
  const display = own ?? inherited.value ?? "block";
  const setStyle = useEditor((s) => s.setStyle);
  const viewport = useEditor((s) => s.viewport);
  const cols = cascadedStyle(node, viewport, "gridTemplateColumns").value;
  const gridCols = ["1fr", "repeat(2, 1fr)", "repeat(3, 1fr)", "repeat(4, 1fr)"];
  return (
    <Section title="Layout">
      <Choice node={node} k="display" label="Display" options={["block", "flex", "grid"]} />
      {display === "flex" && (
        <>
          <Choice node={node} k="flexDirection" label="Direction" options={["row", "column"]} labels={["Row →", "Column ↓"]} />
          <Choice node={node} k="flexWrap" label="Wrap" options={["nowrap", "wrap"]} labels={["No wrap", "Wrap"]} />
        </>
      )}
      {display === "grid" && (
        <div>
          <span className="mb-0.5 block text-[11px] text-zinc-500">Columns</span>
          <div className="flex overflow-hidden rounded-md border border-zinc-300">
            {gridCols.map((c, i) => (
              <button
                key={c}
                type="button"
                data-choice={`gridTemplateColumns:${i + 1}`}
                onClick={() => setStyle(node.id, "gridTemplateColumns", c)}
                className={`flex-1 py-1 text-[11px] ${cols === c ? "bg-zinc-900 text-white" : "bg-white hover:bg-zinc-50"}`}
              >
                {i + 1}
              </button>
            ))}
          </div>
          <div className="mt-2">
            <StyleField node={node} k="gridTemplateColumns" label="Template" placeholder="1.2fr 1fr" />
          </div>
        </div>
      )}
      {display !== "block" && (
        <>
          <Choice node={node} k="justifyContent" label="Justify" options={["flex-start", "center", "flex-end", "space-between"]} labels={["Start", "Center", "End", "Between"]} />
          <Choice node={node} k="alignItems" label="Align" options={["flex-start", "center", "flex-end", "stretch"]} labels={["Start", "Center", "End", "Stretch"]} />
          <StyleField node={node} k="gap" label="Gap" tokens={tokens} tokenKind="space" />
        </>
      )}
    </Section>
  );
}

function TypeSection({ node, tokens }: { node: BuilderNode; tokens: DesignTokens }) {
  const doc = useEditor((s) => s.doc);
  const viewport = useEditor((s) => s.viewport);
  // Contrast against the nearest background up the tree.
  let bg: string | undefined;
  for (let id: string | undefined = node.id; id && !bg; id = findParent(doc, id)) {
    bg = resolveColor(cascadedStyle(doc.nodes[id], viewport, "background").value, tokens);
  }
  let fg: string | undefined;
  for (let id: string | undefined = node.id; id && !fg; id = findParent(doc, id)) {
    fg = resolveColor(cascadedStyle(doc.nodes[id], viewport, "color").value, tokens);
  }
  const ratio = contrastRatio(fg ?? tokens.colors?.text ?? "#111111", bg ?? tokens.colors?.background ?? "#ffffff");

  return (
    <Section title="Typography">
      <div className="grid grid-cols-2 gap-2">
        <StyleField node={node} k="fontFamily" label="Font" tokens={tokens} tokenKind="font" />
        <StyleField node={node} k="fontSize" label="Size" tokens={tokens} tokenKind="text" />
        <StyleField node={node} k="fontWeight" label="Weight" placeholder="400" options={["300", "400", "500", "600", "700"].map((w) => ({ value: w, label: w }))} />
        <StyleField node={node} k="lineHeight" label="Line height" placeholder="1.5" tokens={tokens} tokenKind="leading" />
        <StyleField node={node} k="letterSpacing" label="Tracking" placeholder="0" tokens={tokens} tokenKind="tracking" />
      </div>
      <Choice node={node} k="textAlign" label="Align" options={["left", "center", "right"]} />
      <Choice node={node} k="textTransform" label="Case" options={["none", "uppercase"]} labels={["Aa", "AA"]} />
      <ColorField node={node} k="color" label="Text colour" tokens={tokens} />
      {ratio !== null && (
        <p className={`rounded px-2 py-1 text-[11px] ${ratio >= 4.5 ? "bg-emerald-50 text-emerald-800" : ratio >= 3 ? "bg-amber-50 text-amber-800" : "bg-red-50 text-red-700"}`}>
          Contrast {ratio.toFixed(1)}:1 · {ratio >= 4.5 ? "passes WCAG AA" : ratio >= 3 ? "AA for large text only" : "fails WCAG AA"}
        </p>
      )}
    </Section>
  );
}

function ElementSection({ node }: { node: BuilderNode }) {
  const doc = useEditor((s) => s.doc);
  const { setName, setTag, duplicate, removeNode, select } = useEditor.getState();
  const def = WIDGETS[node.type];
  const isRoot = node.id === doc.rootId;
  const parentId = findParent(doc, node.id);
  return (
    <Section title="Element">
      <label className="block">
        <span className="mb-0.5 block text-[11px] text-zinc-500">Name in layers</span>
        <CommitText key={`${node.id}:${node.name}`} value={node.name ?? ""} placeholder={def.label} onCommit={(v) => setName(node.id, v)} aria-label="Element name" />
      </label>
      {def.allowedTags.length > 1 && (
        <label className="block">
          <span className="mb-0.5 block text-[11px] text-zinc-500">HTML tag (for accessibility and SEO)</span>
          <select
            className={inputCls}
            value={node.tag ?? def.defaultTag}
            onChange={(e) => setTag(node.id, e.target.value === def.defaultTag ? undefined : (e.target.value as SemanticTag))}
            aria-label="HTML tag"
          >
            {def.allowedTags.map((t) => (
              <option key={t} value={t}>
                &lt;{t}&gt;
              </option>
            ))}
          </select>
        </label>
      )}
      {!isRoot && (
        <div className="flex gap-1.5">
          {parentId && (
            <button type="button" onClick={() => select(parentId)} className="flex-1 rounded-md border border-zinc-300 px-2 py-1 text-[11px] hover:bg-zinc-50">
              Select parent
            </button>
          )}
          <button type="button" onClick={() => duplicate(node.id)} className="flex-1 rounded-md border border-zinc-300 px-2 py-1 text-[11px] hover:bg-zinc-50">
            Duplicate
          </button>
          <button type="button" onClick={() => removeNode(node.id)} className="flex-1 rounded-md border border-red-200 px-2 py-1 text-[11px] text-red-700 hover:bg-red-50">
            Delete
          </button>
        </div>
      )}
      {isContainer(doc, node.id) && <p className="text-[11px] text-zinc-400">{node.children?.length ?? 0} items inside</p>}
    </Section>
  );
}
