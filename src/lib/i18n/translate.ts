import { isBoundField } from "@/lib/builder/policy";
import type { BuilderDocument, BuilderNode } from "@/lib/builder/types";
import { SHARED_CONTENT_KINDS, TRANSLATABLE_ITEM_KINDS, WIDGETS, contentField, type ContentField } from "@/lib/builder/widgets";
import { isEmptyValue, type FieldDef, type FieldType } from "@/lib/cms/fields";

/**
 * How a translation relates to its original.
 *
 * Builder pages: a translation never stores a layout. It stores only
 * content overrides (text, images, links, prices) keyed by node id, and is
 * always rendered on top of the original's current structure. Moving,
 * adding or restyling a section in the original changes every language at
 * once, and nothing a translator sends can change structure or styles.
 *
 * Entries: the translation has its own title, slug, body, SEO and
 * translatable custom fields (text, rich text, links, images, files). Shared
 * facts (prices, numbers, choices, relations, terms) always come from the
 * original, so they can't drift between languages.
 */

export interface TranslationDocument {
  type: "translation";
  version: 1;
  /** nodeId → content field key → value. */
  overrides: Record<string, Record<string, unknown>>;
}

export const emptyTranslation = (): TranslationDocument => ({ type: "translation", version: 1, overrides: {} });

export function isTranslationDocument(value: unknown): value is TranslationDocument {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<TranslationDocument>;
  return v.type === "translation" && v.version === 1 && !!v.overrides && typeof v.overrides === "object" && !Array.isArray(v.overrides);
}

/** The original's document with a translation's content laid over it. Unknown nodes and non-content keys are ignored. */
export function composeDocument(source: BuilderDocument, translation: unknown): BuilderDocument {
  if (!isTranslationDocument(translation)) return source;
  const nodes: Record<string, BuilderNode> = { ...source.nodes };
  for (const [nodeId, fields] of Object.entries(translation.overrides)) {
    const node = nodes[nodeId];
    if (!node || !fields || typeof fields !== "object") continue;
    let props = node.props;
    for (const [key, value] of Object.entries(fields)) {
      const def = contentField(node.type, key);
      if (!def || SHARED_CONTENT_KINDS.has(def.kind) || isEmptyValue(value) || isBoundField(source, nodeId, key)) continue;
      props = { ...props, [key]: def.kind === "items" ? mergeItems(def, props[key], value) : value };
    }
    if (props !== node.props) nodes[nodeId] = { ...node, props };
  }
  return { ...source, nodes };
}

/**
 * List records keep the original's structure (count, order, images, numbers,
 * toggles); a translation only replaces their text and links, by position.
 * A record the original added later simply shows in the original language.
 */
export function mergeItems(def: ContentField, source: unknown, translated: unknown): unknown {
  if (!Array.isArray(source)) return source;
  const keys = (def.itemFields ?? []).filter((f) => TRANSLATABLE_ITEM_KINDS.has(f.kind)).map((f) => f.key);
  const tr = Array.isArray(translated) ? translated : [];
  return source.map((item, i) => {
    const t = tr[i];
    if (!item || typeof item !== "object" || !t || typeof t !== "object") return item;
    const out = { ...(item as Record<string, unknown>) };
    for (const k of keys) if (!isEmptyValue((t as Record<string, unknown>)[k])) out[k] = (t as Record<string, unknown>)[k];
    return out;
  });
}

export interface TranslatableNode {
  id: string;
  type: BuilderNode["type"];
  name: string;
  fields: ContentField[];
}

/** Nodes with translatable content, in reading order (bound fields come from the translated entry, so they're left out). */
export function translatableNodes(doc: BuilderDocument): TranslatableNode[] {
  const out: TranslatableNode[] = [];
  const walk = (id: string, depth: number) => {
    const node = doc.nodes[id];
    if (!node || depth > 64) return;
    const fields = WIDGETS[node.type].contentFields.filter((f) => !SHARED_CONTENT_KINDS.has(f.kind) && !isBoundField(doc, id, f.key));
    if (fields.length) out.push({ id, type: node.type, name: node.name || WIDGETS[node.type].label, fields });
    for (const child of node.children ?? []) walk(child, depth + 1);
  };
  walk(doc.rootId, 0);
  return out;
}

/** Custom field types whose values differ per language. */
export const TRANSLATABLE_FIELD_TYPES: ReadonlySet<FieldType> = new Set<FieldType>(["TEXT", "TEXTAREA", "RICH_TEXT", "URL", "VIDEO_URL", "IMAGE", "FILE", "GALLERY"]);

export const isTranslatableField = (def: Pick<FieldDef, "type">) => TRANSLATABLE_FIELD_TYPES.has(def.type);

/**
 * Field values a translated entry shows: translatable fields use the
 * translation's value (falling back to the original's when left empty);
 * everything else always comes from the original.
 */
export function mergeEntryFields(defs: Map<string, Pick<FieldDef, "type">> | null, source: Record<string, unknown>, own: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...source };
  for (const [key, value] of Object.entries(own)) {
    const def = defs?.get(key);
    if (!def || !isTranslatableField(def) || isEmptyValue(value)) continue;
    out[key] = value;
  }
  return out;
}
