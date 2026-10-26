"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/commerce/money";
import type { CommerceData, ProductDetailsProps, PublicProduct } from "@/lib/commerce/types";
import { matchVariant, type VariantAttributes } from "@/lib/commerce/variants";
import { useCart } from "./cart-store";

export function ProductDetails({ props, data, lang, editor, ...rest }: { props: ProductDetailsProps; data?: CommerceData; lang?: string; editor?: boolean } & Record<string, unknown>) {
  const product = data ? (props.productId ? data.products.find((p) => p.id === props.productId) : data.current) : null;
  if (!data || !product) {
    return editor ? (
      <div {...rest} data-empty="">
        <p data-loop-empty="">{props.productId ? "This product isn't available" : "Product details: shows the product on product pages"}</p>
      </div>
    ) : null;
  }
  return <Details key={product.id} product={product} data={data} lang={lang} editor={editor} props={props} rest={rest} />;
}

function Details({ product, data, lang, editor, props, rest }: { product: PublicProduct; data: CommerceData; lang?: string; editor?: boolean; props: ProductDetailsProps; rest: Record<string, unknown> }) {
  const { add } = useCart(data.siteKey, data.currency);
  // Start on the first combination that's in stock.
  const [selection, setSelection] = useState<VariantAttributes>(() => ({ ...(product.variants.find((v) => v.available) ?? product.variants[0])?.attributes }));
  const [quantity, setQuantity] = useState(1);
  const [image, setImage] = useState(0);
  const variant = product.variants.length ? matchVariant(product.variants, product.options, selection) : undefined;
  const price = variant?.price ?? product.price;
  const stock = product.variants.length ? (variant?.stock ?? 0) : product.stock;
  const available = product.variants.length ? !!variant?.available : product.available;
  const money = (n: number) => formatMoney(n, data.currency, lang);
  const Title = props.productId ? "h2" : "h1";
  const cover = product.images[image] ?? product.images[0];

  return (
    <div {...rest} data-product={product.slug}>
      <div data-product-gallery="">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover.src} srcSet={cover.srcSet || undefined} sizes={cover.srcSet ? "(max-width: 767px) 100vw, 50vw" : undefined} alt={cover.alt} width={cover.width} height={cover.height} fetchPriority="high" />
        ) : (
          <span data-no-image="" />
        )}
        {product.images.length > 1 && (
          <ul aria-label="Product images">
            {product.images.map((img, i) => (
              <li key={`${img.assetId}-${i}`}>
                <button type="button" aria-label={`Show image ${i + 1}`} aria-current={i === image ? "true" : undefined} onClick={() => setImage(i)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.src} alt="" width={img.width} height={img.height} loading="lazy" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div data-product-info="">
        <Title>{product.title}</Title>
        <p data-product-price="" aria-live="polite">
          {money(price)}
          {product.compareAtPrice && product.compareAtPrice > price ? <s>{money(product.compareAtPrice)}</s> : null}
        </p>
        {product.description && (
          <div data-product-description="">
            {product.description.split(/\n{2,}/).map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (editor || !available) return;
            add({
              productId: product.id,
              variantId: variant?.id ?? null,
              title: product.title,
              variantTitle: variant?.title ?? null,
              price,
              image: product.images[0]?.src ?? null,
              quantity,
              max: stock,
              href: product.path,
            });
            setQuantity(1);
          }}
        >
          {product.options.map((o) => (
            <label key={o.name} data-option-field="">
              <span>{o.name}</span>
              <select data-option={o.name} value={selection[o.name] ?? ""} onChange={(e) => setSelection({ ...selection, [o.name]: e.target.value })}>
                {o.values.map((value) => {
                  const v = matchVariant(product.variants, product.options, { ...selection, [o.name]: value });
                  return (
                    <option key={value} value={value}>
                      {value}
                      {v && !v.available ? " (sold out)" : ""}
                    </option>
                  );
                })}
              </select>
            </label>
          ))}
          <label data-option-field="">
            <span>Quantity</span>
            <input type="number" data-quantity="" min={1} max={stock ?? 99} value={quantity} onChange={(e) => setQuantity(Math.max(1, Math.min(Number(e.target.value) || 1, stock ?? 99)))} />
          </label>
          <p data-stock="">{!available ? "Sold out" : stock !== null && stock <= 5 ? `Only ${stock} left` : "In stock"}</p>
          <button type="submit" data-add-to-cart={product.slug} disabled={!available}>
            {available ? props.buttonLabel || "Add to cart" : "Sold out"}
          </button>
        </form>
      </div>
    </div>
  );
}
