"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Card, Notice, inputClass } from "@/components/cms/ui";
import { deleteTaxonomyAction, deleteTermAction, saveTaxonomyAction, saveTermAction } from "@/server/cms-actions";

interface Taxonomy {
  id: string;
  key: string;
  label: string;
  hierarchical: boolean;
  postTypeIds: string[];
}
interface Term {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  taxonomyId: string;
}

/** Categories and tags for one post type: create, attach, and manage their terms. */
export function TaxonomyManager({ siteId, postTypeId, taxonomies, terms }: { siteId: string; postTypeId: string; taxonomies: Taxonomy[]; terms: Term[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [hierarchical, setHierarchical] = useState(true);
  const attached = taxonomies.filter((x) => x.postTypeIds.includes(postTypeId));
  const others = taxonomies.filter((x) => !x.postTypeIds.includes(postTypeId));

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (!res.ok) return setError(res.error ?? "Something went wrong");
      router.refresh();
    });

  return (
    <Card title="Taxonomies">
      <div className="space-y-5">
        {error && <Notice tone="error">{error}</Notice>}
        {attached.map((tax) => (
          <TaxonomyCard
            key={tax.id}
            tax={tax}
            terms={terms.filter((x) => x.taxonomyId === tax.id)}
            pending={pending}
            onSaveTerm={(input) => act(() => saveTermAction({ siteId, taxonomyId: tax.id, ...input }))}
            onDeleteTerm={(id) => act(() => deleteTermAction({ siteId, id }))}
            onDetach={() => act(() => saveTaxonomyAction({ siteId, id: tax.id, label: tax.label, hierarchical: tax.hierarchical, postTypeIds: tax.postTypeIds.filter((x) => x !== postTypeId) }))}
            onDelete={() => confirm(`Delete ${tax.label} and all its terms?`) && act(() => deleteTaxonomyAction({ siteId, id: tax.id }))}
          />
        ))}
        {!attached.length && <p className="text-sm text-zinc-500">No taxonomies yet.</p>}

        <form
          className="space-y-3 rounded-lg border border-dashed border-zinc-300 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!label.trim()) return;
            act(async () => {
              const res = await saveTaxonomyAction({ siteId, label, hierarchical, postTypeIds: [postTypeId] });
              if (res.ok) setLabel("");
              return res;
            });
          }}
        >
          <p className="text-sm font-medium text-zinc-800">Add a taxonomy</p>
          <div className="flex flex-wrap gap-2">
            <label htmlFor="tax-label" className="sr-only">Taxonomy name</label>
            <input id="tax-label" className={`${inputClass} max-w-xs`} placeholder="e.g. Industry" value={label} onChange={(e) => setLabel(e.target.value)} />
            <label htmlFor="tax-kind" className="sr-only">Kind</label>
            <select id="tax-kind" className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm" value={hierarchical ? "cat" : "tag"} onChange={(e) => setHierarchical(e.target.value === "cat")}>
              <option value="cat">Categories (nested)</option>
              <option value="tag">Tags (flat)</option>
            </select>
            <Button type="submit" disabled={pending || !label.trim()} data-add-taxonomy="">Add</Button>
          </div>
          {others.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-zinc-500">Or reuse:</span>
              {others.map((x) => (
                <Button key={x.id} size="sm" onClick={() => act(() => saveTaxonomyAction({ siteId, id: x.id, label: x.label, hierarchical: x.hierarchical, postTypeIds: [...x.postTypeIds, postTypeId] }))}>
                  {x.label}
                </Button>
              ))}
            </div>
          )}
        </form>
      </div>
    </Card>
  );
}

function TaxonomyCard({
  tax,
  terms,
  pending,
  onSaveTerm,
  onDeleteTerm,
  onDetach,
  onDelete,
}: {
  tax: Taxonomy;
  terms: Term[];
  pending: boolean;
  onSaveTerm: (input: { id?: string; name: string; parentId?: string | null }) => void;
  onDeleteTerm: (id: string) => void;
  onDetach: () => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const ordered: (Term & { depth: number })[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const t of terms.filter((x) => x.parentId === parent)) {
      ordered.push({ ...t, depth });
      walk(t.id, depth + 1);
    }
  };
  walk(null, 0);

  return (
    <section className="rounded-lg border border-zinc-200" data-taxonomy-card={tax.key}>
      <header className="flex items-center justify-between border-b border-zinc-100 px-4 py-2.5">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900">{tax.label}</h3>
          <p className="text-xs text-zinc-500">
            {tax.hierarchical ? "Categories" : "Tags"} · <span className="font-mono">{tax.key}</span>
            {tax.postTypeIds.length > 1 && ` · shared with ${tax.postTypeIds.length - 1} other type${tax.postTypeIds.length > 2 ? "s" : ""}`}
          </p>
        </div>
        <div className="flex gap-1">
          {tax.postTypeIds.length > 1 && <Button size="sm" tone="ghost" onClick={onDetach}>Detach</Button>}
          <Button size="sm" tone="ghost" className="text-red-700" onClick={onDelete}>Delete</Button>
        </div>
      </header>
      <ul className="divide-y divide-zinc-50 px-4 py-1">
        {ordered.map((t) => (
          <li key={t.id} className="flex items-center justify-between gap-2 py-1.5 text-sm" style={{ paddingLeft: t.depth * 18 }}>
            {editing?.id === t.id ? (
              <form
                className="flex flex-1 gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  onSaveTerm({ id: t.id, name: editing.name, parentId: t.parentId });
                  setEditing(null);
                }}
              >
                <label htmlFor={`term-${t.id}`} className="sr-only">Rename {t.name}</label>
                <input id={`term-${t.id}`} autoFocus className={`${inputClass} py-1`} value={editing.name} onChange={(e) => setEditing({ id: t.id, name: e.target.value })} />
                <Button size="sm" type="submit">Save</Button>
                <Button size="sm" tone="ghost" onClick={() => setEditing(null)}>Cancel</Button>
              </form>
            ) : (
              <>
                <span>
                  {t.name} <span className="font-mono text-xs text-zinc-400">{t.slug}</span>
                </span>
                <span className="flex gap-1">
                  <Button size="sm" tone="ghost" onClick={() => setEditing({ id: t.id, name: t.name })}>Rename<span className="sr-only"> {t.name}</span></Button>
                  <Button size="sm" tone="ghost" className="text-red-700" onClick={() => onDeleteTerm(t.id)}>Delete<span className="sr-only"> {t.name}</span></Button>
                </span>
              </>
            )}
          </li>
        ))}
        {!ordered.length && <li className="py-2 text-sm text-zinc-500">No terms yet.</li>}
      </ul>
      <form
        className="flex flex-wrap gap-2 border-t border-zinc-100 px-4 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          onSaveTerm({ name, parentId: parentId || null });
          setName("");
        }}
      >
        <label htmlFor={`new-term-${tax.id}`} className="sr-only">New {tax.hierarchical ? "category" : "tag"} in {tax.label}</label>
        <input id={`new-term-${tax.id}`} className={`${inputClass} max-w-[14rem] py-1.5`} placeholder={tax.hierarchical ? "New category" : "New tag"} value={name} onChange={(e) => setName(e.target.value)} data-new-term={tax.key} />
        {tax.hierarchical && ordered.length > 0 && (
          <>
            <label htmlFor={`parent-${tax.id}`} className="sr-only">Parent</label>
            <select id={`parent-${tax.id}`} className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm" value={parentId} onChange={(e) => setParentId(e.target.value)}>
              <option value="">No parent</option>
              {ordered.map((t) => (
                <option key={t.id} value={t.id}>
                  {"— ".repeat(t.depth)}
                  {t.name}
                </option>
              ))}
            </select>
          </>
        )}
        <Button size="sm" type="submit" disabled={pending || !name.trim()} data-add-term={tax.key}>Add</Button>
      </form>
    </section>
  );
}
