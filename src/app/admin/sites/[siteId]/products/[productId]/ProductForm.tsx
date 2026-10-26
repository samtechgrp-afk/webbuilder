"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AssetThumb, MediaPickerDialog, type LibraryAsset } from "@/components/cms/MediaField";
import { Button, Card, Field, Notice, StatusBadge, Toggle, inputClass } from "@/components/cms/ui";
import { slugify } from "@/lib/cms/slug";
import { moneyInput, parseMoney } from "@/lib/commerce/money";
import { attributesKey, variantCombos, MAX_OPTIONS, MAX_VARIANTS, type ProductOption, type VariantAttributes } from "@/lib/commerce/variants";
import { deleteProductAction, saveProductAction } from "@/server/commerce-actions";

interface VariantRow {
  id?: string;
  attributes: VariantAttributes;
  price: string;
  sku: string;
  inventory: number;
}

export interface ProductFormInitial {
  id: string;
  updatedAt: string;
  title: string;
  slug: string;
  description: string;
  images: string[];
  price: number;
  compareAtPrice: number | null;
  sku: string | null;
  inventory: number;
  trackInventory: boolean;
  isPhysical: boolean;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  options: ProductOption[];
  variants: { id: string; attributes: VariantAttributes; price: number | null; sku: string | null; inventory: number }[];
}

type OptionDraft = { name: string; values: string };

const splitValues = (s: string) => [...new Set(s.split(",").map((v) => v.trim()).filter(Boolean))];

export function ProductForm({ siteId, liveBase, currency, sold, assets: initialAssets, canUpload, initial }: { siteId: string; liveBase: string; currency: string; sold: number; assets: LibraryAsset[]; canUpload: boolean; initial: ProductFormInitial }) {
  const router = useRouter();
  const [updatedAt, setUpdatedAt] = useState(initial.updatedAt);
  const [title, setTitle] = useState(initial.title);
  const [slug, setSlug] = useState(initial.slug);
  const [savedSlug, setSavedSlug] = useState(initial.slug);
  const [description, setDescription] = useState(initial.description);
  const [images, setImages] = useState(initial.images);
  const [assets, setAssets] = useState(initialAssets);
  const [picker, setPicker] = useState(false);
  const [price, setPrice] = useState(moneyInput(initial.price, currency));
  const [compareAt, setCompareAt] = useState(moneyInput(initial.compareAtPrice, currency));
  const [sku, setSku] = useState(initial.sku ?? "");
  const [inventory, setInventory] = useState(initial.inventory);
  const [trackInventory, setTrackInventory] = useState(initial.trackInventory);
  const [isPhysical, setIsPhysical] = useState(initial.isPhysical);
  const [status, setStatus] = useState(initial.status);
  const [savedStatus, setSavedStatus] = useState(initial.status);
  const [options, setOptions] = useState<OptionDraft[]>(initial.options.map((o) => ({ name: o.name, values: o.values.join(", ") })));
  const [variants, setVariants] = useState<VariantRow[]>(
    initial.variants.map((v) => ({ id: v.id, attributes: v.attributes, price: moneyInput(v.price, currency), sku: v.sku ?? "", inventory: v.inventory })),
  );
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();

  const parsedOptions: ProductOption[] = options.map((o) => ({ name: o.name.trim(), values: splitValues(o.values) })).filter((o) => o.name && o.values.length);
  const combos = variantCombos(parsedOptions);
  const tooMany = combos.length > MAX_VARIANTS;
  // Variant rows follow the options: one per combination, keeping what was typed for combinations that still exist.
  const rows: VariantRow[] = tooMany
    ? []
    : combos.map((c) => variants.find((v) => attributesKey(parsedOptions, v.attributes) === attributesKey(parsedOptions, c.attributes)) ?? { attributes: c.attributes, price: "", sku: "", inventory: 0 });
  const setRow = (key: string, patch: Partial<VariantRow>) => {
    const existing = rows.find((r) => attributesKey(parsedOptions, r.attributes) === key)!;
    setVariants([...variants.filter((v) => attributesKey(parsedOptions, v.attributes) !== key), { ...existing, ...patch }]);
  };
  const hasVariants = rows.length > 0;

  function save() {
    setNotice(null);
    const p = parseMoney(price, currency);
    if (p === null) return setNotice({ tone: "error", text: "Enter a price, like 24.00" });
    const cmp = compareAt.trim() ? parseMoney(compareAt, currency) : null;
    if (compareAt.trim() && cmp === null) return setNotice({ tone: "error", text: "The compare-at price isn't a valid amount" });
    const variantInput: { id?: string; attributes: VariantAttributes; price: number | null; sku: string | null; inventory: number }[] = [];
    for (const r of rows) {
      const vp = r.price.trim() ? parseMoney(r.price, currency) : null;
      if (r.price.trim() && vp === null) return setNotice({ tone: "error", text: `The price for ${Object.values(r.attributes).join(" / ")} isn't a valid amount` });
      variantInput.push({ ...(r.id ? { id: r.id } : {}), attributes: r.attributes, price: vp, sku: r.sku || null, inventory: r.inventory });
    }
    start(async () => {
      const res = await saveProductAction({
        siteId,
        product: {
          id: initial.id,
          baseUpdatedAt: updatedAt,
          title,
          slug,
          description,
          images,
          price: p,
          compareAtPrice: cmp,
          sku: sku || null,
          inventory,
          trackInventory,
          isPhysical,
          status,
          options: parsedOptions,
          variants: variantInput,
        },
      });
      if (!res.ok) return setNotice({ tone: "error", text: res.error });
      setUpdatedAt(res.updatedAt);
      setSlug(res.slug);
      setSavedSlug(res.slug);
      setSavedStatus(status);
      setNotice({ tone: "success", text: status === "ACTIVE" ? "Saved. It's live in the shop." : "Saved." });
      router.refresh();
    });
  }

  return (
    <div className="space-y-5" data-product-form="">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-zinc-900">{title || "Untitled product"}</h1>
          <StatusBadge status={savedStatus} />
        </div>
        <div className="flex gap-2">
          {savedStatus === "ACTIVE" && (
            <a href={`${liveBase}/products/${savedSlug}`} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50">
              View in shop ↗
            </a>
          )}
          <Button tone="primary" onClick={save} disabled={pending} data-save-product="">
            {pending ? "Saving…" : "Save product"}
          </Button>
        </div>
      </div>
      {notice && (
        <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>
          <span data-product-notice="">{notice.text}</span>
        </Notice>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-5">
          <Card title="Details">
            <div className="space-y-4">
              <Field label="Name" required>
                {(p) => <input {...p} name="title" className={inputClass} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />}
              </Field>
              <Field label="Description" hint="Plain text. A blank line starts a new paragraph.">
                {(p) => <textarea {...p} name="description" rows={6} className={inputClass} value={description} maxLength={5000} onChange={(e) => setDescription(e.target.value)} />}
              </Field>
              <Field label="Address" hint={`${liveBase}/products/${slugify(slug) || "…"}`}>
                {(p) => <input {...p} name="slug" className={inputClass} value={slug} maxLength={80} onChange={(e) => setSlug(e.target.value)} onBlur={() => setSlug(slugify(slug) || slugify(title))} />}
              </Field>
            </div>
          </Card>

          <Card title="Photos" actions={<Button size="sm" onClick={() => setPicker(true)} data-pick-images="">{images.length ? "Change photos" : "Add photos"}</Button>}>
            {images.length === 0 ? (
              <p className="text-sm text-zinc-500">No photos yet. The first photo is the cover in grids and the cart.</p>
            ) : (
              <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5" data-product-images="">
                {images.map((id, i) => {
                  const asset = assets.find((a) => a.id === id);
                  return (
                    <li key={id} className="group relative overflow-hidden rounded-lg border border-zinc-200">
                      {asset ? <AssetThumb asset={asset} className="aspect-square w-full" /> : <div className="aspect-square bg-zinc-100" />}
                      {i === 0 && <span className="absolute left-1.5 top-1.5 rounded bg-zinc-900/80 px-1.5 py-0.5 text-[10px] font-medium text-white">Cover</span>}
                      <div className="absolute inset-x-1 bottom-1 flex justify-between opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
                        <button type="button" className="rounded bg-white/90 px-1.5 text-xs disabled:opacity-40" aria-label="Move earlier" disabled={i === 0} onClick={() => setImages(images.map((x, j) => (j === i - 1 ? id : j === i ? images[i - 1] : x)))}>
                          ←
                        </button>
                        <button type="button" className="rounded bg-white/90 px-1.5 text-xs text-red-700" aria-label="Remove photo" onClick={() => setImages(images.filter((x) => x !== id))}>
                          ✕
                        </button>
                        <button type="button" className="rounded bg-white/90 px-1.5 text-xs disabled:opacity-40" aria-label="Move later" disabled={i === images.length - 1} onClick={() => setImages(images.map((x, j) => (j === i + 1 ? id : j === i ? images[i + 1] : x)))}>
                          →
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card title="Pricing">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={`Price (${currency})`} required hint={hasVariants ? "Variants without their own price use this." : undefined}>
                {(p) => <input {...p} name="price" inputMode="decimal" className={inputClass} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" />}
              </Field>
              <Field label={`Compare-at price (${currency})`} hint="Shown struck through, for sales. Leave empty otherwise.">
                {(p) => <input {...p} name="compareAtPrice" inputMode="decimal" className={inputClass} value={compareAt} onChange={(e) => setCompareAt(e.target.value)} placeholder="Optional" />}
              </Field>
            </div>
          </Card>

          <Card title="Inventory">
            <div className="space-y-4">
              <label className="flex items-center justify-between gap-3 text-sm text-zinc-800">
                <span>
                  Track stock
                  <span className="block text-xs text-zinc-500">Sold-out products can&apos;t be added to carts, and paid orders count stock down.</span>
                </span>
                <Toggle checked={trackInventory} onChange={setTrackInventory} label="Track stock" id="track-inventory" />
              </label>
              <label className="flex items-center justify-between gap-3 text-sm text-zinc-800">
                <span>
                  Physical product
                  <span className="block text-xs text-zinc-500">Checkout asks for a shipping address.</span>
                </span>
                <Toggle checked={isPhysical} onChange={setIsPhysical} label="Physical product" id="is-physical" />
              </label>
              {!hasVariants && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="SKU">
                    {(p) => <input {...p} name="sku" className={inputClass} value={sku} maxLength={64} onChange={(e) => setSku(e.target.value)} />}
                  </Field>
                  {trackInventory && (
                    <Field label="In stock">
                      {(p) => <input {...p} name="inventory" type="number" className={inputClass} value={inventory} onChange={(e) => setInventory(Math.trunc(Number(e.target.value) || 0))} />}
                    </Field>
                  )}
                </div>
              )}
            </div>
          </Card>

          <Card title="Variants" actions={options.length < MAX_OPTIONS ? <Button size="sm" onClick={() => setOptions([...options, { name: "", values: "" }])} data-add-option="">Add option</Button> : null}>
            <div className="space-y-4">
              {options.length === 0 && <p className="text-sm text-zinc-500">Add options like Size or Color when the product comes in versions. Each combination gets its own price, SKU and stock.</p>}
              {options.map((o, i) => (
                <div key={i} className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)_auto] sm:items-end" data-option-row={i}>
                  <Field label="Option">
                    {(p) => <input {...p} className={inputClass} value={o.name} maxLength={40} placeholder="Size" onChange={(e) => setOptions(options.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} data-option-name="" />}
                  </Field>
                  <Field label="Values, separated by commas">
                    {(p) => <input {...p} className={inputClass} value={o.values} placeholder="Small, Medium, Large" onChange={(e) => setOptions(options.map((x, j) => (j === i ? { ...x, values: e.target.value } : x)))} data-option-values="" />}
                  </Field>
                  <Button tone="ghost" onClick={() => setOptions(options.filter((_, j) => j !== i))} aria-label={`Remove option ${o.name || i + 1}`}>
                    Remove
                  </Button>
                </div>
              ))}
              {tooMany && <p className="text-sm text-red-700">That makes more than {MAX_VARIANTS} combinations. Use fewer values.</p>}
              {hasVariants && (
                <div className="overflow-x-auto rounded-lg border border-zinc-200">
                  <table className="w-full text-sm" data-variants-table="">
                    <thead className="bg-zinc-50 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                      <tr>
                        <th className="px-3 py-2">Variant</th>
                        <th className="px-3 py-2">Price</th>
                        <th className="px-3 py-2">SKU</th>
                        {trackInventory && <th className="px-3 py-2">In stock</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {rows.map((r) => {
                        const key = attributesKey(parsedOptions, r.attributes);
                        const label = parsedOptions.map((o) => r.attributes[o.name]).join(" / ");
                        return (
                          <tr key={key} data-variant-row={label}>
                            <td className="px-3 py-1.5 font-medium text-zinc-800">{label}</td>
                            <td className="px-3 py-1.5">
                              <input aria-label={`Price for ${label}`} inputMode="decimal" className={inputClass} value={r.price} placeholder={price || "0.00"} onChange={(e) => setRow(key, { price: e.target.value })} data-variant-price="" />
                            </td>
                            <td className="px-3 py-1.5">
                              <input aria-label={`SKU for ${label}`} className={inputClass} value={r.sku} maxLength={64} onChange={(e) => setRow(key, { sku: e.target.value })} />
                            </td>
                            {trackInventory && (
                              <td className="px-3 py-1.5">
                                <input aria-label={`Stock for ${label}`} type="number" className={`${inputClass} w-24`} value={r.inventory} onChange={(e) => setRow(key, { inventory: Math.trunc(Number(e.target.value) || 0) })} data-variant-stock="" />
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </Card>
        </div>

        <aside className="space-y-5">
          <Card title="Visibility">
            <fieldset className="space-y-2 text-sm" aria-label="Status">
              {(
                [
                  ["ACTIVE", "Active", "Shown in the shop and can be bought"],
                  ["DRAFT", "Draft", "Hidden while you work on it"],
                  ["ARCHIVED", "Archived", "Hidden; kept for past orders"],
                ] as const
              ).map(([value, label, hint]) => (
                <label key={value} className="flex items-start gap-2">
                  <input type="radio" name="status" value={value} checked={status === value} onChange={() => setStatus(value)} className="mt-1" />
                  <span>
                    <span className="font-medium text-zinc-900">{label}</span>
                    <span className="block text-xs text-zinc-500">{hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          </Card>
          <Card title="Sales">
            <p className="text-sm text-zinc-700">{sold ? `${sold} sold in paid orders.` : "Not sold yet."}</p>
          </Card>
          <Card title="Delete">
            <p className="mb-3 text-xs text-zinc-500">Past orders keep their own copy of the name and price. To hide a product but keep it, archive it instead.</p>
            <Button
              tone="danger"
              disabled={pending}
              onClick={() => {
                if (!window.confirm(`Delete “${title}”? This can't be undone.`)) return;
                start(async () => {
                  const res = await deleteProductAction({ siteId, id: initial.id });
                  if (!res.ok) return setNotice({ tone: "error", text: res.error });
                  router.push(`/admin/sites/${siteId}/products`);
                });
              }}
            >
              Delete product
            </Button>
          </Card>
        </aside>
      </div>

      <MediaPickerDialog
        open={picker}
        siteId={siteId}
        assets={assets}
        kind="image"
        multiple
        initial={images}
        canUpload={canUpload}
        onClose={() => setPicker(false)}
        onDone={(ids) => {
          setImages(ids.slice(0, 20));
          setPicker(false);
        }}
        onUploaded={(a) => setAssets([a, ...assets])}
      />
    </div>
  );
}
