import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/cms/ui";
import { localePath } from "@/lib/i18n/locales";
import { getTenant } from "@/lib/tenant";
import { getTranslationEditor, listTranslations } from "@/server/i18n/translation-service";
import { StartTranslationButton } from "./StartTranslationButton";
import { TranslationDrawer } from "./TranslationDrawer";

export const metadata: Metadata = { title: "Translations" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Every original with the state of its translations, and the side-by-side
 * drawer (?edit=<translation id>) where translators work.
 */
export default async function TranslationsPage({ params, searchParams }: PageProps<"/admin/sites/[siteId]/translations">) {
  const { siteId } = await params;
  const sp = await searchParams;
  const t = await getTenant(siteId);
  if (!t.can("content.edit") && !t.can("design.layout")) notFound();

  const q = (one(sp.q) ?? "").trim().slice(0, 100);
  const typeId = one(sp.type) || null;
  const source = one(sp.source) || null;
  const { locales, sources, postTypes } = await listTranslations(t, { postTypeId: typeId, q });
  const secondary = locales.filter((l) => !l.isDefault);
  const def = locales.find((l) => l.isDefault);

  const editId = one(sp.edit);
  const editor = editId ? await getTranslationEditor(t, editId) : null;
  if (editId && !editor) notFound();
  const assets = editor
    ? await t.db.mediaAsset.findMany({
        orderBy: { createdAt: "desc" },
        take: 500,
        select: { id: true, url: true, title: true, altText: true, originalName: true, mimeType: true, width: true, height: true, sizeBytes: true },
      })
    : [];
  const listHref = `/admin/sites/${t.site.id}/translations${typeId || q ? `?${new URLSearchParams({ ...(typeId ? { type: typeId } : {}), ...(q ? { q } : {}) })}` : ""}`;

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-zinc-900">Translations</h1>
        <p className="text-sm text-zinc-500">
          {secondary.length
            ? `Originals in ${def?.label ?? "the default language"} and their ${secondary.map((l) => l.label).join(", ")} versions. Translations change text, images and links; layout and styles always come from the original.`
            : "Add a second language under Settings → Languages to start translating."}
        </p>
      </div>

      {secondary.length > 0 && (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <nav aria-label="Post types" className="flex flex-wrap gap-2 text-sm">
              <Link href={`/admin/sites/${t.site.id}/translations`} aria-current={!typeId ? "page" : undefined} className={`rounded-full border px-3 py-1 ${!typeId ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-700"}`}>
                All
              </Link>
              {postTypes.map((p) => (
                <Link key={p.id} href={`/admin/sites/${t.site.id}/translations?type=${p.id}`} aria-current={typeId === p.id ? "page" : undefined} className={`rounded-full border px-3 py-1 ${typeId === p.id ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-700"}`}>
                  {p.labelPlural}
                </Link>
              ))}
            </nav>
            <form role="search" className="flex gap-2">
              {typeId && <input type="hidden" name="type" value={typeId} />}
              <label htmlFor="tr-search" className="sr-only">Search originals</label>
              <input id="tr-search" name="q" defaultValue={q} placeholder="Search originals…" className="w-64 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm" />
              <button className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50">Search</button>
            </form>
          </div>

          <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
            <table className="w-full text-left text-sm" data-translations="">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wider text-zinc-500">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-medium">{def?.label ?? "Original"}</th>
                  {secondary.map((l) => (
                    <th key={l.code} scope="col" className="px-4 py-2.5 font-medium">
                      {l.label} <span className="font-mono normal-case text-zinc-400">{l.code}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {sources.map((s) => (
                  <tr key={s.id} data-source={s.path} className={source === s.id ? "bg-amber-50/60" : undefined}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-zinc-900">{s.title}</p>
                      <p className="text-xs text-zinc-500">
                        {s.type} · {s.path}
                        {!s.live && " · not published"}
                      </p>
                    </td>
                    {secondary.map((l) => {
                      const cell = s.translations[l.code];
                      return (
                        <td key={l.code} className="px-4 py-3" data-cell={l.code}>
                          {cell ? (
                            <Link href={`${listHref}${listHref.includes("?") ? "&" : "?"}edit=${cell.postId}`} className="group inline-flex flex-col gap-1" data-edit-translation={l.code}>
                              <StatusBadge status={cell.status} />
                              <span className="text-xs text-zinc-500 group-hover:text-zinc-900 group-hover:underline">{l.domain ? `${l.domain}${cell.path}` : localePath(l, cell.path)} · Edit</span>
                            </Link>
                          ) : (
                            <StartTranslationButton siteId={t.site.id} sourceId={s.id} locale={l.code} label={l.label} listHref={listHref} />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {!sources.length && (
                  <tr>
                    <td colSpan={secondary.length + 1} className="px-4 py-8 text-center text-zinc-500">
                      Nothing to translate here yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {editor && <TranslationDrawer key={editor.translation.id} siteId={t.site.id} siteKey={t.site.subdomain} data={editor} assets={assets} canUpload={t.can("media.upload")} closeHref={listHref} />}
    </main>
  );
}
