import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenant } from "@/lib/tenant";
import { listLocales } from "@/server/i18n/locale-service";
import { LanguagesPanel } from "./LanguagesPanel";

export const metadata: Metadata = { title: "Languages" };

export default async function LanguagesPage({ params }: PageProps<"/admin/sites/[siteId]/settings/languages">) {
  const { siteId } = await params;
  const t = await getTenant(siteId);
  if (!t.can("site.settings")) notFound();
  const { locales, localeDetection } = await listLocales(t);

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <p className="text-sm">
        <Link href={`/admin/sites/${t.site.id}/settings`} className="text-zinc-500 hover:text-zinc-900">
          ← Site settings
        </Link>
      </p>
      <h1 className="mt-1 text-2xl font-semibold text-zinc-900">Languages</h1>
      <p className="mb-6 text-sm text-zinc-500">
        The default language keeps the site&apos;s clean addresses (/about). Each other language gets a prefix (/fr/about) or its own domain. Translations share the original&apos;s layout and styles, so only text, images and links change per language.
      </p>
      <LanguagesPanel siteId={t.site.id} initial={locales} localeDetection={localeDetection} />
    </main>
  );
}
