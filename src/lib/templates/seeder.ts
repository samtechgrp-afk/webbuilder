import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { ImageValue } from "@/lib/builder/types";
import { prisma as defaultDb } from "@/lib/db";
import { readSiteSeo } from "@/lib/seo/settings";
import { localStorage, processImage, type StorageAdapter } from "@/server/media-processing";
import { toImage } from "@/server/cms/dynamic";
import { artworkFileName, artworkSvg, blueprintPalette } from "./artwork";
import { compileBlueprint } from "./compile";
import { blueprintCurrency, bodyHtml, fieldConfig, storedFieldValue, toMinor, variantRows } from "./content";
import { subdomainProblem } from "./subdomain";
import type { Blueprint } from "./types";

/**
 * Turns a blueprint into a real site in one database transaction.
 *
 * Artwork is rendered first (sharp work and file writes can't run inside a
 * transaction), then every row (site, the creator's Designer membership, post
 * types, fields, taxonomies, media, entries and pages with their published
 * revisions, store and products) is inserted with the new siteId. Ids are
 * generated up front so the documents can be compiled before the
 * transaction starts and it stays short. If anything fails the transaction
 * rolls back and the files written for it are deleted, so a failed attempt
 * leaves nothing behind.
 */

export class TemplateError extends Error {
  constructor(message: string, readonly field?: "name" | "subdomain" | "template") {
    super(message);
  }
}

export interface InstantiateInput {
  blueprint: Blueprint;
  name: string;
  subdomain: string;
  /** Becomes the site's Designer. */
  ownerId: string;
}

export interface InstantiateResult {
  siteId: string;
  homeId: string;
}

/** A cuid-shaped id, so ids made here look like the ones Prisma makes. */
const newId = () => `c${randomUUID().replace(/-/g, "").slice(0, 24)}`;

/** Records every file it writes, so a failed run can delete them. */
function trackingStorage(inner: StorageAdapter) {
  const keys: string[] = [];
  const adapter: StorageAdapter = {
    async put(key, body, type) {
      keys.push(key);
      return inner.put(key, body, type);
    },
    remove: (key) => inner.remove(key),
  };
  return { adapter, cleanup: () => Promise.all(keys.map((k) => inner.remove(k).catch(() => {}))) };
}

export async function instantiateBlueprint(input: InstantiateInput, opts: { db?: PrismaClient; storage?: StorageAdapter } = {}): Promise<InstantiateResult> {
  const db = opts.db ?? defaultDb;
  const bp = input.blueprint;
  const name = input.name.trim();
  const subdomain = input.subdomain.trim().toLowerCase();
  if (!name || name.length > 60) throw new TemplateError("Give the site a name of up to 60 characters", "name");
  const problem = subdomainProblem(subdomain);
  if (problem) throw new TemplateError(problem, "subdomain");
  if (await db.site.findUnique({ where: { subdomain }, select: { id: true } })) throw new TemplateError("That address is taken", "subdomain");
  const designerRole = await db.role.findFirst({ where: { siteId: null, key: "designer" }, select: { id: true } });
  if (!designerRole) throw new Error("The Designer system role is missing");

  const siteId = newId();
  const currency = blueprintCurrency(bp);
  const { adapter, cleanup } = trackingStorage(opts.storage ?? localStorage);

  try {
    // ── Artwork (outside the transaction) ───────────────────────────────────
    const palette = blueprintPalette(bp);
    const assets: Prisma.MediaAssetCreateManyInput[] = [];
    const images: Record<string, ImageValue> = {};
    const assetIds: Record<string, string> = {};
    for (const spec of bp.images) {
      const processed = await processImage(siteId, Buffer.from(artworkSvg(spec, palette)), artworkFileName(spec), adapter);
      const id = newId();
      const row = { ...processed, id, siteId, uploadedById: input.ownerId, altText: spec.alt, tags: ["template", bp.key] };
      assets.push(row);
      assetIds[spec.key] = id;
      images[spec.key] = toImage({ ...row, altText: spec.alt, width: row.width ?? null, height: row.height ?? null });
    }
    const imageId = (key: string) => assetIds[key];

    // ── Ids and documents (pure) ────────────────────────────────────────────
    const pageTypeId = newId();
    const postTypeIdBlog = newId();
    const templateTypeId = newId();
    const postTypeIds = Object.fromEntries(bp.postTypes.map((p) => [p.key, newId()]));
    const productIds = Object.fromEntries(bp.products.map((p) => [p.slug, newId()]));
    const compiled = compileBlueprint(bp, { siteName: name, images, postTypeIds, productIds });
    const t = (s: string) => s.replaceAll("{{site}}", name);
    const now = Date.now();

    interface PostRow {
      post: Prisma.PostCreateManyInput;
      revision: Prisma.PostRevisionCreateManyInput;
    }
    const posts: PostRow[] = [];
    const publish = (data: Omit<Prisma.PostCreateManyInput, "id" | "siteId" | "status" | "publishedAt" | "authorId">, document: unknown, meta: Record<string, unknown>) => {
      const id = newId();
      const revisionId = newId();
      const doc = document as Prisma.InputJsonValue;
      posts.push({
        post: { ...data, id, siteId, authorId: input.ownerId, draft: doc, status: "PUBLISHED", publishedAt: new Date(now) },
        revision: { id: revisionId, siteId, postId: id, version: 1, kind: "PUBLISHED", title: data.title, document: doc, meta: meta as Prisma.InputJsonValue, message: `Created from the ${bp.name} template`, authorId: input.ownerId },
      });
      return id;
    };
    const pageMeta = (seo: { seoTitle: string | null; seoDescription: string | null }) => ({ fields: {}, featuredImageId: null, excerpt: null, termIds: [], template: null, parentId: null, authorName: null, seo: { ...seo, noIndex: false, canonicalUrl: null, ogImageId: null } });

    let homeId = "";
    compiled.pages.forEach((page, i) => {
      const id = publish({ postTypeId: pageTypeId, title: page.title, slug: page.slug, menuOrder: i, seoTitle: page.seo.title, seoDescription: page.seo.description }, page.document, pageMeta({ seoTitle: page.seo.title, seoDescription: page.seo.description }));
      if (page.slug === "home") homeId = id;
    });
    const notFoundId = publish({ postTypeId: pageTypeId, title: "Page not found", slug: "page-not-found", menuOrder: compiled.pages.length, noIndex: true }, compiled.notFound, pageMeta({ seoTitle: null, seoDescription: null }));
    const productTemplateId = compiled.productTemplate ? publish({ postTypeId: templateTypeId, title: "Product page", slug: "product-page" }, compiled.productTemplate, pageMeta({ seoTitle: null, seoDescription: null })) : null;

    // Custom post types: field groups, fields, taxonomy terms and entries.
    const groups: Prisma.FieldGroupCreateManyInput[] = [];
    const fields: Prisma.CustomFieldCreateManyInput[] = [];
    const fieldIds: Record<string, Record<string, string>> = {};
    const taxonomies: { id: string; key: string; label: string; postTypeId: string }[] = [];
    const terms: Prisma.TermCreateManyInput[] = [];
    const termIds: Record<string, Record<string, string>> = {};
    for (const pt of bp.postTypes) {
      if (pt.fields.length) {
        const groupId = newId();
        groups.push({ id: groupId, siteId, key: `${pt.key.replace(/-/g, "_")}_details`, label: `${pt.singular} details`, location: [[{ param: "post_type", op: "==", value: postTypeIds[pt.key] }]] });
        fieldIds[pt.key] = {};
        pt.fields.forEach((f, order) => {
          const id = newId();
          fieldIds[pt.key][f.key] = id;
          fields.push({ id, siteId, groupId, key: f.key, label: f.label, type: f.type, required: !!f.required, config: fieldConfig(f, currency) as Prisma.InputJsonValue, order });
        });
      }
      if (pt.taxonomy) {
        const taxonomyId = newId();
        taxonomies.push({ id: taxonomyId, key: pt.taxonomy.key, label: pt.taxonomy.label, postTypeId: postTypeIds[pt.key] });
        termIds[pt.key] = {};
        for (const term of pt.taxonomy.terms) {
          const id = newId();
          termIds[pt.key][term] = id;
          terms.push({ id, siteId, taxonomyId, name: term, slug: term.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") });
        }
      }
    }
    const values: Prisma.FieldValueCreateManyInput[] = [];
    const postTerms: Prisma.PostTermCreateManyInput[] = [];
    bp.entries.forEach((e, i) => {
      const pt = bp.postTypes.find((p) => p.key === e.type)!;
      const stored: Record<string, unknown> = {};
      for (const f of pt.fields) if (e.fields[f.key] !== undefined) stored[f.key] = storedFieldValue(f, e.fields[f.key], currency, imageId);
      const entryTerms = (e.terms ?? []).map((term) => termIds[pt.key][term]);
      const id = publish(
        { postTypeId: postTypeIds[pt.key], title: t(e.title), slug: e.slug, excerpt: t(e.excerpt), featuredImageId: e.image ? imageId(e.image) : null, menuOrder: i },
        { type: "html", html: bodyHtml(e.body, name) },
        { fields: stored, featuredImageId: e.image ? imageId(e.image) : null, excerpt: t(e.excerpt), termIds: entryTerms, template: null, parentId: null, authorName: null, seo: { seoTitle: null, seoDescription: null, noIndex: false, canonicalUrl: null, ogImageId: null } },
      );
      for (const [key, value] of Object.entries(stored)) values.push({ siteId, postId: id, fieldId: fieldIds[pt.key][key], value: value as Prisma.InputJsonValue });
      for (const termId of entryTerms) postTerms.push({ postId: id, termId });
    });

    const products: Prisma.ProductCreateManyInput[] = [];
    const variants: Prisma.ProductVariantCreateManyInput[] = [];
    bp.products.forEach((p, i) => {
      const id = productIds[p.slug];
      products.push({
        id, siteId, title: p.title, slug: p.slug, description: p.description, images: p.images.map(imageId), price: toMinor(p.price, currency),
        compareAtPrice: p.compareAt !== undefined ? toMinor(p.compareAt, currency) : null, sku: p.sku, inventory: p.inventory, trackInventory: !p.digital,
        isPhysical: !p.digital, status: "ACTIVE", options: (p.options ?? []) as Prisma.InputJsonValue, createdAt: new Date(now - i * 60_000),
      });
      for (const v of variantRows(p, currency)) variants.push({ siteId, productId: id, title: v.title, price: v.price, sku: v.sku, inventory: v.inventory, attributes: v.attributes, position: v.position });
    });

    const seo = { ...readSiteSeo({}), titleTemplate: t(bp.site.seo.titleTemplate), homeTitle: `${name} · ${t(bp.site.tagline)}`.slice(0, 70), defaultDescription: t(bp.site.seo.description), defaultOgImageId: bp.images[0] ? imageId(bp.images[0].key) : null };

    // ── One transaction for every row ───────────────────────────────────────
    await db.$transaction(
      async (tx) => {
        await tx.site.create({
          data: {
            id: siteId, name, subdomain, status: "DRAFT",
            branding: { accent: bp.tokens.colors.primary.startsWith("#") ? bp.tokens.colors.primary : "#18181b", logoText: t(bp.site.logoText) },
            designTokens: { ...bp.tokens, preset: bp.tokens.preset ?? `template:${bp.key}` } as unknown as Prisma.InputJsonValue,
            settings: { tagline: t(bp.site.tagline), seo, template: bp.key } as Prisma.InputJsonValue,
          },
        });
        await tx.membership.create({ data: { userId: input.ownerId, siteId, roleId: designerRole.id } });
        await tx.postType.createMany({
          data: [
            { id: pageTypeId, siteId, key: "page", labelSingular: "Page", labelPlural: "Pages", hierarchical: true, usesBuilder: true, isSystem: true },
            { id: postTypeIdBlog, siteId, key: "post", labelSingular: "Blog post", labelPlural: "Blog posts", hasArchive: true, routePrefix: "journal", isSystem: true },
            { id: templateTypeId, siteId, key: "template", labelSingular: "Template", labelPlural: "Templates", usesBuilder: true, isSystem: true },
            ...bp.postTypes.map((pt) => ({ id: postTypeIds[pt.key], siteId, key: pt.key, labelSingular: pt.singular, labelPlural: pt.plural, routePrefix: pt.prefix, hasArchive: true, icon: pt.icon, description: pt.description, apiEnabled: true })),
          ],
        });
        if (assets.length) await tx.mediaAsset.createMany({ data: assets });
        if (groups.length) await tx.fieldGroup.createMany({ data: groups });
        if (fields.length) await tx.customField.createMany({ data: fields });
        for (const tax of taxonomies) await tx.taxonomy.create({ data: { id: tax.id, siteId, key: tax.key, label: tax.label, postTypes: { connect: { id: tax.postTypeId } } } });
        if (terms.length) await tx.term.createMany({ data: terms });
        await tx.post.createMany({ data: posts.map((p) => p.post) });
        await tx.postRevision.createMany({ data: posts.map((p) => p.revision) });
        for (const p of posts) await tx.post.update({ where: { id: p.post.id }, data: { publishedRevisionId: p.revision.id } });
        if (values.length) await tx.fieldValue.createMany({ data: values });
        if (postTerms.length) await tx.postTerm.createMany({ data: postTerms });
        if (bp.store || products.length) {
          await tx.store.create({ data: { siteId, enabled: false, currency, shippingCountries: bp.store?.shippingCountries ?? [], productTemplateId } });
        }
        if (products.length) await tx.product.createMany({ data: products });
        if (variants.length) await tx.productVariant.createMany({ data: variants });
        await tx.site.update({ where: { id: siteId }, data: { settings: { tagline: t(bp.site.tagline), seo, template: bp.key, notFoundPageId: notFoundId } as Prisma.InputJsonValue } });
        await tx.auditLog.create({ data: { siteId, userId: input.ownerId, action: "site.create_from_template", targetId: siteId, data: { template: bp.key, pages: compiled.pages.length, entries: bp.entries.length, products: products.length } } });
      },
      { timeout: 30_000, maxWait: 10_000 },
    );
    return { siteId, homeId };
  } catch (err) {
    await cleanup();
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002" && String(err.meta?.target ?? "").includes("subdomain")) {
      throw new TemplateError("That address is taken", "subdomain");
    }
    throw err;
  }
}
