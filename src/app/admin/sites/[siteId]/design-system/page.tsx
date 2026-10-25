import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTenant } from "@/lib/tenant";
import { loadDesignTokens } from "@/server/design/tokens-service";
import { DesignSystemEditor } from "./DesignSystemEditor";

export const metadata: Metadata = { title: "Design system" };

/** Designer-only: Client Mode never sees this page, and the save action refuses without `design.tokens`. */
export default async function DesignSystemPage({ params }: PageProps<"/admin/sites/[siteId]/design-system">) {
  const { siteId } = await params;
  const t = await getTenant(siteId);
  if (!t.can("design.tokens")) notFound();
  const { tokens, version, revisions } = await loadDesignTokens(t);

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <h1 className="text-2xl font-semibold text-zinc-900">Design system</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Global colours, type, spacing and depth for every page of {t.site.name}. Changes preview here instantly and go live on every page when you save.
      </p>
      <DesignSystemEditor siteId={t.site.id} initial={{ tokens, version, revisions }} />
    </main>
  );
}
