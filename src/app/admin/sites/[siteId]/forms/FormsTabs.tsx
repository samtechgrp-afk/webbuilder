import Link from "next/link";

/** Messages | Subscribers switch at the top of the Forms screens. */
export function FormsTabs({ base, current }: { base: string; current: "messages" | "subscribers" }) {
  const tabs = [
    { key: "messages", label: "Messages", href: base },
    { key: "subscribers", label: "Subscribers", href: `${base}/subscribers` },
  ] as const;
  return (
    <nav aria-label="Forms" className="mb-5 flex gap-1 border-b border-zinc-200 text-sm">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === current ? "page" : undefined}
          className={`-mb-px border-b-2 px-3 py-2 ${t.key === current ? "border-[var(--accent)] font-medium text-zinc-900" : "border-transparent text-zinc-500 hover:text-zinc-900"}`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
