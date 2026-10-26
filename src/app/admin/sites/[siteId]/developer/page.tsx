import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTenant } from "@/lib/tenant";
import { getDeveloperSettings } from "@/server/graphql/developer-service";
import { DeveloperPanel } from "./DeveloperPanel";

export const metadata: Metadata = { title: "Developer" };

/** Designer-only: the headless GraphQL API, its keys and a playground. */
export default async function DeveloperPage({ params }: PageProps<"/admin/sites/[siteId]/developer">) {
  const { siteId } = await params;
  const t = await getTenant(siteId);
  if (!t.can("developer.api")) notFound();
  const settings = await getDeveloperSettings(t);

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <h1 className="text-2xl font-semibold text-zinc-900">Developer</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Read {t.site.name}&rsquo;s pages, entries, custom fields, taxonomies and media from any app through GraphQL. Public requests only ever see published content.
      </p>
      <DeveloperPanel
        siteId={t.site.id}
        subdomain={t.site.subdomain}
        enabled={settings.graphqlEnabled}
        isPublic={settings.graphqlPublic}
        keys={settings.keys.map((k) => ({
          id: k.id,
          name: k.name,
          scope: k.scope,
          prefix: k.prefix,
          createdAt: k.createdAt.toISOString(),
          lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
          revokedAt: k.revokedAt?.toISOString() ?? null,
          by: k.createdBy?.name ?? k.createdBy?.email ?? null,
        }))}
      />
    </main>
  );
}
