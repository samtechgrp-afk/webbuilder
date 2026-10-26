"use client";

import { formatMoney } from "@/lib/commerce/money";
import { fromPrice } from "@/lib/commerce/storefront";
import type { CommerceData, PublicProduct } from "@/lib/commerce/types";
import { useCart } from "./cart-store";

export function ProductCard({ product, data, lang, buttonLabel, editor }: { product: PublicProduct; data: CommerceData; lang?: string; buttonLabel: string; editor?: boolean }) {
  const { add } = useCart(data.siteKey, data.currency);
  const href = `${data.linkBase}${product.path}`;
  const cover = product.images[0];
  const money = (n: number) => formatMoney(n, data.currency, lang);
  const simple = !product.variants.length;
  return (
    <article data-product-card={product.slug}>
      <a href={href} data-product-link="" tabIndex={-1} aria-hidden="true">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover.src} srcSet={cover.srcSet || undefined} sizes={cover.srcSet ? "(max-width: 767px) 100vw, 33vw" : undefined} alt="" width={cover.width} height={cover.height} loading="lazy" decoding="async" />
        ) : (
          <span data-no-image="" />
        )}
      </a>
      <h3>
        <a href={href}>{product.title}</a>
      </h3>
      <p data-card-price="">
        {!simple && product.variants.some((v) => v.price !== product.variants[0].price) ? <span>From </span> : null}
        {money(fromPrice(product))}
        {product.compareAtPrice && simple ? <s>{money(product.compareAtPrice)}</s> : null}
      </p>
      {!product.available ? (
        <p data-sold-out="">Sold out</p>
      ) : simple ? (
        <button
          type="button"
          data-add-to-cart={product.slug}
          onClick={() => {
            if (editor) return;
            add({ productId: product.id, variantId: null, title: product.title, variantTitle: null, price: product.price, image: cover?.src ?? null, quantity: 1, max: product.stock, href: product.path });
          }}
        >
          {buttonLabel}
        </button>
      ) : (
        <a href={href} data-choose-options="" role="button">
          Choose options
        </a>
      )}
    </article>
  );
}
