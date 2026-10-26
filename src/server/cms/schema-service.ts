import "server-only";
import { updateTag } from "next/cache";
import { z } from "zod";
import { FIELD_KEY_RE, definitionProblem, fieldDefSchema, type FieldDef } from "@/lib/cms/fields";
import { locationRulesSchema } from "@/lib/cms/location";
import { SLUG_RE, keyify, slugify } from "@/lib/cms/slug";
import type { TenantContext } from "@/lib/tenant";
import { EditError } from "../content-service";
import { siteCacheTag } from "../public-site";
import { asJson, snapshotMeta } from "./snapshot";

/**
 * Designer-only schema management: post types, taxonomies, terms and field
 * groups. Every function asserts `schema.manage` itself, so a server action
 * that forgets to check can't open it up.
 */

// "graphql" would shadow the REST endpoint of a post type with that key (/api/v1/sites/<site>/graphql).
const RESERVED_KEYS = new Set(["template", "admin", "api", "sites", "uploads", "login", "media", "page", "post", "graphql"]);
const RESERVED_PREFIXES = new Set(["admin", "api", "sites", "uploads", "login", "_next"]);

export const postTypeInputSchema = z.object({
  id: z.string().max(40).nullish(),
  labelSingular: z.string().trim().min(1, "Add a singular label").max(60),
  labelPlural: z.string().trim().min(1, "Add a plural label").max(60),
  key: z.string().trim().max(40),
  description: z.string().max(300).nullish(),
  icon: z.string().max(8).nullish(),
  routePrefix: z.string().trim().max(60).nullish(),
  slugRule: z.enum(["TITLE", "DATE_TITLE", "ID"]),
  usesBuilder: z.boolean(),
  hasArchive: z.boolean(),
  hierarchical: z.boolean(),
  apiEnabled: z.boolean(),
  templates: z.array(z.object({ key: z.string().regex(FIELD_KEY_RE), label: z.string().trim().min(1).max(60) })).max(20),
});

export async function savePostType(t: TenantContext, raw: z.input<typeof postTypeInputSchema>) {
  t.assert("schema.manage");
  const parsed = postTypeInputSchema.safeParse(raw);
  if (!parsed.success) throw new EditError(parsed.error.issues[0]?.message ?? "Invalid post type", "invalid");
  const input = parsed.data;
  const existing = input.id ? await t.db.postType.findUnique({ where: { id: input.id } }) : null;
  if (input.id && !existing) throw new EditError("Post type not found", "not_found");
  if (existing?.key === "template") throw new EditError("That post type is managed by the system", "forbidden");

  const key = existing?.isSystem ? existing.key : keyify(input.key || input.labelPlural);
  if (!FIELD_KEY_RE.test(key)) throw new EditError("Keys use lowercase letters, numbers and underscores", "invalid");
  if (!existing?.isSystem && RESERVED_KEYS.has(key)) throw new EditError(`"${key}" is reserved. Pick another key.`, "invalid");
  const keyClash = await t.db.postType.findFirst({ where: { key, id: { not: existing?.id ?? "" } }, select: { id: true } });
  if (keyClash) throw new EditError("Another post type already uses that key", "invalid");

  const routePrefix = key === "page" ? null : slugify(input.routePrefix || input.labelPlural) || key;
  if (routePrefix) {
    if (!SLUG_RE.test(routePrefix) || routePrefix.includes("/")) throw new EditError("The URL prefix must be one word or hyphenated words", "invalid");
    if (RESERVED_PREFIXES.has(routePrefix)) throw new EditError(`"/${routePrefix}" is reserved`, "invalid");
    const clash = await t.db.postType.findFirst({ where: { routePrefix, id: { not: existing?.id ?? "" } }, select: { labelPlural: true } });
    if (clash) throw new EditError(`${clash.labelPlural} already use /${routePrefix}`, "invalid");
    const page = await t.db.post.findFirst({ where: { postType: { key: "page" }, locale: "", slug: routePrefix, status: { not: "TRASHED" } }, select: { title: true } });
    if (page) throw new EditError(`The page "${page.title}" already lives at /${routePrefix}`, "invalid");
    const language = await t.db.siteLocale.findFirst({ where: { prefix: routePrefix, isDefault: false }, select: { label: true } });
    if (language) throw new EditError(`/${routePrefix} is the address of the ${language.label} version of the site`, "invalid");
  }
  if (new Set(input.templates.map((x) => x.key)).size !== input.templates.length) throw new EditError("Two page templates share a key", "invalid");

  const data = {
    labelSingular: input.labelSingular,
    labelPlural: input.labelPlural,
    description: input.description?.trim() || null,
    icon: input.icon || null,
    routePrefix,
    slugRule: input.slugRule,
    // The system page type always uses the canvas.
    usesBuilder: existing?.key === "page" ? true : input.usesBuilder,
    hasArchive: input.hasArchive,
    hierarchical: input.hierarchical,
    apiEnabled: input.apiEnabled,
    metadata: asJson({ ...((existing?.metadata as object) ?? {}), templates: input.templates }),
  };
  if (existing && existing.usesBuilder !== data.usesBuilder) {
    const count = await t.db.post.count({ where: { postTypeId: existing.id } });
    if (count) throw new EditError("Switch between visual and form-based entries only while the post type is empty", "invalid");
  }

  const saved = existing
    ? await t.db.postType.update({ where: { id: existing.id }, data })
    : await t.db.postType.create({ data: { ...data, siteId: t.site.id, key } });
  await audit(t, existing ? "schema.postType.update" : "schema.postType.create", saved.id);
  updateTag(siteCacheTag(t.site.id));
  return { id: saved.id };
}

export async function deletePostType(t: TenantContext, id: string) {
  t.assert("schema.manage");
  const pt = await t.db.postType.findUnique({ where: { id }, include: { _count: { select: { posts: true } } } });
  if (!pt) throw new EditError("Post type not found", "not_found");
  if (pt.isSystem) throw new EditError("Built-in post types can't be deleted", "forbidden");
  if (pt._count.posts) throw new EditError(`Delete or move the ${pt._count.posts} ${pt.labelPlural.toLowerCase()} first`, "invalid");
  await t.db.$transaction(async (tx) => {
    if (pt.singleTemplateId) await tx.post.delete({ where: { id: pt.singleTemplateId } });
    await tx.postType.delete({ where: { id } });
  });
  await audit(t, "schema.postType.delete", id);
  return {};
}

async function templatePostType(t: TenantContext) {
  return (
    (await t.db.postType.findFirst({ where: { key: "template" } })) ??
    t.db.postType.create({
      data: { siteId: t.site.id, key: "template", labelSingular: "Template", labelPlural: "Templates", usesBuilder: true, isSystem: true },
    })
  );
}

/** A starting layout for single entries: featured image, title, date and body, all bound to the entry. */
function singleTemplateDoc() {
  return {
    version: 1,
    rootId: "root",
    nodes: {
      root: { id: "root", type: "section", tag: "main", name: "Entry", props: {}, style: { desktop: { display: "flex", flexDirection: "column", gap: "var(--space-md)", padding: "var(--space-xl) 2rem", maxWidth: "960px", margin: "0 auto" }, mobile: { padding: "3rem 1.25rem" } }, children: ["meta", "title", "image", "body"] },
      meta: { id: "meta", type: "text", props: { text: "" }, style: { desktop: { fontSize: ".8rem", letterSpacing: ".12em", textTransform: "uppercase", color: "var(--color-muted)" } }, bindings: { text: { source: "post", key: "date" } } },
      title: { id: "title", type: "heading", tag: "h1", props: { text: "" }, style: { desktop: { fontFamily: "var(--font-display)", fontSize: "var(--text-h1, 3rem)", lineHeight: "1.05" } }, bindings: { text: { source: "post", key: "title" } } },
      image: { id: "image", type: "image", props: { image: { assetId: null, src: "", alt: "" }, priority: true }, style: { desktop: { aspectRatio: "16 / 9", borderRadius: "var(--radius-md)", objectFit: "cover" } }, bindings: { image: { source: "post", key: "featured_image" } } },
      body: { id: "body", type: "richtext", tag: "article", props: {}, style: { desktop: { lineHeight: "1.7", maxWidth: "68ch" } }, bindings: { html: { source: "post", key: "content" } } },
    },
  };
}

export async function createSingleTemplate(t: TenantContext, postTypeId: string) {
  t.assert("schema.manage");
  t.assert("design.layout");
  const pt = await t.db.postType.findUnique({ where: { id: postTypeId } });
  if (!pt || pt.key === "page" || pt.key === "template") throw new EditError("Post type not found", "not_found");
  if (pt.singleTemplateId) return { id: pt.singleTemplateId };
  const tpl = await templatePostType(t);
  const doc = singleTemplateDoc();
  const title = `${pt.labelSingular} template`;
  const post = await t.db.$transaction(async (tx) => {
    const post = await tx.post.create({
      data: { siteId: t.site.id, postTypeId: tpl.id, authorId: t.user.id, title, slug: `${pt.key}-single`, draft: asJson(doc), status: "DRAFT" },
    });
    await tx.postRevision.create({
      data: { siteId: t.site.id, postId: post.id, version: 1, kind: "DRAFT", title, document: asJson(doc), meta: asJson(await snapshotMeta(tx, post.id)), message: "Created", authorId: t.user.id },
    });
    await tx.postType.update({ where: { id: pt.id }, data: { singleTemplateId: post.id } });
    return post;
  });
  await audit(t, "schema.template.create", post.id);
  return { id: post.id };
}

// ─────────────────────────────────────────────────────────────────────────────
// Taxonomies and terms
// ─────────────────────────────────────────────────────────────────────────────

export async function saveTaxonomy(t: TenantContext, input: { id?: string | null; label: string; key?: string; hierarchical: boolean; postTypeIds: string[] }) {
  t.assert("schema.manage");
  const label = input.label.trim().slice(0, 60);
  if (!label) throw new EditError("Add a label", "invalid");
  const existing = input.id ? await t.db.taxonomy.findUnique({ where: { id: input.id } }) : null;
  if (input.id && !existing) throw new EditError("Taxonomy not found", "not_found");
  const key = existing?.key ?? keyify(input.key || label);
  if (!FIELD_KEY_RE.test(key)) throw new EditError("Keys use lowercase letters, numbers and underscores", "invalid");
  if (!existing && (await t.db.taxonomy.findFirst({ where: { key } }))) throw new EditError("Another taxonomy already uses that key", "invalid");
  const postTypes = await t.db.postType.findMany({ where: { id: { in: input.postTypeIds } }, select: { id: true } });
  if (postTypes.length !== new Set(input.postTypeIds).size) throw new EditError("Unknown post type", "invalid");
  // Implicit many-to-many: ids were just proven to be this site's.
  const connect = { set: postTypes.map((p) => ({ id: p.id })) };
  const saved = existing
    ? await t.db.taxonomy.update({ where: { id: existing.id }, data: { label, hierarchical: input.hierarchical, postTypes: connect } })
    : await t.db.taxonomy.create({ data: { siteId: t.site.id, key, label, hierarchical: input.hierarchical, postTypes: { connect: connect.set } } });
  await audit(t, "schema.taxonomy.save", saved.id);
  return { id: saved.id };
}

export async function deleteTaxonomy(t: TenantContext, id: string) {
  t.assert("schema.manage");
  const res = await t.db.taxonomy.deleteMany({ where: { id } });
  if (!res.count) throw new EditError("Taxonomy not found", "not_found");
  await audit(t, "schema.taxonomy.delete", id);
  updateTag(siteCacheTag(t.site.id));
  return {};
}

export async function saveTerm(t: TenantContext, input: { id?: string | null; taxonomyId: string; name: string; slug?: string; parentId?: string | null }) {
  t.assert("schema.manage");
  const name = input.name.trim().slice(0, 80);
  if (!name) throw new EditError("Add a name", "invalid");
  const taxonomy = await t.db.taxonomy.findUnique({ where: { id: input.taxonomyId } });
  if (!taxonomy) throw new EditError("Taxonomy not found", "not_found");
  const slug = slugify(input.slug || name);
  if (!slug) throw new EditError("Add a slug", "invalid");
  const existing = input.id ? await t.db.term.findFirst({ where: { id: input.id, taxonomyId: taxonomy.id } }) : null;
  if (input.id && !existing) throw new EditError("Term not found", "not_found");
  const clash = await t.db.term.findFirst({ where: { taxonomyId: taxonomy.id, slug, id: { not: existing?.id ?? "" } } });
  if (clash) throw new EditError(`"${clash.name}" already uses that slug`, "invalid");

  let parentId = taxonomy.hierarchical ? input.parentId || null : null;
  if (parentId) {
    // Walk up from the chosen parent: it must be in this taxonomy and not below the term itself.
    for (let cur: string | null = parentId, i = 0; cur && i < 50; i++) {
      if (existing && cur === existing.id) throw new EditError("A term can't sit under itself", "invalid");
      const p: { taxonomyId: string; parentId: string | null } | null = await t.db.term.findUnique({ where: { id: cur }, select: { taxonomyId: true, parentId: true } });
      if (!p || p.taxonomyId !== taxonomy.id) throw new EditError("Pick a parent from the same taxonomy", "invalid");
      cur = p.parentId;
    }
  } else parentId = null;

  const saved = existing
    ? await t.db.term.update({ where: { id: existing.id }, data: { name, slug, parentId } })
    : await t.db.term.create({ data: { siteId: t.site.id, taxonomyId: taxonomy.id, name, slug, parentId } });
  updateTag(siteCacheTag(t.site.id));
  return { id: saved.id };
}

export async function deleteTerm(t: TenantContext, id: string) {
  t.assert("schema.manage");
  const term = await t.db.term.findUnique({ where: { id } });
  if (!term) throw new EditError("Term not found", "not_found");
  await t.db.$transaction([
    t.db.term.updateMany({ where: { parentId: id }, data: { parentId: term.parentId } }),
    t.db.term.delete({ where: { id } }),
  ]);
  updateTag(siteCacheTag(t.site.id));
  return {};
}

// ─────────────────────────────────────────────────────────────────────────────
// Field groups
// ─────────────────────────────────────────────────────────────────────────────

export const fieldGroupInputSchema = z.object({
  id: z.string().max(40).nullish(),
  key: z.string().max(40).optional(),
  label: z.string().trim().min(1, "Name the field group").max(80),
  description: z.string().max(300).nullish(),
  active: z.boolean(),
  location: locationRulesSchema,
  fields: z.array(fieldDefSchema).max(60),
});

export type FieldGroupInput = z.input<typeof fieldGroupInputSchema>;

/** Every id a definition list or rule set points at must be this site's. */
async function verifySchemaRefs(t: TenantContext, location: z.infer<typeof locationRulesSchema>, defs: FieldDef[]) {
  const ids = { postTypes: new Set<string>(), terms: new Set<string>(), posts: new Set<string>(), taxonomies: new Set<string>() };
  for (const rule of location.flat()) {
    if (rule.param === "post_type") ids.postTypes.add(rule.value);
    if (rule.param === "post_term") ids.terms.add(rule.value);
    if (rule.param === "parent_page") ids.posts.add(rule.value);
  }
  const walk = (list: FieldDef[]) => {
    for (const d of list) {
      d.config.postTypeIds?.forEach((x) => ids.postTypes.add(x));
      if (d.config.taxonomyId) ids.taxonomies.add(d.config.taxonomyId);
      walk(d.config.subFields ?? []);
      d.config.layouts?.forEach((l) => walk(l.subFields));
    }
  };
  walk(defs);
  const [pt, terms, posts, tax] = await Promise.all([
    t.db.postType.count({ where: { id: { in: [...ids.postTypes] } } }),
    t.db.term.count({ where: { id: { in: [...ids.terms] } } }),
    t.db.post.count({ where: { id: { in: [...ids.posts] } } }),
    t.db.taxonomy.count({ where: { id: { in: [...ids.taxonomies] } } }),
  ]);
  if (pt !== ids.postTypes.size) throw new EditError("A rule or field points at a post type that doesn't exist", "invalid");
  if (terms !== ids.terms.size) throw new EditError("A location rule points at a term that doesn't exist", "invalid");
  if (posts !== ids.posts.size) throw new EditError("A location rule points at a page that doesn't exist", "invalid");
  if (tax !== ids.taxonomies.size) throw new EditError("A field points at a taxonomy that doesn't exist", "invalid");
}

export async function saveFieldGroup(t: TenantContext, raw: FieldGroupInput) {
  t.assert("schema.manage");
  const parsed = fieldGroupInputSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new EditError(issue ? `${issue.message}${issue.path.length ? ` (${issue.path.join(" → ")})` : ""}` : "Invalid field group", "invalid");
  }
  const input = parsed.data;
  const problem = definitionProblem(input.fields);
  if (problem) throw new EditError(problem, "invalid");
  await verifySchemaRefs(t, input.location, input.fields);

  const existing = input.id ? await t.db.fieldGroup.findUnique({ where: { id: input.id }, include: { fields: true } }) : null;
  if (input.id && !existing) throw new EditError("Field group not found", "not_found");
  const key = existing?.key ?? (keyify(input.key || input.label) || "group");
  if (!existing && (await t.db.fieldGroup.findFirst({ where: { key } }))) throw new EditError("Another field group already uses that key", "invalid");

  // Field keys are unique across the site, so bindings and the API can address a field by key alone.
  const otherKeys = await t.db.customField.findMany({ where: { groupId: { not: existing?.id ?? "" }, key: { in: input.fields.map((f) => f.key) } }, include: { group: { select: { label: true } } } });
  if (otherKeys.length) throw new EditError(`The key "${otherKeys[0].key}" is already used in "${otherKeys[0].group.label}"`, "invalid");

  const before = new Map((existing?.fields ?? []).map((f) => [f.id, f]));
  const keepIds = new Set(input.fields.map((f) => f.id).filter((x): x is string => !!x && before.has(x)));

  const saved = await t.db.$transaction(async (tx) => {
    const group = existing
      ? await tx.fieldGroup.update({ where: { id: existing.id }, data: { label: input.label, description: input.description || null, active: input.active, location: asJson(input.location) } })
      : await tx.fieldGroup.create({ data: { siteId: t.site.id, key, label: input.label, description: input.description || null, active: input.active, location: asJson(input.location) } });

    const removed = [...before.keys()].filter((id) => !keepIds.has(id));
    if (removed.length) await tx.customField.deleteMany({ where: { id: { in: removed } } });
    // Free up keys first so a rename-and-swap within one save doesn't trip the unique index.
    for (const id of keepIds) await tx.customField.update({ where: { id }, data: { key: `__tmp_${id}` } });

    for (const [order, def] of input.fields.entries()) {
      const data = {
        key: def.key,
        label: def.label,
        type: def.type,
        instructions: def.instructions || null,
        required: !!def.required,
        clientEditable: def.clientEditable ?? true,
        config: asJson(def.config),
        order,
      };
      const prev = def.id ? before.get(def.id) : undefined;
      if (prev) {
        // A new type can't read the old values; clear them rather than render garbage.
        if (prev.type !== def.type) await tx.fieldValue.deleteMany({ where: { fieldId: prev.id } });
        await tx.customField.update({ where: { id: prev.id }, data });
      } else {
        await tx.customField.create({ data: { ...data, siteId: t.site.id, groupId: group.id } });
      }
    }
    return group;
  });
  await audit(t, existing ? "schema.fieldGroup.update" : "schema.fieldGroup.create", saved.id);
  return { id: saved.id };
}

export async function deleteFieldGroup(t: TenantContext, id: string) {
  t.assert("schema.manage");
  const res = await t.db.fieldGroup.deleteMany({ where: { id } });
  if (!res.count) throw new EditError("Field group not found", "not_found");
  await audit(t, "schema.fieldGroup.delete", id);
  return {};
}

async function audit(t: TenantContext, action: string, targetId: string) {
  await t.db.auditLog.create({ data: { siteId: t.site.id, userId: t.user.id, action, targetId } });
}
