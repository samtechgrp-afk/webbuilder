"use client";

import { useState } from "react";
import { gridProducts } from "@/lib/commerce/storefront";
import type { CommerceData, ProductGridProps } from "@/lib/commerce/types";
import { ProductCard } from "./ProductCard";

const SORT_LABELS: Record<ProductGridProps["sort"], string> = {
  newest: "Newest",
  "price-asc": "Price: low to high",
  "price-desc": "Price: high to low",
  title: "Name",
};

export function ProductGrid({ props, data, lang, editor, ...rest }: { props: ProductGridProps; data?: CommerceData; lang?: string; editor?: boolean } & Record<string, unknown>) {
  const [sort, setSort] = useState(props.sort);
  // The designer's choice changes in the canvas; follow it.
  const [designed, setDesigned] = useState(props.sort);
  if (designed !== props.sort) {
    setDesigned(props.sort);
    setSort(props.sort);
  }
  const products = data ? gridProducts(data.products, { ...props, sort }) : [];
  if (!data || !products.length) {
    return editor ? (
      <div {...rest} data-empty="">
        <p data-loop-empty="">{data ? "Products you mark Active show up here." : "Product grid"}</p>
      </div>
    ) : null;
  }
  return (
    <div {...rest}>
      {props.showSort && (
        <label data-grid-sort="">
          <span>Sort by</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as ProductGridProps["sort"])}>
            {Object.entries(SORT_LABELS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </label>
      )}
      {products.map((p) => (
        <ProductCard key={p.id} product={p} data={data} lang={lang} buttonLabel={props.buttonLabel || "Add to cart"} editor={editor} />
      ))}
    </div>
  );
}
