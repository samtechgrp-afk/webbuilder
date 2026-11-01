import type { CSSProperties, ReactNode } from "react";
import { applyDynamic, baseNodeId, type DynamicData } from "@/lib/cms/binding";
import { formatPrice } from "./content";
import { buildCss, nodeClass, type DesignTokens } from "./styles";
import type { BuilderDocument, BuilderNode, ImageValue, LinkValue, PriceValue, VideoValue } from "./types";
import { WIDGETS, type LanguageSwitcherProps } from "./widgets";
import { SiteIcon } from "./icons";
import { embedUrl, mapEmbedUrl, parseVideoUrl } from "./media";
import { settingValues, type MediaRef } from "./settings";
import { WidgetEnhancer } from "@/components/site/WidgetEnhancer";
import { CartWidget } from "@/components/commerce/CartWidget";
import { ProductDetails } from "@/components/commerce/ProductDetails";
import { ProductGrid } from "@/components/commerce/ProductGrid";
import type { CartProps, CommerceData, ProductDetailsProps, ProductGridProps } from "@/lib/commerce/types";

/**
 * One renderer for the live site and the editor canvas, so what clients edit
 * is pixel-identical to what visitors see. It has no hooks and no client-only
 * code, so the public site renders it as a Server Component (zero JS shipped
 * for static sections). Only the shop widgets (product grid, product details,
 * cart) are Client Components, so only pages that use them ship their JS. The editor passes `hooks` to add selection and inline
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
  /** Products and shop settings for the commerce widgets. */
  commerce?: CommerceData;
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

export function SiteDocument({ doc, tokens = {}, hooks, data, editor, linkBase = "", lang, languages, commerce }: RenderOptions) {
  // Styles come from the template document; loop copies reuse the original's class.
  const view = data ? applyDynamic(doc, data, { editor }) : doc;
  const ctx: Ctx = { doc: view, hooks, linkBase, languages, editor, lang, commerce };
  return (
    <div className="site-root" lang={lang || undefined}>
      <style dangerouslySetInnerHTML={{ __html: buildCss(doc, tokens) }} />
      <NodeView id={view.rootId} ctx={ctx} />
      {!editor && needsEnhancer(view) ? <WidgetEnhancer /> : null}
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
  commerce?: CommerceData;
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

/**
 * The small script behind lightboxes (and later counters, carousels, forms).
 * Pages without such widgets ship none of it; without JavaScript (or in a
 * static export) each widget still works in a simpler form.
 */
function needsEnhancer(doc: BuilderDocument) {
  return Object.values(doc.nodes).some((n) => (n.type === "image" || n.type === "gallery") && n.props.lightbox === true);
}

type Vars = CSSProperties & Record<`--${string}`, string | number | undefined>;

/** An empty string means "inherit"; React drops undefined style values. */
const css = (v: unknown) => (typeof v === "string" && v ? v : undefined);

const DIVIDER_SHAPES: Record<string, string> = {
  wave: "M0,60 C150,120 350,0 600,60 C850,120 1050,0 1200,60 L1200,120 L0,120 Z",
  curve: "M0,120 Q600,-40 1200,120 Z",
  tilt: "M0,120 L1200,0 L1200,120 Z",
  triangle: "M0,120 L600,0 L1200,120 Z",
  zigzag: `M0,120 ${Array.from({ length: 13 }, (_, i) => `L${i * 100},${i % 2 ? 40 : 100}`).join(" ")} L1200,120 Z`,
  mountains: "M0,120 L0,90 L200,40 L380,90 L600,10 L820,80 L1000,30 L1200,100 L1200,120 Z",
};

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
  const set = settingValues(def.settings, node);
  // Iframes would swallow clicks on the canvas, so the element couldn't be selected.
  const frameStyle: CSSProperties | undefined = ctx.editor ? { pointerEvents: "none" } : undefined;

  switch (node.type) {
    case "section":
    case "container": {
      const bg = typeof node.props.__bg === "string" ? node.props.__bg : null;
      const style: CSSProperties | undefined = bg
        ? { backgroundImage: `url("${bg}")`, backgroundSize: "cover", backgroundPosition: "center" }
        : undefined;
      const video = set.bgVideo as MediaRef | null;
      const overlay = css(set.overlay);
      if (!video?.src && !overlay) {
        return (
          <Tag {...common} style={style}>
            {kids()}
          </Tag>
        );
      }
      return (
        <Tag {...common} style={style} data-backdrop="">
          {video?.src ? <video data-bg-layer="" src={video.src} autoPlay muted loop playsInline preload="metadata" aria-hidden="true" /> : null}
          {overlay ? <span data-bg-layer="" data-overlay="" aria-hidden="true" style={{ background: overlay, opacity: Number(set.overlayOpacity) / 100 }} /> : null}
          {kids()}
        </Tag>
      );
    }
    case "spacer":
      return <div {...common} aria-hidden="true" />;
    case "divider": {
      const shape = String(set.shape);
      const color = css(set.color);
      if (shape === "line" || !DIVIDER_SHAPES[shape]) {
        const vars: Vars = { "--wb-line": `${set.thickness}px ${set.lineStyle} ${color ?? "var(--color-border, rgba(0,0,0,.15))"}`, "--wb-len": `${set.length}%` };
        return (
          <div {...common} role="separator" data-shape="line" data-align={set.align as string} style={vars}>
            <span />
          </div>
        );
      }
      const flip = [set.flip ? "scaleX(-1)" : "", set.invert ? "scaleY(-1)" : ""].filter(Boolean).join(" ");
      return (
        <div {...common} role="separator" data-shape={shape} style={{ color }}>
          <svg viewBox="0 0 1200 120" preserveAspectRatio="none" width="100%" height={Number(set.shapeHeight)} aria-hidden="true" style={flip ? { transform: flip } : undefined}>
            <path d={DIVIDER_SHAPES[shape]} fill="currentColor" />
          </svg>
        </div>
      );
    }
    case "prose": {
      const html = typeof node.props.html === "string" ? node.props.html : "";
      const cols = Number(set.columns);
      const attrs = { ...common, "data-dropcap": set.dropCap ? "" : undefined, "data-cols": cols > 1 ? "" : undefined, style: cols > 1 ? ({ "--wb-cols": cols } as Vars) : undefined };
      // Sanitised to the rich text allowlist on every write (content-service, translations).
      return html ? <Tag {...attrs} dangerouslySetInnerHTML={{ __html: html }} /> : <Tag {...attrs} data-empty="" />;
    }
    case "video": {
      const v = node.props.video as VideoValue | undefined;
      const opts = { autoplay: !!set.autoplay, loop: !!set.loop, controls: set.controls !== false, muted: !!set.muted };
      const parsed = v?.assetId ? (v.src ? ({ kind: "file", src: v.src } as const) : null) : parseVideoUrl(v?.src ?? "");
      if (!parsed) return <div {...common} data-empty="" />;
      if (parsed.kind === "file") {
        return (
          <div {...common}>
            <video src={parsed.src} controls={opts.controls} autoPlay={opts.autoplay} muted={opts.autoplay || opts.muted} loop={opts.loop} playsInline preload="metadata" style={frameStyle} />
          </div>
        );
      }
      return (
        <div {...common}>
          <iframe
            src={embedUrl(parsed, opts)}
            title={parsed.kind === "youtube" ? "YouTube video" : "Vimeo video"}
            loading="lazy"
            allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            style={frameStyle}
          />
        </div>
      );
    }
    case "icon": {
      const shape = String(set.shape);
      return (
        <Tag {...common} data-shape={shape !== "none" ? shape : undefined} data-hover={set.hover !== "none" ? (set.hover as string) : undefined} style={shape !== "none" ? ({ "--wb-icon-bg": css(set.backdrop) } as Vars) : undefined}>
          <SiteIcon name={String(node.props.icon ?? "")} size={Number(set.size)} strokeWidth={Number(set.strokeWidth)} />
        </Tag>
      );
    }
    case "iconbox": {
      const TitleTag = String(set.titleTag) as "h3";
      return (
        <Tag {...common} data-layout={set.layout as string} data-hover={set.hover !== "none" ? (set.hover as string) : undefined}>
          {node.props.icon ? (
            <span data-iconbox-icon="" style={{ color: css(set.iconColor) }}>
              <SiteIcon name={String(node.props.icon)} size={Number(set.iconSize)} />
            </span>
          ) : null}
          <div data-iconbox-body="">
            {node.props.title ? <TitleTag>{String(node.props.title)}</TitleTag> : null}
            {node.props.text ? <p>{String(node.props.text)}</p> : null}
          </div>
        </Tag>
      );
    }
    case "map": {
      const address = String(node.props.address ?? "").trim();
      if (!address) return <div {...common} data-empty="" />;
      return (
        <div {...common} data-tone={set.tone !== "color" ? (set.tone as string) : undefined}>
          <iframe src={mapEmbedUrl(address, Number(set.zoom), String(set.mapType))} title={`Map of ${address}`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" style={frameStyle} />
          {set.pin ? (
            <span data-map-pin="" style={{ color: css(set.pinColor) }}>
              <SiteIcon name={String(set.pin)} size={40} strokeWidth={2} />
            </span>
          ) : null}
        </div>
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
      const masonry = set.layout === "masonry";
      const group = baseNodeId(node.id);
      return (
        <Tag {...common} data-layout={masonry ? "masonry" : undefined} style={masonry ? ({ "--wb-cols": Number(set.columns) } as Vars) : undefined}>
          {images.filter((img) => img?.src).map((img, i) => (
            <figure key={`${img.assetId}-${i}`}>
              {set.lightbox ? (
                <a href={img.src} data-lightbox={group} aria-label={img.alt ? `Open ${img.alt}` : `Open image ${i + 1}`}>
                  <Img img={img} sizes="(max-width: 767px) 50vw, 33vw" />
                </a>
              ) : (
                <Img img={img} sizes="(max-width: 767px) 50vw, 33vw" />
              )}
            </figure>
          ))}
        </Tag>
      );
    }
    case "heading":
      if (set.gradient) {
        const grad: Vars = { "--wb-grad": `linear-gradient(${Number(set.gradientAngle)}deg, ${css(set.gradientFrom) ?? "currentColor"}, ${css(set.gradientTo) ?? "currentColor"})` };
        return (
          <Tag {...common} data-gradient="" style={grad}>
            {text("text")}
          </Tag>
        );
      }
      return <Tag {...common}>{text("text")}</Tag>;
    case "text":
      return <Tag {...common}>{text("text")}</Tag>;
    case "langswitch":
      return <LanguageSwitcher common={common} Tag={Tag} props={node.props as Partial<LanguageSwitcherProps>} languages={ctx.languages} editor={ctx.editor} />;
    case "image": {
      const img = node.props.image as ImageValue | undefined;
      if (!img?.src) return <div {...common} />;
      const picture = <Img img={img} priority={!!node.props.priority} />;
      return (
        <div {...common}>
          {set.lightbox ? (
            <a href={img.src} data-lightbox={baseNodeId(node.id)} aria-label={img.alt ? `Open ${img.alt}` : "Open image"}>
              {picture}
            </a>
          ) : (
            picture
          )}
          {set.caption && img.alt ? <span data-caption="">{img.alt}</span> : null}
        </div>
      );
    }
    case "button": {
      const link = node.props.link as LinkValue | undefined;
      const icon = set.icon ? <SiteIcon name={String(set.icon)} /> : null;
      return (
        <a
          {...common}
          href={withBase(link?.href ?? "#", linkBase)}
          {...(link?.newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          {...(set.hover !== "lift" ? { "data-hover": String(set.hover) } : {})}
        >
          {icon && set.iconPosition === "before" ? icon : null}
          {link?.label}
          {icon && set.iconPosition !== "before" ? icon : null}
        </a>
      );
    }
    case "productgrid":
      return <ProductGrid {...common} props={node.props as unknown as ProductGridProps} data={ctx.commerce} lang={ctx.lang} editor={ctx.editor} />;
    case "product":
      return <ProductDetails {...common} props={node.props as unknown as ProductDetailsProps} data={productData(ctx.commerce, node.props.productId)} lang={ctx.lang} editor={ctx.editor} />;
    case "cart": {
      const c = ctx.commerce;
      // Hidden on sites without a shop; only what the cart needs crosses to the browser.
      const shop = c && (c.products.length || c.checkout) ? { siteKey: c.siteKey, currency: c.currency, checkout: c.checkout, linkBase: c.linkBase } : undefined;
      return <CartWidget {...common} props={node.props as unknown as CartProps} shop={shop} lang={ctx.lang} editor={ctx.editor} />;
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

/** A product widget only needs its own product, not the whole catalog. */
function productData(c: CommerceData | undefined, productId: unknown): CommerceData | undefined {
  if (!c) return undefined;
  const product = typeof productId === "string" ? c.products.find((p) => p.id === productId) : c.current;
  return { ...c, products: product && typeof productId === "string" ? [product] : [], current: typeof productId === "string" ? null : (c.current ?? null) };
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
