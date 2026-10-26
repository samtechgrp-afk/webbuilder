import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenant } from "@/lib/tenant";
import { getProduct } from "@/server/commerce/product-service";
import { readStore } from "@/server/commerce/store-service";
import type { VariantAttributes } from "@/lib/commerce/variants";
import { ProductForm } from "./ProductForm";

export const metadata: Metadata = { title: "Edit product" };

export default async function ProductPage({ params }: PageProps<"/admin/sites/[siteId]/products/[productId]">) {
  const { siteId, productId } = await params;
  const t = await getTenant(siteId);
  if (!t.can("commerce.manage")) notFound();
  const product = await getProduct(t, productId);
  if (!product) notFound();
  const [{ currency }, assets, sold] = await Promise.all([
    readStore(t.site.id),
    t.db.mediaAsset.findMany({
      where: { mimeType: { startsWith: "image/" } },
      orderBy: { createdAt: "desc" },
      select: { id: true, url: true, title: true, altText: true, originalName: true, mimeType: true, width: true, height: true, sizeBytes: true },
    }),
    t.db.orderItem.aggregate({ where: { productId: product.id, order: { status: { in: ["PAID", "FULFILLED"] } } }, _sum: { quantity: true } }),
  ]);

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <nav className="mb-2 text-sm text-zinc-500">
        <Link href={`/admin/sites/${t.site.id}/products`} className="hover:text-zinc-900">Products</Link> /
      </nav>
      <ProductForm
        siteId={t.site.id}
        liveBase={`/sites/${t.site.subdomain}`}
        currency={currency}
        sold={sold._sum.quantity ?? 0}
        assets={assets}
        canUpload={t.can("media.upload")}
        initial={{
          id: product.id,
          updatedAt: product.updatedAt.toISOString(),
          title: product.title,
          slug: product.slug,
          description: product.description,
          images: product.images,
          price: product.price,
          compareAtPrice: product.compareAtPrice,
          sku: product.sku,
          inventory: product.inventory,
          trackInventory: product.trackInventory,
          isPhysical: product.isPhysical,
          status: product.status,
          options: product.options,
          variants: product.variants.map((v) => ({ id: v.id, attributes: v.attributes as VariantAttributes, price: v.price, sku: v.sku, inventory: v.inventory })),
        }}
      />
    </main>
  );
}
