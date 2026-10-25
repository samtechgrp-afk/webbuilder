import { z } from "zod";
import type { ContentField } from "./widgets";

/** Links may be site-relative, anchors, http(s), mailto or tel. Never `javascript:` and friends. */
export function isSafeHref(href: string) {
  if (/^(\/(?!\/)|#)/.test(href)) return true;
  try {
    const url = new URL(href);
    return ["http:", "https:", "mailto:", "tel:"].includes(url.protocol);
  } catch {
    return false;
  }
}

const plainText = (max: number) =>
  z
    .string()
    .max(max)
    // Content is stored as plain text and rendered as React text nodes; strip
    // control characters so nothing odd reaches the page or the export engine.
    .transform((s) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ""));

const imageSchema = z.object({
  assetId: z.string().min(1).nullable(),
  src: z.string(),
  alt: plainText(300),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

const linkSchema = z.object({
  label: plainText(80),
  href: z.string().max(2048).refine(isSafeHref, "Links must start with /, #, https://, mailto: or tel:"),
  newTab: z.boolean().optional(),
});

const priceSchema = z.object({
  amount: z.number().nonnegative().max(1_000_000_000),
  currency: z.string().length(3),
  compareAt: z.number().nonnegative().nullable().optional(),
});

export function contentSchema(field: ContentField) {
  switch (field.kind) {
    case "text":
    case "multiline":
      return plainText(field.maxLength ?? 4000);
    case "image":
      return imageSchema;
    case "link":
      return linkSchema;
    case "price":
      return priceSchema;
  }
}

export function formatPrice(amount: number, currency: string, locale = "en-US") {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount);
}
