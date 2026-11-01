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
  return Object.values(doc.nodes).some(
    (n) =>
      ((n.type === "image" || n.type === "gallery") && n.props.lightbox === true) ||
      n.type === "carousel" ||
      (n.type === "countdown" && typeof n.props.target === "string" && !!n.props.target) ||
      (n.type === "counter" && n.props.duration !== 0),
  );
}

type Item = Record<string, unknown>;
const items = (v: unknown): Item[] => (Array.isArray(v) ? v.filter((x): x is Item => !!x && typeof x === "object") : []);
const str = (v: unknown) => (typeof v === "string" ? v : "");
const hasLink = (l: unknown): l is LinkValue => !!l && typeof l === "object" && !!(l as LinkValue).label && !!(l as LinkValue).href;

/** Prices on pricing tables drop ".00" for whole amounts ("$49", "$49.50"). */
function planPrice(amount: number, currency: string, lang?: string) {
  const whole = Number.isInteger(amount);
  try {
    return new Intl.NumberFormat(lang || "en-US", { style: "currency", currency, minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return formatPrice(amount, currency, lang);
  }
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** "2026-12-31T23:59" → "31 December 2026, 23:59", without time zone conversion (the server's zone isn't the visitor's). */
function readableDate(v: string) {
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  return m ? `${+m[3]} ${MONTHS[+m[2] - 1] ?? ""} ${m[1]}, ${m[4]}:${m[5]}` : v;
}

const COUNTDOWN_UNITS: Record<string, [string, string][]> = {
  dhms: [["d", "Days"], ["h", "Hours"], ["m", "Minutes"], ["s", "Seconds"]],
  dhm: [["d", "Days"], ["h", "Hours"], ["m", "Minutes"]],
  hms: [["h", "Hours"], ["m", "Minutes"], ["s", "Seconds"]],
};

function Stars({ value, color }: { value: number; color?: string }) {
  const n = Math.max(0, Math.min(5, Math.round(value)));
  return (
    <div data-stars="" role="img" aria-label={`${n} out of 5 stars`} style={{ color }}>
      {Array.from({ length: 5 }, (_, i) => (
        <svg key={i} viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" data-on={i < n ? "" : undefined}>
          <path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" fill="currentColor" />
        </svg>
      ))}
    </div>
  );
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
    case "accordion": {
      const list = items(node.props.items);
      const TitleTag = String(set.titleTag) as "h3";
      const group = set.mode === "single" && !ctx.editor ? `acc-${baseNodeId(node.id)}` : undefined;
      return (
        <Tag {...common} data-marker={set.marker as string}>
          {list.map((it, i) => (
            // `name` makes the panels exclusive natively (one open at a time), no script needed.
            <details key={i} name={group} open={ctx.editor || (i === 0 && !!set.firstOpen) || undefined}>
              <summary>
                <TitleTag>{str(it.title)}</TitleTag>
                <span data-acc-marker="" aria-hidden="true" />
              </summary>
              <div data-acc-body="">{str(it.body)}</div>
            </details>
          ))}
        </Tag>
      );
    }
    case "tabs": {
      const list = items(node.props.items).slice(0, 12);
      const base = `tabs-${baseNodeId(node.id)}`;
      // Radio buttons drive the panels with CSS alone: works without JavaScript, arrow keys switch tabs.
      return (
        <Tag {...common} data-orientation={set.orientation as string} data-look={set.look as string}>
          <div data-tablist="">
            {list.map((it, i) => (
              <span key={i} data-tab="">
                <input type="radio" name={base} id={`${base}-${i}`} defaultChecked={i === 0} />
                <label htmlFor={`${base}-${i}`}>{str(it.label) || `Tab ${i + 1}`}</label>
              </span>
            ))}
          </div>
          <div data-tab-panels="">
            {list.map((it, i) => (
              <div key={i} data-tab-panel="" aria-labelledby={`${base}-${i}`}>
                {str(it.title) ? <h3>{str(it.title)}</h3> : null}
                {str(it.body) ? <p>{str(it.body)}</p> : null}
              </div>
            ))}
          </div>
        </Tag>
      );
    }
    case "carousel": {
      const list = items(node.props.items);
      const vars: Vars = { "--wb-per": Number(set.perView), "--wb-aspect": String(set.aspect) };
      return (
        <Tag
          {...common}
          data-text={set.textPosition as string}
          data-autoplay={set.autoplay ? Number(set.interval) * 1000 : undefined}
          data-loop={set.loop ? "" : undefined}
          style={vars}
          aria-roledescription="carousel"
          aria-label={node.name ?? "Slides"}
        >
          <div data-track="" tabIndex={0}>
            {list.map((it, i) => {
              const img = it.image as ImageValue | undefined;
              return (
                <div key={i} data-slide="" role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${list.length}`}>
                  <div data-slide-media="">{img?.src ? <Img img={img} priority={i === 0 && !!node.props.priority} sizes={`(max-width: 767px) 100vw, ${Math.round(100 / Number(set.perView))}vw`} /> : null}</div>
                  {str(it.title) || str(it.text) || hasLink(it.link) ? (
                    <div data-slide-text="">
                      {str(it.title) ? <h3>{str(it.title)}</h3> : null}
                      {str(it.text) ? <p>{str(it.text)}</p> : null}
                      {hasLink(it.link) ? (
                        <a href={withBase(it.link.href, linkBase)} data-slide-link="" {...(it.link.newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
                          {it.link.label}
                        </a>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
          {set.arrows && list.length > 1 ? (
            <>
              <button type="button" data-prev="" aria-label="Previous slide">
                <SiteIcon name="chevron-left" />
              </button>
              <button type="button" data-next="" aria-label="Next slide">
                <SiteIcon name="chevron-right" />
              </button>
            </>
          ) : null}
          {set.dots && list.length > 1 ? (
            <div data-dots="">
              {list.map((_, i) => (
                <button key={i} type="button" data-dot={i} aria-label={`Go to slide ${i + 1}`} />
              ))}
            </div>
          ) : null}
        </Tag>
      );
    }
    case "testimonial": {
      const avatar = node.props.avatar as ImageValue | undefined;
      const Cap = (Tag === "figure" ? "figcaption" : "div") as "div";
      const rating = Number(node.props.rating ?? 0);
      return (
        <Tag {...common} data-layout={set.layout as string}>
          {set.showRating && rating > 0 ? <Stars value={rating} color={css(set.starColor)} /> : null}
          <blockquote>
            <p>{str(node.props.quote)}</p>
          </blockquote>
          <Cap data-cite="">
            {avatar?.src ? <Img img={avatar} sizes="64px" /> : null}
            <span>
              {str(node.props.name) ? <strong>{str(node.props.name)}</strong> : null}
              {str(node.props.role) ? <span>{str(node.props.role)}</span> : null}
            </span>
          </Cap>
        </Tag>
      );
    }
    case "pricing": {
      const price = node.props.price as PriceValue | undefined;
      const features = items(node.props.features);
      const link = node.props.link;
      return (
        <Tag {...common} data-featured={set.featured ? "" : undefined} style={{ "--wb-accent": css(set.accent) } as Vars}>
          {str(node.props.ribbon) ? <span data-ribbon="">{str(node.props.ribbon)}</span> : null}
          <h3 data-plan="">{str(node.props.plan)}</h3>
          {price ? (
            <p data-plan-price="">
              <strong>{planPrice(price.amount, price.currency, ctx.lang)}</strong>
              {str(node.props.period) ? <span>{str(node.props.period)}</span> : null}
              {price.compareAt ? <s>{planPrice(price.compareAt, price.currency, ctx.lang)}</s> : null}
            </p>
          ) : null}
          {str(node.props.description) ? <p data-plan-desc="">{str(node.props.description)}</p> : null}
          {features.length ? (
            <ul data-features="">
              {features.map((f, i) => (
                <li key={i} data-included={f.included === false ? undefined : ""} data-excluded={f.included === false ? "" : undefined}>
                  <SiteIcon name={f.included === false ? "x" : "check"} strokeWidth={2.25} />
                  <span>{str(f.text)}</span>
                  {f.included === false ? <span data-sr="">(not included)</span> : null}
                </li>
              ))}
            </ul>
          ) : null}
          {hasLink(link) ? (
            <a href={withBase(link.href, linkBase)} data-plan-cta="" {...(link.newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
              {link.label}
            </a>
          ) : null}
        </Tag>
      );
    }
    case "countdown": {
      const target = str(node.props.target);
      const units = COUNTDOWN_UNITS[String(set.units)] ?? COUNTDOWN_UNITS.dhms;
      if (!target) return ctx.editor ? <div {...common} data-empty="" aria-label="Countdown (pick a date under Content)" /> : null;
      return (
        <div
          {...common}
          data-target={target}
          data-tz={set.timezone as string}
          data-on-done={set.onDone as string}
          data-done-text={str(node.props.doneText) || undefined}
          data-look={set.look as string}
          // The canvas has no ticking script: show the boxes with placeholders so the design is visible.
          data-ready={ctx.editor ? "" : undefined}
          role="timer"
          aria-live="off"
        >
          {units.map(([key, label]) => (
            <span key={key} data-cd-unit={key}>
              <span data-cd-num="">00</span>
              <span data-cd-label="">{label}</span>
            </span>
          ))}
          <p data-cd-fallback="">
            Ends <time dateTime={target}>{readableDate(target)}</time>
          </p>
          <p data-cd-done="">{str(node.props.doneText)}</p>
        </div>
      );
    }
    case "flipbox": {
      const link = node.props.link;
      return (
        <Tag {...common} data-dir={set.direction as string} tabIndex={ctx.editor ? undefined : 0}>
          <div data-flip-inner="">
            <div data-flip-front="" style={{ background: css(set.frontBg) }}>
              {node.props.icon ? <SiteIcon name={String(node.props.icon)} size={40} /> : null}
              {str(node.props.title) ? <h3>{str(node.props.title)}</h3> : null}
              {str(node.props.text) ? <p>{str(node.props.text)}</p> : null}
            </div>
            <div data-flip-back="" style={{ background: css(set.backBg), color: css(set.backColor) }}>
              {str(node.props.backTitle) ? <h3>{str(node.props.backTitle)}</h3> : null}
              {str(node.props.backText) ? <p>{str(node.props.backText)}</p> : null}
              {hasLink(link) ? (
                <a href={withBase(link.href, linkBase)} data-flip-link="" {...(link.newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
                  {link.label}
                </a>
              ) : null}
            </div>
          </div>
        </Tag>
      );
    }
    case "cta": {
      const img = node.props.image as ImageValue | undefined;
      const layout = String(set.layout);
      const showImage = layout !== "plain" && !!img?.src;
      const links = [node.props.link, node.props.link2].filter(hasLink);
      return (
        <Tag {...common} data-layout={layout} data-align={set.align as string} data-has-image={showImage ? "" : undefined}>
          {showImage ? (
            <div data-cta-media="">
              <Img img={img!} sizes={layout === "split" ? "(max-width: 767px) 100vw, 50vw" : "100vw"} />
            </div>
          ) : null}
          {showImage && layout === "overlay" && css(set.overlay) ? <span data-cta-overlay="" aria-hidden="true" style={{ background: css(set.overlay) }} /> : null}
          <div data-cta-body="">
            {str(node.props.title) ? <h2>{str(node.props.title)}</h2> : null}
            {str(node.props.text) ? <p>{str(node.props.text)}</p> : null}
            {links.length ? (
              <div data-cta-actions="">
                {links.map((l, i) => (
                  <a key={i} href={withBase(l.href, linkBase)} data-cta-button={i === 0 ? "primary" : "secondary"} {...(l.newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
                    {l.label}
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        </Tag>
      );
    }
    case "progress": {
      const value = Math.max(0, Math.min(100, Number(node.props.value ?? 0)));
      const label = str(node.props.label);
      const vars: Vars = { "--wb-bar": css(set.barColor), "--wb-track": css(set.trackColor), "--wb-h": `${Number(set.thickness)}px` };
      return (
        <div {...common} data-animate={set.animate ? "" : undefined} style={vars}>
          {label || set.showValue ? (
            <div data-progress-head="">
              <span>{label}</span>
              {set.showValue ? <span data-progress-value="">{value}%</span> : null}
            </div>
          ) : null}
          <div data-progress-track="" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={label || "Progress"}>
            <span data-progress-fill="" style={{ width: `${value}%` }} />
          </div>
        </div>
      );
    }
    case "counter": {
      const value = Number(node.props.value ?? 0);
      const decimals = Number(set.decimals);
      const shown = value.toLocaleString(ctx.lang || "en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: !!set.separator });
      return (
        <div {...common} data-count-to={value} data-decimals={decimals} data-sep={set.separator ? "" : undefined} data-duration={Number(set.duration)}>
          <p data-counter-number="">
            {str(node.props.prefix) ? <span>{str(node.props.prefix)}</span> : null}
            <span data-count="">{shown}</span>
            {str(node.props.suffix) ? <span>{str(node.props.suffix)}</span> : null}
          </p>
          {str(node.props.label) ? <p data-counter-label="">{str(node.props.label)}</p> : null}
        </div>
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
