import { z } from "zod";
import { ICON_NAMES } from "./icons";
import { parseAudioUrl, parseVideoUrl } from "./media";
import type { ContentField, ItemField } from "./widgets";

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

/** An optional button (a call to action's second button, a slide's link): empty means "no button". */
const optionalLinkSchema = linkSchema.or(z.object({ label: plainText(80), href: z.literal(""), newTab: z.boolean().optional() }));

const priceSchema = z.object({
  amount: z.number().nonnegative().max(1_000_000_000),
  currency: z.string().length(3),
  compareAt: z.number().nonnegative().nullable().optional(),
});

const videoSchema = z
  .object({ assetId: z.string().min(1).max(40).nullable(), src: z.string().max(2048) })
  .refine((v) => v.assetId !== null || v.src === "" || parseVideoUrl(v.src) !== null, "Use a video from the media library, or a YouTube, Vimeo or https .mp4 address");

const audioSchema = z
  .object({ assetId: z.string().min(1).max(40).nullable(), src: z.string().max(2048) })
  .refine((v) => v.assetId !== null || v.src === "" || parseAudioUrl(v.src) !== null, "Use audio from the media library, or an https .mp3, .m4a, .ogg or .wav address");

const iconSchema = z.string().refine((v) => v === "" || ICON_NAMES.has(v), "Pick an icon from the list");

const numberSchema = (min = -1e9, max = 1e9) => z.number().finite().min(min).max(max);

function itemFieldSchema(f: ItemField) {
  switch (f.kind) {
    case "text":
    case "multiline":
      return plainText(f.maxLength ?? 1000);
    case "link":
      return optionalLinkSchema;
    case "image":
      return imageSchema;
    case "number":
      return numberSchema(f.min, f.max);
    case "icon":
      return iconSchema;
    case "toggle":
      return z.boolean();
    case "lines":
      return z.array(plainText(f.maxLength ?? 200)).max(30);
    case "choice":
      return z.enum((f.options ?? []).map((o) => o.value) as [string, ...string[]]);
  }
}

/** Local date and time as typed in a datetime-local input; empty means "not set". */
export const DATETIME_RE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})?$/;

export function contentSchema(field: ContentField) {
  switch (field.kind) {
    case "text":
    case "multiline":
      return plainText(field.maxLength ?? 4000);
    case "image":
      return imageSchema;
    case "link":
      return field.optionalLink ? optionalLinkSchema : linkSchema;
    case "price":
      return priceSchema;
    case "gallery":
      return z.array(imageSchema.extend({ assetId: z.string().min(1) })).max(30);
    case "html":
      // Sanitised to the rich text allowlist on the server after this check (content-service).
      return z.string().max(field.maxLength ?? 20000);
    case "video":
      return videoSchema;
    case "audio":
      return audioSchema;
    case "icon":
      return iconSchema;
    case "number":
      return numberSchema(field.min, field.max);
    case "datetime":
      return z.string().regex(DATETIME_RE, "Use a date and time");
    case "items": {
      // Every field optional: records saved before a field existed stay valid. Unknown keys are dropped.
      const shape = Object.fromEntries((field.itemFields ?? []).map((f) => [f.key, itemFieldSchema(f).optional()]));
      return z.array(z.object(shape)).min(field.minItems ?? 0).max(field.maxItems ?? 50);
    }
  }
}

export function formatPrice(amount: number, currency: string, locale = "en-US") {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount);
}
