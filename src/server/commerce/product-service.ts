import "server-only";
import type { Prisma } from "@prisma/client";
import { updateTag } from "next/cache";
import { z } from "zod";
import { slugify } from "@/lib/cms/slug";
import { attributesKey, optionsSchema, readOptions, variantCombos, variantTitle, type VariantAttributes } from "@/lib/commerce/variants";
import type { TenantContext } from "@/lib/tenant";
import { EditError } from "../content-service";
import { siteCacheTag } from "../public-site";

/**
 * The product catalog behind /admin/sites/<id>/products. Everything needs
 * `commerce.manage` (designers and client admins). Variants are always the
 * full set of option combinations, so the storefront's selectors can never
 * offer a combination that doesn't exist.
 */

const MAX_PRICE = 100_000_000; // minor units: 1,000,000.00
const money = z.number().int().min(0).max(MAX_PRICE);
const stock = z.number().int().min(-1_000_000).max(1_000_000);
const plain = (max: number) => z.string().max(max).transform((s) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim());

export const productInputSchema = z
  .object({
    id: z.string().max(40).optional(),
    /** updatedAt the editor loaded; a newer row means someone else saved first. */
    baseUpdatedAt: z.string().max(40).optional(),
    title: plain(200).pipe(z.string().min(1, "Give the product a name")),
    slug: z.string().trim().toLowerCase().max(80),
    description: plain(5000),
    images: z.array(z.string().min(1).max(40)).max(20),
    price: money,
    compareAtPrice: money.nullable(),
    sku: plain(64).nullable(),
    inventory: stock,
    trackInventory: z.boolean(),
    isPhysical: z.boolean(),
    status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]),
    options: optionsSchema,
    variants: z
      .array(
        z
          .object({
            id: z.string().max(40).optional(),
            attributes: z.record(z.string().max(40), z.string().max(40)),
            price: money.nullable(),
            sku: plain(64).nullable(),
            inventory: stock,
          })
          .strict(),
      )
      .max(100),
  })
  .strict();
export type ProductInput = z.input<typeof productInputSchema>;

export async function listProducts(t: TenantContext, filter: { q?: string; status?: string }) {
  t.assert("commerce.manage");
  const where: Prisma.ProductWhereInput = {
    ...(filter.status && ["DRAFT", "ACTIVE", "ARCHIVED"].includes(filter.status) ? { status: filter.status as "DRAFT" } : {}),
    ...(filter.q ? { OR: [{ title: { contains: filter.q, mode: "insensitive" } }, { sku: { contains: filter.q, mode: "insensitive" } }, { variants: { some: { sku: { contains: filter.q, mode: "insensitive" } } } }] } : {}),
  };
  const [products, counts] = await Promise.all([
    t.db.product.findMany({ where, orderBy: { updatedAt: "desc" }, take: 200, include: { variants: { select: { inventory: true } } } }),
    t.db.product.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const covers = await t.db.mediaAsset.findMany({ where: { id: { in: products.map((p) => p.images[0]).filter(Boolean) } }, select: { id: true, url: true, altText: true } });
  const coverById = new Map(covers.map((c) => [c.id, c]));
  return {
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])) as Partial<Record<"DRAFT" | "ACTIVE" | "ARCHIVED", number>>,
    products: products.map((p) => ({
      id: p.id,
      title: p.title,
      slug: p.slug,
      status: p.status,
      price: p.price,
      sku: p.sku,
      variants: p.variants.length,
      stock: p.trackInventory ? (p.variants.length ? p.variants.reduce((n, v) => n + v.inventory, 0) : p.inventory) : null,
      cover: p.images[0] ? (coverById.get(p.images[0]) ?? null) : null,
      updatedAt: p.updatedAt.toISOString(),
    })),
  };
}

export async function getProduct(t: TenantContext, id: string) {
  t.assert("commerce.manage");
  const product = await t.db.product.findUnique({ where: { id }, include: { variants: { orderBy: { position: "asc" } } } });
  if (!product) return null;
  return { ...product, options: readOptions(product.options) };
}

async function uniqueSlug(t: TenantContext, wanted: string, exceptId?: string) {
  const base = slugify(wanted) || "product";
  for (let i = 0; i < 50; i++) {
    const slug = i ? `${base}-${i + 1}` : base;
    const clash = await t.db.product.findFirst({ where: { slug, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true } });
    if (!clash) return slug;
  }
  throw new EditError("Couldn't find a free address for this product", "invalid");
}

export async function createProduct(t: TenantContext, title: string) {
  t.assert("commerce.manage");
  const name = title.trim().slice(0, 200) || "Untitled product";
  const product = await t.db.product.create({ data: { siteId: t.site.id, title: name, slug: await uniqueSlug(t, name), price: 0 } });
  await t.db.auditLog.create({ data: { userId: t.user.id, action: "product.create", targetId: product.id } });
  return { id: product.id };
}

export async function saveProduct(t: TenantContext, raw: ProductInput) {
  t.assert("commerce.manage");
  const parsed = productInputSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new EditError(issue ? `${issue.path.join(".") ? `${issue.path.join(".")}: ` : ""}${issue.message}` : "Check the product", "invalid");
  }
  const input = parsed.data;
  if (!input.id) throw new EditError("Missing product", "invalid");
  const existing = await t.db.product.findUnique({ where: { id: input.id }, include: { variants: { select: { id: true } } } });
  if (!existing) throw new EditError("This product no longer exists", "not_found");
  if (input.baseUpdatedAt && existing.updatedAt.toISOString() !== input.baseUpdatedAt) {
    throw new EditError("Someone else saved this product while you were editing. Reload to see their changes.", "conflict");
  }

  const slug = input.slug ? slugify(input.slug) : "";
  if (input.slug && !slug) throw new EditError("The address can only use letters, numbers and hyphens", "invalid");
  const finalSlug = slug || (await uniqueSlug(t, input.title, existing.id));
  if (slug && (await t.db.product.findFirst({ where: { slug, id: { not: existing.id } }, select: { id: true } }))) {
    throw new EditError(`Another product already uses /products/${slug}`, "invalid");
  }
  if (input.compareAtPrice !== null && input.compareAtPrice <= input.price) {
    throw new EditError("The compare-at price should be higher than the price", "invalid");
  }

  // Images must be this site's own pictures (the tenant client proves ownership).
  const images = [...new Set(input.images)];
  if (images.length) {
    const found = await t.db.mediaAsset.findMany({ where: { id: { in: images }, mimeType: { startsWith: "image/" } }, select: { id: true } });
    if (found.length !== images.length) throw new EditError("Some images aren't in this site's media library", "invalid");
  }

  // Variants: exactly one per option combination, matched by attributes.
  const combos = variantCombos(input.options);
  const byKey = new Map(input.variants.map((v) => [attributesKey(input.options, v.attributes as VariantAttributes), v]));
  if (input.variants.length !== combos.length || combos.some((c) => !byKey.has(attributesKey(input.options, c.attributes)))) {
    throw new EditError("The variants don't match the options. Regenerate them and try again.", "invalid");
  }
  const ownVariantIds = new Set(existing.variants.map((v) => v.id));
  for (const v of input.variants) if (v.id && !ownVariantIds.has(v.id)) throw new EditError("A variant belongs to another product", "invalid");

  const keep = new Set(input.variants.map((v) => v.id).filter((id): id is string => !!id));
  await t.db.$transaction(async (tx) => {
    await tx.productVariant.deleteMany({ where: { siteId: t.site.id, productId: existing.id, id: { notIn: [...keep] } } });
    for (const [position, combo] of combos.entries()) {
      const v = byKey.get(attributesKey(input.options, combo.attributes))!;
      const data = { title: variantTitle(input.options, combo.attributes), attributes: combo.attributes, price: v.price, sku: v.sku || null, inventory: v.inventory, position };
      if (v.id) await tx.productVariant.update({ where: { id: v.id, siteId: t.site.id }, data });
      else await tx.productVariant.create({ data: { ...data, siteId: t.site.id, productId: existing.id } });
    }
    await tx.product.update({
      where: { id: existing.id, siteId: t.site.id },
      data: {
        title: input.title,
        slug: finalSlug,
        description: input.description,
        images,
        price: input.price,
        compareAtPrice: input.compareAtPrice,
        sku: input.sku || null,
        inventory: input.inventory,
        trackInventory: input.trackInventory,
        isPhysical: input.isPhysical,
        status: input.status,
        options: input.options as Prisma.InputJsonValue,
      },
    });
    await tx.auditLog.create({ data: { siteId: t.site.id, userId: t.user.id, action: "product.save", targetId: existing.id, data: { status: input.status } } });
  });
  updateTag(siteCacheTag(t.site.id));
  const saved = await t.db.product.findUniqueOrThrow({ where: { id: existing.id }, select: { updatedAt: true, slug: true } });
  return { updatedAt: saved.updatedAt.toISOString(), slug: saved.slug };
}

export async function deleteProduct(t: TenantContext, id: string) {
  t.assert("commerce.manage");
  const product = await t.db.product.findUnique({ where: { id }, select: { id: true, title: true } });
  if (!product) throw new EditError("This product no longer exists", "not_found");
  // Past orders keep their own copy of the title, SKU and price.
  await t.db.product.delete({ where: { id } });
  await t.db.auditLog.create({ data: { userId: t.user.id, action: "product.delete", targetId: id, data: { title: product.title } } });
  updateTag(siteCacheTag(t.site.id));
  return {};
}
