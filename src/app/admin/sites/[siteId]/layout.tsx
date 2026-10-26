import Link from "next/link";
import { getTenant } from "@/lib/tenant";
import { logout } from "@/app/login/actions";
import { readSiteLocales } from "@/server/i18n/locale-service";
import { adminLocale } from "@/server/i18n/admin-locale";
import { AdminLocaleSwitcher } from "./AdminLocaleSwitcher";
import { SiteNav } from "./SiteNav";

/** Branded client portal shell. The editor route renders full-screen on top of it. */
export default async function SiteLayout({ children, params }: LayoutProps<"/admin/sites/[siteId]">) {
  const { siteId } = await params;
  const t = await getTenant(siteId);
  const branding = (t.site.branding ?? {}) as { accent?: string; logoText?: string };
  const locales = await readSiteLocales(t.site.id);
  const multilingual = locales.length > 1;
  const canTranslate = t.can("content.edit") || t.can("design.layout");
  const current = multilingual ? await adminLocale(t.site.id, locales) : null;

  return (
    <div className="min-h-dvh bg-zinc-50" style={{ ["--accent" as string]: branding.accent ?? "#18181b" }}>
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-6">
          <Link href={`/admin/sites/${t.site.id}`} className="flex items-center gap-2 font-semibold text-zinc-900">
            <span className="flex h-7 w-7 items-center justify-center rounded-md text-xs text-white" style={{ background: "var(--accent)" }}>
              {(branding.logoText ?? t.site.name).slice(0, 1)}
            </span>
            {t.site.name}
          </Link>
          <SiteNav
            base={`/admin/sites/${t.site.id}`}
            items={[
              { href: "", label: "Dashboard" },
              { href: "/content", label: "Content" },
              ...(multilingual && canTranslate ? [{ href: "/translations", label: "Translations" }] : []),
              { href: "/media", label: "Media" },
              ...(t.can("schema.manage") ? [{ href: "/cpts", label: "Post types" }, { href: "/fields", label: "Fields" }] : []),
              ...(t.can("content.edit") || t.can("site.settings") ? [{ href: "/seo", label: "SEO" }] : []),
              ...(t.can("design.tokens") ? [{ href: "/design-system", label: "Design system" }] : []),
              ...(t.can("site.settings") ? [{ href: "/export", label: "Export" }] : []),
              ...(t.can("developer.api") ? [{ href: "/developer", label: "Developer" }] : []),
              ...(t.can("site.settings") ? [{ href: "/settings", label: "Settings" }] : []),
            ]}
          />
          <div className="ml-auto flex items-center gap-3 text-sm">
            {multilingual && current && <AdminLocaleSwitcher siteId={t.site.id} locales={locales.map((l) => ({ code: l.code, label: l.label, isDefault: l.isDefault }))} current={current.code} />}
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
