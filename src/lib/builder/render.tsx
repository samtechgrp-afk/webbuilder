import type { CSSProperties, ReactNode } from "react";
import { applyDynamic, baseNodeId, type DynamicData } from "@/lib/cms/binding";
import { formatPrice } from "./content";
import { buildCss, nodeClass, type DesignTokens } from "./styles";
import type { BuilderDocument, BuilderNode, ImageValue, LinkValue, PriceValue } from "./types";
import { WIDGETS, type LanguageSwitcherProps } from "./widgets";

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
  /** Dynamic data for bindings and loop grids. Without it, bound widgets show their stored values. */
  data?: DynamicData;
  /** Canvas mode: empty bindings show their source name, empty loops keep their card. */
  editor?: boolean;
  /**
   * Prefix for site-relative links. "/sites/aurelia" when the site is served
   * under the platform path, "" on its own domain.
   */
  linkBase?: string;
  /** Language of the content (the wrapper's `lang`). */
  lang?: string;
  /** The current page in each of the site's languages, for language switchers. */
  languages?: LanguageLink[];
}

/** One entry of a language switcher. `href` is final (prefix or domain already applied). */
export interface LanguageLink {
  code: string;
  label: string;
  href: string;
  current: boolean;
  /** This page exists in that language (otherwise the link goes to that language's home). */
  translated: boolean;
}

export function SiteDocument({ doc, tokens = {}, hooks, data, editor, linkBase = "", lang, languages }: RenderOptions) {
  // Styles come from the template document; loop copies reuse the original's class.
  const view = data ? applyDynamic(doc, data, { editor }) : doc;
  const ctx: Ctx = { doc: view, hooks, linkBase, languages, editor, lang };
  return (
    <div className="site-root" lang={lang || undefined}>
      <style dangerouslySetInnerHTML={{ __html: buildCss(doc, tokens) }} />
      <NodeView id={view.rootId} ctx={ctx} />
    </div>
  );
}

interface Ctx {
  doc: BuilderDocument;
  hooks?: RenderHooks;
  linkBase: string;
  languages?: LanguageLink[];
  editor?: boolean;
  /** Formats prices the way readers of this language expect. */
  lang?: string;
}

const withBase = (href: string, base: string) => (base && /^\/(?!\/)/.test(href) ? `${base}${href === "/" ? "" : href}` || "/" : href);

function Img({ img, priority, sizes }: { img: ImageValue; priority?: boolean; sizes?: string }) {
  // Plain <img>: tenant media is already WebP with explicit dimensions and
  // responsive variants, so there is no layout shift and nothing to optimise.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={img.src}
      srcSet={img.srcSet || undefined}
      sizes={img.srcSet ? sizes ?? "100vw" : undefined}
      alt={img.alt}
      width={img.width}
      height={img.height}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      decoding="async"
    />
  );
}

function NodeView({ id, ctx }: { id: string; ctx: Ctx }) {
  const { doc, hooks, linkBase } = ctx;
  const node = doc.nodes[id];
  if (!node) return null;
  const def = WIDGETS[node.type];
  const Tag = (node.tag ?? def.defaultTag) as keyof React.JSX.IntrinsicElements;
  const common = {
    className: nodeClass(baseNodeId(node.id)),
    "data-w": node.type,
    ...hooks?.nodeProps?.(node),
  };
  const text = (field: string) => {
    const value = String(node.props[field] ?? "");
    return hooks?.text ? hooks.text(node, field, value) : value;
  };
  const kids = () => (node.children ?? []).map((child) => <NodeView key={child} id={child} ctx={ctx} />);

  switch (node.type) {
    case "section":
    case "container": {
      const bg = typeof node.props.__bg === "string" ? node.props.__bg : null;
      const style: CSSProperties | undefined = bg
        ? { backgroundImage: `url("${bg}")`, backgroundSize: "cover", backgroundPosition: "center" }
        : undefined;
      return (
        <Tag {...common} style={style}>
          {kids()}
        </Tag>
      );
    }
    case "loop":
      return (
        <Tag {...common}>
          {kids()}
          {node.props.__empty && !node.children?.length ? <p data-loop-empty="">{String(node.props.emptyText ?? "Nothing here yet.")}</p> : null}
        </Tag>
      );
    case "richtext": {
      const html = typeof node.props.html === "string" ? node.props.html : "";
      // Server-sanitised on write (src/server/sanitize.ts) and only ever set by applyDynamic.
      return html ? <Tag {...common} dangerouslySetInnerHTML={{ __html: html }} /> : <Tag {...common} data-empty="" />;
    }
    case "gallery": {
      const images = (node.props.images as ImageValue[] | undefined) ?? [];
      return (
        <Tag {...common}>
          {images.filter((img) => img?.src).map((img, i) => (
            <figure key={`${img.assetId}-${i}`}>
              <Img img={img} sizes="(max-width: 767px) 50vw, 33vw" />
            </figure>
          ))}
        </Tag>
      );
    }
    case "heading":
    case "text":
      return <Tag {...common}>{text("text")}</Tag>;
    case "langswitch":
      return <LanguageSwitcher common={common} Tag={Tag} props={node.props as Partial<LanguageSwitcherProps>} languages={ctx.languages} editor={ctx.editor} />;
    case "image": {
      const img = node.props.image as ImageValue | undefined;
      return <div {...common}>{img?.src ? <Img img={img} priority={!!node.props.priority} /> : null}</div>;
    }
    case "button": {
      const link = node.props.link as LinkValue | undefined;
      return (
        <a
          {...common}
          href={withBase(link?.href ?? "#", linkBase)}
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
          {formatPrice(price.amount, price.currency, ctx.lang)}
          {price.compareAt ? <s>{formatPrice(price.compareAt, price.currency, ctx.lang)}</s> : null}
        </Tag>
      );
    }
  }
}

function LanguageSwitcher({ common, Tag, props, languages, editor }: { common: Record<string, unknown>; Tag: keyof React.JSX.IntrinsicElements; props: Partial<LanguageSwitcherProps>; languages?: LanguageLink[]; editor?: boolean }) {
  if (!languages || languages.length < 2) {
    // A single-language site shows nothing to visitors; the canvas keeps a placeholder to select.
    return editor ? <Tag {...common} data-empty="" aria-label="Language switcher (add a second language in Settings)" /> : null;
  }
  const name = (l: LanguageLink) => (props.display === "code" ? l.code.split("-")[0].toUpperCase() : l.label);
  const list = (
    <ul>
      {languages.map((l) => (
        <li key={l.code}>
          <a href={l.href} hrefLang={l.code} lang={l.code} aria-current={l.current ? "true" : undefined} data-lang={l.code}>
            {name(l)}
          </a>
        </li>
      ))}
    </ul>
  );
  const current = languages.find((l) => l.current) ?? languages[0];
  return (
    <Tag {...common} aria-label="Language">
      {props.variant === "dropdown" ? (
        <details>
          <summary>{name(current)}</summary>
          {list}
        </details>
      ) : (
        list
      )}
    </Tag>
  );
}
