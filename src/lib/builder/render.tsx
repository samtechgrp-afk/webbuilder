import type { ReactNode } from "react";
import { formatPrice } from "./content";
import { buildCss, nodeClass, type DesignTokens } from "./styles";
import type { BuilderDocument, BuilderNode, ImageValue, LinkValue, PriceValue } from "./types";
import { WIDGETS } from "./widgets";

/**
 * One renderer for the live site and the editor canvas, so what clients edit
 * is pixel-identical to what visitors see. It has no hooks and no client-only
 * code, so the public site renders it as a Server Component (zero JS shipped
 * for static sections). The editor passes `hooks` to add selection and inline
 * editing on top.
 */
export interface RenderHooks {
  /** Extra attributes for a node's root element (selection, lock badges). */
  nodeProps?: (node: BuilderNode) => Record<string, unknown>;
  /** Replaces a text field with an inline editor. */
  text?: (node: BuilderNode, field: string, value: string) => ReactNode;
}

interface RenderOptions {
  doc: BuilderDocument;
  tokens?: DesignTokens;
  hooks?: RenderHooks;
}

export function SiteDocument({ doc, tokens = {}, hooks }: RenderOptions) {
  return (
    <div className="site-root">
      <style dangerouslySetInnerHTML={{ __html: buildCss(doc, tokens) }} />
      <NodeView id={doc.rootId} doc={doc} hooks={hooks} />
    </div>
  );
}

function NodeView({ id, doc, hooks }: { id: string; doc: BuilderDocument; hooks?: RenderHooks }) {
  const node = doc.nodes[id];
  if (!node) return null;
  const def = WIDGETS[node.type];
  const Tag = (node.tag ?? def.defaultTag) as keyof React.JSX.IntrinsicElements;
  const common = {
    className: nodeClass(node.id),
    "data-w": node.type,
    ...hooks?.nodeProps?.(node),
  };
  const text = (field: string) => {
    const value = String(node.props[field] ?? "");
    return hooks?.text ? hooks.text(node, field, value) : value;
  };

  switch (node.type) {
    case "section":
    case "container":
      return (
        <Tag {...common}>
          {(node.children ?? []).map((child) => (
            <NodeView key={child} id={child} doc={doc} hooks={hooks} />
          ))}
        </Tag>
      );
    case "heading":
    case "text":
      return <Tag {...common}>{text("text")}</Tag>;
    case "image": {
      const img = node.props.image as ImageValue | undefined;
      return (
        <div {...common}>
          {img?.src ? (
            // Plain <img>: tenant media is already WebP with explicit
            // dimensions, so there is no layout shift and nothing to optimise.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={img.src}
              alt={img.alt}
              width={img.width}
              height={img.height}
              loading={node.props.priority ? "eager" : "lazy"}
              fetchPriority={node.props.priority ? "high" : undefined}
              decoding="async"
            />
          ) : null}
        </div>
      );
    }
    case "button": {
      const link = node.props.link as LinkValue | undefined;
      return (
        <a
          {...common}
          href={link?.href ?? "#"}
          {...(link?.newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        >
          {link?.label}
        </a>
      );
    }
    case "price": {
      const price = node.props.price as PriceValue | undefined;
      if (!price) return null;
      return (
        <Tag {...common}>
          {formatPrice(price.amount, price.currency)}
          {price.compareAt ? <s>{formatPrice(price.compareAt, price.currency)}</s> : null}
        </Tag>
      );
    }
  }
}
