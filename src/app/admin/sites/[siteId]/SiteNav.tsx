"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function SiteNav({ base, items }: { base: string; items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Site" className="flex flex-wrap gap-x-0.5 gap-y-1 text-sm">
      {items.map((item) => {
        const href = base + item.href;
        const active = item.href ? pathname.startsWith(href) : pathname === base;
        return (
          <Link
            key={item.href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap rounded-md px-2 py-1.5 ${active ? "bg-zinc-100 font-medium text-zinc-900" : "text-zinc-600 hover:text-zinc-900"}`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
