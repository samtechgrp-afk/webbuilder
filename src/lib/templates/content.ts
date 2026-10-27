import type { FieldConfig } from "@/lib/cms/fields";
import { minorDigits } from "@/lib/commerce/money";
import { variantCombos, type ProductOption, type VariantAttributes } from "@/lib/commerce/variants";
import type { Blueprint, EntryFieldValue, FieldSpec, ProductSpec } from "./types";

/** Conversions from blueprint values to the shapes the database stores, shared by the seeder and the preview. */

export const blueprintCurrency = (bp: Blueprint) => bp.store?.currency ?? "USD";

export const toMinor = (major: number, currency: string) => Math.round(major * 10 ** minorDigits(currency));

export function fieldConfig(f: FieldSpec, currency: string): FieldConfig {
  if (f.type === "PRICE") return { currency };
  if (f.type === "SELECT") return { choices: (f.options ?? []).map((o) => ({ value: o, label: o })) };
  return {};
}

/** A stored field value. IMAGE values need the asset id the image key became. */
export function storedFieldValue(f: FieldSpec, value: EntryFieldValue, currency: string, imageId: (key: string) => string): unknown {
  switch (f.type) {
    case "PRICE":
      return { amount: Number(value), currency };
    case "IMAGE":
      return imageId(String(value));
    case "NUMBER":
      return Number(value);
    case "BOOLEAN":
      return Boolean(value);
    default:
      return String(value);
  }
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Entry body paragraphs as the sanitised HTML the CMS stores. */
export const bodyHtml = (paragraphs: string[], siteName: string) => paragraphs.map((p) => `<p>${escapeHtml(p.replaceAll("{{site}}", siteName))}</p>`).join("");

export interface VariantRow {
  title: string;
  attributes: VariantAttributes;
  /** Null when the variant sells at the product price. */
  price: number | null;
  sku: string;
  inventory: number;
  position: number;
}

/** One variant per option combination, priced by `valuePrices` when one of its values has a price. */
export function variantRows(p: ProductSpec, currency: string): VariantRow[] {
  const options: ProductOption[] = p.options ?? [];
  if (!options.length) return [];
  return variantCombos(options).map((combo, i) => {
    const priced = Object.values(combo.attributes).find((v) => p.valuePrices?.[v] !== undefined);
    return {
      title: combo.title,
      attributes: combo.attributes,
      price: priced ? toMinor(p.valuePrices![priced], currency) : null,
      sku: `${p.sku}-${Object.values(combo.attributes).map((v) => v.replace(/[^A-Za-z0-9]/g, "").slice(0, 4).toUpperCase()).join("-")}`,
      inventory: p.inventory,
      position: i,
    };
  });
}
