import { z } from "zod";

/**
 * The ACF-style field engine, shared by the field group builder, the entry
 * forms and the server. One definition shape describes top-level fields and
 * the sub-fields inside repeaters and flexible content layouts, so the same
 * validator walks any depth.
 *
 * Mirrors the Prisma `FieldType` enum. Kept as a plain union so client
 * components don't import @prisma/client.
 */
export const FIELD_TYPES = [
  "TEXT", "TEXTAREA", "RICH_TEXT", "URL",
  "IMAGE", "GALLERY", "VIDEO_URL", "FILE",
  "SELECT", "RADIO", "CHECKBOX", "BOOLEAN",
  "RELATION", "USER", "TAXONOMY",
  "REPEATER", "FLEXIBLE",
  "NUMBER", "PRICE", "DATE", "EMAIL", "COLOR",
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

/** What a field's value can feed on the canvas (see src/lib/cms/binding.ts). */
export type BindKind = "text" | "url" | "image" | "gallery" | "price" | "html";

export const FIELD_GROUPS = ["Text", "Media", "Choice", "Relational", "Complex", "Other"] as const;

export const FIELD_TYPE_INFO: Record<FieldType, { label: string; group: (typeof FIELD_GROUPS)[number]; hint: string; bind: BindKind[] }> = {
  TEXT: { label: "Short text", group: "Text", hint: "One line, such as a name or a client", bind: ["text"] },
  TEXTAREA: { label: "Textarea", group: "Text", hint: "Several lines of plain text", bind: ["text"] },
  RICH_TEXT: { label: "Rich text", group: "Text", hint: "Formatted text with headings, lists and links", bind: ["html", "text"] },
  URL: { label: "URL", group: "Text", hint: "A web address", bind: ["url", "text"] },
  IMAGE: { label: "Image", group: "Media", hint: "One picture from the media library", bind: ["image"] },
  GALLERY: { label: "Gallery", group: "Media", hint: "Several pictures, in order", bind: ["gallery", "image"] },
  VIDEO_URL: { label: "Video URL", group: "Media", hint: "YouTube, Vimeo or a direct video link", bind: ["url", "text"] },
  FILE: { label: "File", group: "Media", hint: "A PDF, document or video from the library", bind: ["url"] },
  SELECT: { label: "Select", group: "Choice", hint: "Pick from a dropdown", bind: ["text"] },
  RADIO: { label: "Radio buttons", group: "Choice", hint: "Pick exactly one", bind: ["text"] },
  CHECKBOX: { label: "Checkboxes", group: "Choice", hint: "Pick any number", bind: ["text"] },
  BOOLEAN: { label: "Toggle switch", group: "Choice", hint: "On or off", bind: ["text"] },
  RELATION: { label: "Post object", group: "Relational", hint: "Link to another entry", bind: ["text", "url"] },
  USER: { label: "User", group: "Relational", hint: "A person on this site", bind: ["text"] },
  TAXONOMY: { label: "Taxonomy terms", group: "Relational", hint: "Categories or tags", bind: ["text"] },
  REPEATER: { label: "Repeater", group: "Complex", hint: "Rows of sub-fields, such as pricing rows", bind: [] },
  FLEXIBLE: { label: "Flexible content", group: "Complex", hint: "Stack of blocks, each with its own fields", bind: [] },
  NUMBER: { label: "Number", group: "Other", hint: "A number, such as a rating", bind: ["text"] },
  PRICE: { label: "Price", group: "Other", hint: "Amount and currency", bind: ["price", "text"] },
  DATE: { label: "Date", group: "Other", hint: "A calendar date", bind: ["text"] },
  EMAIL: { label: "Email", group: "Other", hint: "An email address", bind: ["text", "url"] },
  COLOR: { label: "Colour", group: "Other", hint: "A hex colour", bind: ["text"] },
};

export interface Choice {
  value: string;
  label: string;
}

export interface FlexibleLayout {
  key: string;
  label: string;
  subFields: FieldDef[];
}

export interface FieldConfig {
  placeholder?: string;
  maxLength?: number;
  min?: number;
  max?: number;
  step?: number;
  currency?: string;
  choices?: Choice[];
  multiple?: boolean;
  /** RELATION: which post types can be picked. Empty means any. */
  postTypeIds?: string[];
  /** TAXONOMY: which taxonomy the terms come from. */
  taxonomyId?: string;
  subFields?: FieldDef[];
  layouts?: FlexibleLayout[];
  minRows?: number;
  maxRows?: number;
  /** FILE: which kinds of file are accepted. */
  accept?: "any" | "document" | "video";
}

export interface FieldDef {
  /** Stable row id for top-level fields (CustomField.id); absent on sub-fields and new fields. */
  id?: string;
  key: string;
  label: string;
  type: FieldType;
  instructions?: string | null;
  required?: boolean;
  /** Top-level only. Off means only designers can change the value. */
  clientEditable?: boolean;
  config: FieldConfig;
}

/** Values of a post's fields, by field key. */
export type FieldValues = Record<string, unknown>;

export interface RepeaterRow {
  [subKey: string]: unknown;
}

export interface FlexibleBlock {
  layout: string;
  values: Record<string, unknown>;
}

export const MAX_FIELD_DEPTH = 3;

// ─────────────────────────────────────────────────────────────────────────────
// Definition validation (field group builder → server)
// ─────────────────────────────────────────────────────────────────────────────

export const FIELD_KEY_RE = /^[a-z][a-z0-9_]{0,39}$/;
const keySchema = z.string().regex(FIELD_KEY_RE, "Keys use lowercase letters, numbers and underscores, starting with a letter");
const labelSchema = z.string().trim().min(1, "Every field needs a label").max(80);
const cuidLike = z.string().min(1).max(40);

const choiceSchema = z.object({ value: z.string().trim().min(1).max(80), label: z.string().trim().min(1).max(120) });

const configSchema: z.ZodType<FieldConfig> = z.lazy(() =>
  z
    .object({
      placeholder: z.string().max(120).optional(),
      maxLength: z.number().int().positive().max(100_000).optional(),
      min: z.number().optional(),
      max: z.number().optional(),
      step: z.number().positive().optional(),
      currency: z.string().regex(/^[A-Z]{3}$/).optional(),
      choices: z.array(choiceSchema).max(100).optional(),
      multiple: z.boolean().optional(),
      postTypeIds: z.array(cuidLike).max(20).optional(),
      taxonomyId: cuidLike.optional(),
      subFields: z.array(fieldDefSchema).max(40).optional(),
      layouts: z
        .array(z.object({ key: keySchema, label: labelSchema, subFields: z.array(fieldDefSchema).max(40) }))
        .max(20)
        .optional(),
      minRows: z.number().int().nonnegative().max(500).optional(),
      maxRows: z.number().int().positive().max(500).optional(),
      accept: z.enum(["any", "document", "video"]).optional(),
    })
    .strip(),
);

export const fieldDefSchema: z.ZodType<FieldDef> = z.lazy(() =>
  z.object({
    id: cuidLike.optional(),
    key: keySchema,
    label: labelSchema,
    type: z.enum(FIELD_TYPES),
    instructions: z.string().max(500).nullish(),
    required: z.boolean().optional(),
    clientEditable: z.boolean().optional(),
    config: configSchema,
  }),
);

/**
 * Checks a list of definitions beyond their shape: unique keys per level,
 * the config each type needs, and nesting depth. Returns the first problem.
 */
export function definitionProblem(defs: FieldDef[], depth = 1, path = ""): string | null {
  if (depth > MAX_FIELD_DEPTH) return `${path || "Fields"} nest too deeply (max ${MAX_FIELD_DEPTH} levels)`;
  const seen = new Set<string>();
  for (const def of defs) {
    const where = path ? `${path} → ${def.label}` : def.label;
    if (seen.has(def.key)) return `Two fields use the key "${def.key}"${path ? ` inside ${path}` : ""}`;
    seen.add(def.key);
    const c = def.config;
    if ((def.type === "SELECT" || def.type === "RADIO" || def.type === "CHECKBOX") && !c.choices?.length) {
      return `${where} needs at least one choice`;
    }
    if (c.choices && new Set(c.choices.map((x) => x.value)).size !== c.choices.length) return `${where} has duplicate choice values`;
    if (def.type === "TAXONOMY" && !c.taxonomyId) return `${where} needs a taxonomy`;
    if (c.min !== undefined && c.max !== undefined && c.min > c.max) return `${where}: minimum is above maximum`;
    if (c.minRows !== undefined && c.maxRows !== undefined && c.minRows > c.maxRows) return `${where}: minimum rows is above maximum`;
    if (def.type === "REPEATER") {
      if (!c.subFields?.length) return `${where} needs at least one sub-field`;
      const inner = definitionProblem(c.subFields, depth + 1, where);
      if (inner) return inner;
    }
    if (def.type === "FLEXIBLE") {
      if (!c.layouts?.length) return `${where} needs at least one layout`;
      if (new Set(c.layouts.map((l) => l.key)).size !== c.layouts.length) return `${where} has two layouts with the same key`;
      for (const layout of c.layouts) {
        if (!layout.subFields.length) return `${where} → ${layout.label} needs at least one field`;
        const inner = definitionProblem(layout.subFields, depth + 1, `${where} → ${layout.label}`);
        if (inner) return inner;
      }
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Value validation (entry form → server)
// ─────────────────────────────────────────────────────────────────────────────

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const text = (max: number) => z.string().max(max).transform((s) => s.replace(CONTROL_CHARS, ""));
const id = z.string().min(1).max(40);

export const VIDEO_URL_RE = /^https:\/\/(www\.)?(youtube\.com|youtu\.be|vimeo\.com|player\.vimeo\.com)\/|^https:\/\/.+\.(mp4|webm)(\?.*)?$/i;

export function isEmptyValue(value: unknown) {
  return value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
}

function base(def: FieldDef): z.ZodType<unknown> {
  const c = def.config;
  const choiceValues = (c.choices ?? []).map((x) => x.value);
  const oneOf = z.string().refine((v) => choiceValues.includes(v), "Pick one of the listed options");
  switch (def.type) {
    case "TEXT":
      return text(c.maxLength ?? 300);
    case "TEXTAREA":
      return text(c.maxLength ?? 5000);
    case "RICH_TEXT":
      // Sanitised to an allowlist on the server before it is stored.
      return z.string().max(c.maxLength ?? 100_000);
    case "URL":
      return z.string().max(2048).refine((v) => /^(https?:\/\/|\/(?!\/)|#|mailto:|tel:)/i.test(v), "Use a full https:// address or a /path");
    case "VIDEO_URL":
      return z.string().max(2048).regex(VIDEO_URL_RE, "Use a YouTube, Vimeo or https:// .mp4 link");
    case "EMAIL":
      return z.string().max(254).email("That isn't an email address");
    case "COLOR":
      return z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour such as #1F2937");
    case "NUMBER": {
      let n = z.number().finite();
      if (c.min !== undefined) n = n.min(c.min);
      if (c.max !== undefined) n = n.max(c.max);
      return n;
    }
    case "PRICE":
      return z.object({ amount: z.number().nonnegative().max(1_000_000_000), currency: z.string().regex(/^[A-Z]{3}$/) });
    case "DATE":
      return z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").refine((v) => !Number.isNaN(Date.parse(v)), "Not a real date");
    case "BOOLEAN":
      return z.boolean();
    case "IMAGE":
    case "FILE":
    case "USER":
      return id;
    case "GALLERY":
      return z.array(id).max(c.maxRows ?? 60);
    case "SELECT":
      return c.multiple ? z.array(oneOf).max(choiceValues.length) : oneOf;
    case "RADIO":
      return oneOf;
    case "CHECKBOX":
      return z.array(oneOf).max(choiceValues.length);
    case "RELATION":
      return c.multiple ? z.array(id).max(50) : id;
    case "TAXONOMY":
      return z.array(id).max(50);
    case "REPEATER": {
      const row = z.object(Object.fromEntries((c.subFields ?? []).map((sf) => [sf.key, valueSchema(sf)]))).strip();
      let rows = z.array(row);
      if (c.minRows) rows = rows.min(c.minRows, `Add at least ${c.minRows} rows`);
      rows = rows.max(c.maxRows ?? 200);
      return rows;
    }
    case "FLEXIBLE": {
      const layouts = c.layouts ?? [];
      return z
        .array(z.object({ layout: z.string(), values: z.record(z.string(), z.unknown()) }))
        .max(c.maxRows ?? 100)
        .transform((blocks, zctx) => {
          const out: FlexibleBlock[] = [];
          for (const [i, block] of blocks.entries()) {
            const layout = layouts.find((l) => l.key === block.layout);
            if (!layout) {
              zctx.addIssue({ code: "custom", message: `Block ${i + 1} uses an unknown layout`, path: [i, "layout"] });
              continue;
            }
            const parsed = z.object(Object.fromEntries(layout.subFields.map((sf) => [sf.key, valueSchema(sf)]))).strip().safeParse(block.values);
            if (!parsed.success) {
              for (const issue of parsed.error.issues) zctx.addIssue({ ...issue, code: "custom", path: [i, "values", ...issue.path] } as never);
              continue;
            }
            out.push({ layout: layout.key, values: parsed.data });
          }
          return out;
        });
    }
  }
}

/** Validates (and normalises) one field's value. Empty values become null. */
export function valueSchema(def: FieldDef): z.ZodType<unknown> {
  const inner = base(def);
  return z.unknown().transform((raw, zctx) => {
    const value = typeof raw === "string" && def.type !== "RICH_TEXT" ? raw.trim() : raw;
    if (isEmptyValue(value)) {
      if (def.required) zctx.addIssue({ code: "custom", message: `${def.label} is required` });
      return null;
    }
    const parsed = inner.safeParse(value);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) zctx.addIssue({ ...issue, code: "custom", message: `${def.label}: ${issue.message}` } as never);
      return z.NEVER;
    }
    if (def.type === "RICH_TEXT" && typeof parsed.data === "string" && !parsed.data.replace(/<[^>]*>/g, "").trim() && def.required) {
      zctx.addIssue({ code: "custom", message: `${def.label} is required` });
    }
    return parsed.data;
  });
}

/** Ids a set of values points at, so the server can prove each belongs to the site. */
export interface FieldRefs {
  assets: Set<string>;
  posts: Set<string>;
  users: Set<string>;
  terms: Set<string>;
}

export const emptyRefs = (): FieldRefs => ({ assets: new Set(), posts: new Set(), users: new Set(), terms: new Set() });

export function collectRefs(def: FieldDef, value: unknown, refs: FieldRefs) {
  if (isEmptyValue(value)) return;
  const list = (v: unknown) => (Array.isArray(v) ? v : [v]).filter((x): x is string => typeof x === "string");
  switch (def.type) {
    case "IMAGE":
    case "FILE":
    case "GALLERY":
      list(value).forEach((x) => refs.assets.add(x));
      break;
    case "RELATION":
      list(value).forEach((x) => refs.posts.add(x));
      break;
    case "USER":
      list(value).forEach((x) => refs.users.add(x));
      break;
    case "TAXONOMY":
      list(value).forEach((x) => refs.terms.add(x));
      break;
    case "REPEATER":
      for (const row of value as RepeaterRow[]) for (const sf of def.config.subFields ?? []) collectRefs(sf, row[sf.key], refs);
      break;
    case "FLEXIBLE":
      for (const block of value as FlexibleBlock[]) {
        const layout = def.config.layouts?.find((l) => l.key === block.layout);
        for (const sf of layout?.subFields ?? []) collectRefs(sf, block.values[sf.key], refs);
      }
      break;
  }
}

/** The value a fresh form starts with. */
export function emptyValue(def: FieldDef): unknown {
  switch (def.type) {
    case "BOOLEAN":
      return false;
    case "GALLERY":
    case "CHECKBOX":
    case "TAXONOMY":
    case "REPEATER":
    case "FLEXIBLE":
      return [];
    case "SELECT":
    case "RELATION":
      return def.config.multiple ? [] : null;
    case "PRICE":
      return null;
    default:
      return null;
  }
}

/** Plain-text rendering of a value, for tables and text bindings. */
export function valueToText(def: Pick<FieldDef, "type" | "config">, value: unknown): string {
  if (isEmptyValue(value)) return "";
  const label = (v: string) => def.config.choices?.find((c) => c.value === v)?.label ?? v;
  switch (def.type) {
    case "BOOLEAN":
      return value ? "Yes" : "No";
    case "SELECT":
    case "RADIO":
    case "CHECKBOX":
      return (Array.isArray(value) ? value : [value]).map((v) => label(String(v))).join(", ");
    case "PRICE": {
      const p = value as { amount: number; currency: string };
      return new Intl.NumberFormat("en-US", { style: "currency", currency: p.currency }).format(p.amount);
    }
    case "DATE":
      return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
    case "RICH_TEXT":
      return String(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    case "NUMBER":
    case "TEXT":
    case "TEXTAREA":
    case "URL":
    case "VIDEO_URL":
    case "EMAIL":
    case "COLOR":
      return String(value);
    default:
      return "";
  }
}
