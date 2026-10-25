import Link from "next/link";
import { getTenant } from "@/lib/tenant";
import { logout } from "@/app/login/actions";

/** Branded client portal shell. The editor route renders full-screen on top of it. */
export default async function SiteLayout({ children, params }: LayoutProps<"/admin/sites/[siteId]">) {
  const { siteId } = await params;
  const t = await getTenant(siteId);
  const branding = (t.site.branding ?? {}) as { accent?: string; logoText?: string };

  return (
    <div className="min-h-dvh bg-zinc-50" style={{ ["--accent" as string]: branding.accent ?? "#18181b" }}>
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-6">
          <Link href={`/admin/sites/${t.site.id}`} className="flex items-center gap-2 font-semibold text-zinc-900">
            <span className="flex h-7 w-7 items-center justify-center rounded-md text-xs text-white" style={{ background: "var(--accent)" }}>
              {(branding.logoText ?? t.site.name).slice(0, 1)}
            </span>
            {t.site.name}
          </Link>
          <nav className="flex gap-4 text-sm text-zinc-600">
            <Link href={`/admin/sites/${t.site.id}`} className="hover:text-zinc-900">Pages</Link>
            {t.can("analytics.view") && <span className="text-zinc-400" title="Coming in a later phase">Analytics</span>}
            {t.can("commerce.manage") && <span className="text-zinc-400" title="Coming in a later phase">Products</span>}
            {t.can("site.settings") && <span className="text-zinc-400" title="Coming in a later phase">Settings</span>}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="text-zinc-500">{t.user.name ?? t.user.email} · {t.role.name}</span>
            <form action={logout}>
              <button className="text-zinc-500 hover:text-zinc-900">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
