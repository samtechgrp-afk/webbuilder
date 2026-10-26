import { z } from "zod";

/** One variant dimension, e.g. { name: "Size", values: ["S", "M", "L"] }. */
export interface ProductOption {
  name: string;
  values: string[];
}

export type VariantAttributes = Record<string, string>;

export const MAX_OPTIONS = 3;
export const MAX_OPTION_VALUES = 20;
export const MAX_VARIANTS = 100;

const label = z.string().trim().min(1).max(40).regex(/^[^\u0000-\u001f]+$/);

export const optionsSchema = z
  .array(z.object({ name: label, values: z.array(label).min(1).max(MAX_OPTION_VALUES) }))
  .max(MAX_OPTIONS)
  .superRefine((opts, ctx) => {
    const names = opts.map((o) => o.name.toLowerCase());
    if (new Set(names).size !== names.length) ctx.addIssue({ code: "custom", message: "Each option needs a different name" });
    for (const o of opts) {
      const values = o.values.map((v) => v.toLowerCase());
      if (new Set(values).size !== values.length) ctx.addIssue({ code: "custom", message: `"${o.name}" lists the same value twice` });
    }
    if (opts.reduce((n, o) => n * o.values.length, 1) > MAX_VARIANTS) ctx.addIssue({ code: "custom", message: `That makes more than ${MAX_VARIANTS} variants` });
  });

export function readOptions(value: unknown): ProductOption[] {
  const parsed = optionsSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

/** Every combination of the options' values, in option order ("Red / S", "Red / M", …). */
export function variantCombos(options: ProductOption[]): { title: string; attributes: VariantAttributes }[] {
  if (!options.length) return [];
  let combos: VariantAttributes[] = [{}];
  for (const o of options) combos = combos.flatMap((c) => o.values.map((v) => ({ ...c, [o.name]: v })));
  return combos.map((attributes) => ({ title: variantTitle(options, attributes), attributes }));
}

export const variantTitle = (options: ProductOption[], attributes: VariantAttributes) => options.map((o) => attributes[o.name] ?? "").join(" / ");

/** Stable key for matching a combination regardless of property order. */
export const attributesKey = (options: ProductOption[], attributes: VariantAttributes) => JSON.stringify(options.map((o) => attributes[o.name] ?? null));

/** The variant whose attributes equal the selection (every option chosen), if any. */
export function matchVariant<V extends { attributes: unknown }>(variants: V[], options: ProductOption[], selection: VariantAttributes): V | undefined {
  if (options.some((o) => !selection[o.name])) return undefined;
  const key = attributesKey(options, selection);
  return variants.find((v) => attributesKey(options, (v.attributes ?? {}) as VariantAttributes) === key);
}
