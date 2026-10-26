"use client";

import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";

/** Small shared building blocks for the CMS screens. */

type Tone = "primary" | "secondary" | "ghost" | "danger";

const TONES: Record<Tone, string> = {
  primary: "bg-[var(--accent)] text-white hover:opacity-90",
  secondary: "border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50",
  ghost: "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
  danger: "border border-red-200 bg-white text-red-700 hover:bg-red-50",
};

export function Button({ tone = "secondary", size = "md", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone; size?: "sm" | "md" }) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50 ${
        size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-2 text-sm"
      } ${TONES[tone]} ${className}`}
    />
  );
}

export const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20 disabled:bg-zinc-50 disabled:text-zinc-500";

/** Label + control + hint + error, wired up for screen readers. */
export function Field({
  label,
  hint,
  error,
  required,
  children,
  className = "",
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  children: (props: { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean }) => ReactNode;
  className?: string;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errId = `${id}-err`;
  const describedBy = [hint ? hintId : null, error ? errId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={`space-y-1.5 ${className}`}>
      <label htmlFor={id} className="block text-sm font-medium text-zinc-800">
        {label}
        {required && <span className="ml-0.5 text-red-600" aria-hidden>*</span>}
        {required && <span className="sr-only"> (required)</span>}
      </label>
      {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}
      {hint && <p id={hintId} className="text-xs text-zinc-500">{hint}</p>}
      {error && <p id={errId} className="text-xs font-medium text-red-700">{error}</p>}
    </div>
  );
}

export function Card({ title, actions, children, className = "" }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-zinc-200 bg-white ${className}`}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-zinc-100 px-5 py-3">
          {title && <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>}
          {actions}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export const STATUS_LABEL: Record<string, string> = {
  PUBLISHED: "Published",
  DRAFT: "Draft",
  PENDING_REVIEW: "Pending review",
  SCHEDULED: "Scheduled",
  ARCHIVED: "Archived",
  TRASHED: "Trash",
  ACTIVE: "Active",
  PENDING: "Awaiting payment",
  PAID: "Paid",
  FULFILLED: "Fulfilled",
  REFUNDED: "Refunded",
  CANCELLED: "Cancelled",
};

const STATUS_STYLE: Record<string, string> = {
  PUBLISHED: "bg-emerald-50 text-emerald-800 ring-emerald-600/20",
  DRAFT: "bg-zinc-100 text-zinc-700 ring-zinc-500/20",
  PENDING_REVIEW: "bg-amber-50 text-amber-800 ring-amber-600/20",
  SCHEDULED: "bg-sky-50 text-sky-800 ring-sky-600/20",
  ARCHIVED: "bg-zinc-100 text-zinc-500 ring-zinc-500/20",
  TRASHED: "bg-red-50 text-red-700 ring-red-600/20",
  ACTIVE: "bg-emerald-50 text-emerald-800 ring-emerald-600/20",
  PENDING: "bg-amber-50 text-amber-800 ring-amber-600/20",
  PAID: "bg-sky-50 text-sky-800 ring-sky-600/20",
  FULFILLED: "bg-emerald-50 text-emerald-800 ring-emerald-600/20",
  REFUNDED: "bg-violet-50 text-violet-800 ring-violet-600/20",
  CANCELLED: "bg-zinc-100 text-zinc-500 ring-zinc-500/20",
};

export function StatusBadge({ status }: { status: string }) {
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_STYLE[status] ?? STATUS_STYLE.DRAFT}`}>{STATUS_LABEL[status] ?? status}</span>;
}

/**
 * Modal or side drawer on the native <dialog>: focus is trapped and Esc
 * closes it without any extra code, and the page behind is inert.
 */
export function Dialog({
  open,
  onClose,
  title,
  side = false,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  side?: boolean;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  // Next keeps a route it navigated away from mounted but hidden; a modal left
  // open there would keep the new page inert. Hiding runs effect cleanups.
  useEffect(() => {
    const d = ref.current;
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={
        side
          ? "fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-dvh w-full max-w-md bg-white p-0 shadow-2xl backdrop:bg-zinc-950/40 open:flex open:flex-col"
          : `m-auto w-full ${wide ? "max-w-3xl" : "max-w-lg"} rounded-xl bg-white p-0 shadow-2xl backdrop:bg-zinc-950/40 open:flex open:max-h-[85vh] open:flex-col`
      }
    >
      <header className="flex items-center justify-between gap-3 border-b border-zinc-200 px-5 py-3">
        <h2 id={titleId} className="text-base font-semibold text-zinc-900">{title}</h2>
        <button type="button" onClick={onClose} className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900" aria-label="Close">
          <svg aria-hidden width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 4l8 8M12 4l-8 8" /></svg>
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">{open ? children : null}</div>
      {footer && <footer className="flex justify-end gap-2 border-t border-zinc-200 px-5 py-3">{footer}</footer>}
    </dialog>
  );
}

/** Polite live region for results ("3 entries moved to trash"). */
export function Notice({ tone, children, onDismiss }: { tone: "success" | "error" | "info"; children: ReactNode; onDismiss?: () => void }) {
  const styles = { success: "border-emerald-200 bg-emerald-50 text-emerald-900", error: "border-red-200 bg-red-50 text-red-900", info: "border-zinc-200 bg-zinc-50 text-zinc-800" };
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`flex items-start justify-between gap-3 rounded-lg border px-4 py-2.5 text-sm ${styles[tone]}`}>
      <div className="min-w-0">{children}</div>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="shrink-0 text-xs underline underline-offset-2">
          Dismiss
        </button>
      )}
    </div>
  );
}

export function Toggle({ checked, onChange, label, disabled, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean; id?: string }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:opacity-50 ${checked ? "bg-[var(--accent)]" : "bg-zinc-300"}`}
    >
      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${checked ? "translate-x-5" : "translate-x-0.5"}`} />
    </button>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-12 text-center">
      <p className="font-medium text-zinc-900">{title}</p>
      {children && <div className="mt-2 text-sm text-zinc-500">{children}</div>}
    </div>
  );
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
