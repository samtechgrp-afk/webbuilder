import type { CSSProperties, ReactNode } from "react";
import { applyDynamic, baseNodeId, type DynamicData } from "@/lib/cms/binding";
import { formatPrice } from "./content";
import { buildCss, nodeClass, type DesignTokens } from "./styles";
import type { BuilderDocument, BuilderNode, ImageValue, LinkValue, PriceValue, VideoValue } from "./types";
import { WIDGETS, type LanguageSwitcherProps } from "./widgets";
import { SiteIcon } from "./icons";
import { embedUrl, mapEmbedUrl, parseAudioUrl, parseVideoUrl } from "./media";
import { BRAND_ICONS } from "./brand-icons";
import { settingValues, type MediaRef } from "./settings";
import { WidgetEnhancer } from "@/components/site/WidgetEnhancer";
import { CartWidget } from "@/components/commerce/CartWidget";
import { ProductDetails } from "@/components/commerce/ProductDetails";
import { ProductGrid } from "@/components/commerce/ProductGrid";
import { TiltedGridHero } from "@/components/ui/tilted-grid-hero";
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
  /** Where Contact form and Newsletter widgets post. Without it (canvas, previews) forms render disabled. */
  formAction?: string;
  /** The page being shown: its address (share buttons), path (current menu item) and trail (breadcrumbs). */
  page?: PageContext;
}

export interface PageContext {
  /** Absolute public URL. */
  url: string;
  title: string;
  /** Site path without the link base, "/" for the home page. */
  path: string;
  /** Trail after Home; the last item is the current page. Empty on the home page. */
  crumbs: { label: string; href: string }[];
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

export function SiteDocument({ doc, tokens = {}, hooks, data, editor, linkBase = "", lang, languages, commerce, formAction, page }: RenderOptions) {
  // Styles come from the template document; loop copies reuse the original's class.
  const view = data ? applyDynamic(doc, data, { editor }) : doc;
  const ctx: Ctx = { doc: view, hooks, linkBase, languages, editor, lang, commerce, formAction, page };
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
  /** Where Contact form and Newsletter widgets post. Without it (canvas, previews) forms render disabled. */
  formAction?: string;
  page?: PageContext;
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
      (n.type === "counter" && n.props.duration !== 0) ||
      n.type === "form" ||
      n.type === "newsletter" ||
      n.type === "nav",
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

const STAR_PATH = "M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z";

const starRow = (count: number) =>
  Array.from({ length: count }, (_, i) => (
    <svg key={i} viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true">
      <path d={STAR_PATH} fill="currentColor" />
    </svg>
  ));


const SHARE: Record<string, { label: string; url: (u: string, t: string) => string }> = {
  facebook: { label: "Facebook", url: (u) => `https://www.facebook.com/sharer/sharer.php?u=${u}` },
  x: { label: "X", url: (u, t) => `https://x.com/intent/post?url=${u}&text=${t}` },
  linkedin: { label: "LinkedIn", url: (u) => `https://www.linkedin.com/sharing/share-offsite/?url=${u}` },
  whatsapp: { label: "WhatsApp", url: (u, t) => `https://wa.me/?text=${t}%20${u}` },
  pinterest: { label: "Pinterest", url: (u, t) => `https://pinterest.com/pin/create/button/?url=${u}&description=${t}` },
  telegram: { label: "Telegram", url: (u, t) => `https://t.me/share/url?url=${u}&text=${t}` },
  reddit: { label: "Reddit", url: (u, t) => `https://www.reddit.com/submit?url=${u}&title=${t}` },
  bluesky: { label: "Bluesky", url: (u, t) => `https://bsky.app/intent/compose?text=${t}%20${u}` },
  threads: { label: "Threads", url: (u, t) => `https://www.threads.net/intent/post?text=${t}%20${u}` },
  email: { label: "Email", url: (u, t) => `mailto:?subject=${t}&body=${u}` },
};
const SHARE_SETS: Record<string, string[]> = {
  minimal: ["x", "linkedin", "email"],
  popular: ["facebook", "x", "linkedin", "whatsapp", "email"],
  all: Object.keys(SHARE),
};

function SocialGlyph({ network }: { network: string }) {
  const brand = BRAND_ICONS[network];
  if (brand)
    return (
      <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" fillRule={brand.evenOdd ? "evenodd" : undefined}>
        <path d={brand.path} fill="currentColor" />
      </svg>
    );
  return <SiteIcon name={network === "email" ? "mail" : network === "phone" ? "phone" : "globe"} size="1em" />;
}

/** A pasted embed that is a single https iframe runs as that iframe (its own origin isolates it); anything else goes in a sealed srcdoc frame. */
function singleIframeSrc(code: string): string | null {
  const m = code.trim().match(/^<iframe\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>\s*<\/iframe>$/i);
  if (!m) return null;
  try {
    const u = new URL(m[1].replace(/&amp;/g, "&"));
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

const SAME_PAGE = (href: string, base: string, path: string) => {
  const own = withBase(path, base);
  return href === own || (path === "/" && href === (base || "/"));
};

/** Accepted attachments: what the server accepts too (FORM_FILE_TYPES). */
const FILE_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.gif,.txt,.doc,.docx";

/** Spam trap and form identity, shared by Contact form and Newsletter. */
function FormChrome({ formId }: { formId: string }) {
  return (
    <>
      <input type="hidden" name="_form" value={formId} />
      <div data-hp="" aria-hidden="true">
        <label>
          Leave this empty
          <input type="text" name="_hp" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>
    </>
  );
}

function FormField({ field, i, base }: { field: Item; i: number; base: string }) {
  const type = str(field.type) || "text";
  const label = str(field.label) || `Field ${i + 1}`;
  const required = field.required === true;
  const id = `${base}-f${i}`;
  const name = `f${i}`;
  const placeholder = str(field.placeholder) || undefined;
  const options = Array.isArray(field.options) ? field.options.filter((o): o is string => typeof o === "string" && !!o) : [];
  const mark = required ? <span data-req="" aria-hidden="true"> *</span> : null;
  const width = field.width === "half" ? "half" : "full";
  if (type === "radio" || type === "rating") {
    return (
      <fieldset data-field="" data-type={type} data-width={width}>
        <legend data-field-label="">
          {label}
          {mark}
        </legend>
        {type === "radio" ? (
          <div data-choices="">
            {options.map((o, j) => (
              <label key={j}>
                <input type="radio" name={name} value={String(j)} required={required || undefined} />
                {o}
              </label>
            ))}
          </div>
        ) : (
          <div data-rate="">
            {[5, 4, 3, 2, 1].map((n) => (
              <label key={n} title={`${n} out of 5`}>
                <input type="radio" name={name} value={String(n)} required={required || undefined} />
                <span data-sr="">{n} out of 5</span>
                <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true">
                  <path d={STAR_PATH} fill="currentColor" />
                </svg>
              </label>
            ))}
          </div>
        )}
        <span data-field-error="" id={`${id}-err`} />
      </fieldset>
    );
  }
  if (type === "checkbox") {
    return (
      <div data-field="" data-type="checkbox" data-width={width}>
        <label data-check="">
          <input type="checkbox" name={name} value="yes" required={required || undefined} aria-describedby={`${id}-err`} />
          <span>
            {label}
            {mark}
          </span>
        </label>
        <span data-field-error="" id={`${id}-err`} />
      </div>
    );
  }
  const shared = { id, name, required: required || undefined, "aria-describedby": `${id}-err` };
  return (
    <div data-field="" data-type={type} data-width={width}>
      <label data-field-label="" htmlFor={id}>
        {label}
        {mark}
      </label>
      {type === "textarea" ? (
        <textarea {...shared} rows={5} maxLength={5000} placeholder={placeholder} />
      ) : type === "select" ? (
        <select {...shared} defaultValue="">
          <option value="" disabled={required || undefined}>
            {placeholder ?? "Choose…"}
          </option>
          {options.map((o, j) => (
            <option key={j} value={String(j)}>
              {o}
            </option>
          ))}
        </select>
      ) : type === "file" ? (
        <input {...shared} type="file" accept={FILE_ACCEPT} />
      ) : (
        <input
          {...shared}
          type={["email", "tel", "number", "url", "date"].includes(type) ? type : "text"}
          maxLength={type === "date" || type === "number" ? undefined : type === "email" ? 254 : type === "tel" ? 40 : 500}
          placeholder={placeholder}
          autoComplete={type === "email" ? "email" : type === "tel" ? "tel" : /name/i.test(label) && type === "text" ? "name" : undefined}
        />
      )}
      <span data-field-error="" id={`${id}-err`} />
    </div>
  );
}

/**
 * Soft gradient washes shown until a Tilted grid hero has images of its own,
 * so a freshly dropped hero already moves. Inline SVG: nothing to fetch and
 * nothing stored in the page.
 */
const TILTED_PLACEHOLDERS = [
  ["#f6d365", "#fda085", "#f5576c"],
  ["#a1c4fd", "#c2e9fb", "#e0c3fc"],
  ["#0f2027", "#2c5364", "#7aa7c7"],
  ["#fbc2eb", "#a6c1ee", "#f9f7ff"],
  ["#ff9a8b", "#ff6a88", "#ff99ac"],
  ["#d4fc79", "#96e6a1", "#43c6ac"],
  ["#30cfd0", "#330867", "#130f40"],
  ["#fdfbfb", "#ebedee", "#c9d6ff"],
].map(([a, b, c], i) => ({
  src: `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90" preserveAspectRatio="none"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset=".55" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient><radialGradient id="r" cx="${i % 2 ? 0.25 : 0.75}" cy=".3" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><rect width="160" height="90" fill="url(#g)"/><rect width="160" height="90" fill="url(#r)"/></svg>`,
  )}`,
  alt: "",
}));

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
    case "form": {
      const fields = items(node.props.fields).slice(0, 20);
      const formId = baseNodeId(node.id);
      const live = !ctx.editor && !!ctx.formAction;
      return (
        <Tag {...common} data-labels={set.labels as string} data-button={set.buttonWidth as string} style={{ "--wb-accent": css(set.accent) } as Vars}>
          <form method="post" action={live ? ctx.formAction : undefined} encType="multipart/form-data" data-wb-form="">
            <FormChrome formId={formId} />
            <fieldset data-form-body="" disabled={!live || undefined}>
              {fields.map((f, i) => (
                <FormField key={i} field={f} i={i} base={`form-${formId}`} />
              ))}
              <div data-form-actions="">
                <button type="submit">{str(node.props.submitLabel) || "Send"}</button>
              </div>
            </fieldset>
            <p data-form-status="" role="status" aria-live="polite" />
            <p data-form-success="" hidden>
              {str(node.props.successMessage) || "Thanks! Your message was sent."}
            </p>
          </form>
        </Tag>
      );
    }
    case "newsletter": {
      const formId = baseNodeId(node.id);
      const live = !ctx.editor && !!ctx.formAction;
      const id = `nl-${formId}`;
      return (
        <Tag {...common} data-layout={set.layout as string} style={{ "--wb-accent": css(set.accent) } as Vars}>
          {str(node.props.title) ? <h3>{str(node.props.title)}</h3> : null}
          {str(node.props.text) ? <p data-nl-text="">{str(node.props.text)}</p> : null}
          <form method="post" action={live ? ctx.formAction : undefined} encType="multipart/form-data" data-wb-form="">
            <FormChrome formId={formId} />
            <fieldset data-form-body="" disabled={!live || undefined}>
              <div data-nl-row="">
                {set.askName ? (
                  <>
                    <label data-sr="" htmlFor={`${id}-name`}>Name</label>
                    <input id={`${id}-name`} type="text" name="name" maxLength={120} placeholder="Your name" autoComplete="name" />
                  </>
                ) : null}
                <label data-sr="" htmlFor={`${id}-email`}>Email address</label>
                <input id={`${id}-email`} type="email" name="email" required maxLength={254} placeholder={str(node.props.placeholder) || "you@example.com"} autoComplete="email" aria-describedby={`${id}-err`} />
                <button type="submit">{str(node.props.buttonLabel) || "Subscribe"}</button>
              </div>
              <span data-field-error="" id={`${id}-err`} />
            </fieldset>
            {str(node.props.consent) ? <p data-consent="">{str(node.props.consent)}</p> : null}
            <p data-form-status="" role="status" aria-live="polite" />
            <p data-form-success="" hidden>
              {str(node.props.successMessage) || "You're subscribed."}
            </p>
          </form>
        </Tag>
      );
    }
    case "rating": {
      const max = Number(set.max);
      const value = Math.max(0, Math.min(max, Number(node.props.value) || 0));
      const shown = value.toLocaleString(ctx.lang || "en-US", { maximumFractionDigits: 1 });
      return (
        <Tag {...common} style={{ "--wb-star": css(set.color), "--wb-star-size": `${set.size}px` } as Vars}>
          <span data-rating-stars="" role="img" aria-label={`Rated ${shown} out of ${max}`}>
            <span data-rating-base="">{starRow(max)}</span>
            <span data-rating-fill="" style={{ width: `${(value / max) * 100}%` }}>
              {starRow(max)}
            </span>
          </span>
          {set.showValue ? <strong data-rating-value="">{shown}</strong> : null}
          {str(node.props.label) ? <span data-rating-label="">{str(node.props.label)}</span> : null}
        </Tag>
      );
    }
    case "nav": {
      type Entry = { link: LinkValue; subs: LinkValue[] };
      const groups: Entry[] = [];
      for (const it of items(node.props.items).slice(0, 30)) {
        if (!hasLink(it.link)) continue;
        const link = it.link as LinkValue;
        if (it.level === "sub" && groups.length) groups[groups.length - 1].subs.push(link);
        else groups.push({ link, subs: [] });
      }
      const id = `nav-${baseNodeId(node.id)}`;
      const current = ctx.page?.path;
      const a = (l: LinkValue) => {
        const href = withBase(l.href, ctx.linkBase);
        const here = current !== undefined && SAME_PAGE(href, ctx.linkBase, current);
        return (
          <a href={href} aria-current={here ? "page" : undefined} target={l.newTab ? "_blank" : undefined} rel={l.newTab ? "noopener noreferrer" : undefined}>
            {l.label}
          </a>
        );
      };
      return (
        <Tag
          {...common}
          aria-label={str(node.props.label) || "Main"}
          data-drawer={set.drawer as string}
          data-side={set.side as string}
          data-look={set.look as string}
          data-align={set.align as string}
          style={{ "--wb-accent": css(set.accent), "--wb-gap": `${set.gap}px`, "--wb-drawer-bg": css(set.drawerBg) } as Vars}
        >
          <input type="checkbox" id={`${id}-toggle`} data-nav-toggle="" aria-label="Menu" aria-controls={`${id}-list`} tabIndex={ctx.editor ? -1 : undefined} />
          <label htmlFor={`${id}-toggle`} data-nav-button="" aria-hidden="true">
            <SiteIcon name="menu" size={24} />
            <SiteIcon name="x" size={24} />
          </label>
          <label htmlFor={`${id}-toggle`} data-nav-backdrop="" aria-hidden="true" />
          <ul id={`${id}-list`} data-nav-list="">
            {groups.map((g, i) => (
              <li key={i} data-has-sub={g.subs.length ? "" : undefined}>
                {a(g.link)}
                {g.subs.length ? (
                  <ul data-nav-sub="">
                    {g.subs.map((l, j) => (
                      <li key={j}>{a(l)}</li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </Tag>
      );
    }
    case "breadcrumbs": {
      const crumbs = ctx.page?.crumbs ?? (ctx.editor ? [{ label: "Section", href: "/" }, { label: "This page", href: "/" }] : null);
      if (!crumbs) return null;
      const home = str(node.props.homeLabel) || "Home";
      const trail = set.showCurrent ? crumbs : crumbs.slice(0, -1);
      return (
        <Tag {...common} aria-label="Breadcrumb" data-sep={set.separator as string}>
          <ol>
            <li>{crumbs.length ? <a href={withBase("/", ctx.linkBase)}>{home}</a> : <span aria-current="page">{home}</span>}</li>
            {trail.map((c, i) =>
              i === crumbs.length - 1 ? (
                <li key={i}>
                  <span aria-current="page">{c.label}</span>
                </li>
              ) : (
                <li key={i}>{c.href ? <a href={withBase(c.href, ctx.linkBase)}>{c.label}</a> : <span>{c.label}</span>}</li>
              ),
            )}
          </ol>
        </Tag>
      );
    }
    case "search": {
      const id = `search-${baseNodeId(node.id)}`;
      return (
        <Tag {...common} data-shape={set.shape as string}>
          <form role="search" method="get" action={ctx.editor ? undefined : withBase("/search", ctx.linkBase)} data-search="">
            <label data-sr="" htmlFor={id}>Search this site</label>
            <input id={id} type="search" name="q" required maxLength={100} placeholder={str(node.props.placeholder) || "Search…"} disabled={ctx.editor || undefined} />
            {set.button === "none" ? null : (
              <button type="submit" aria-label={set.button === "icon" ? str(node.props.buttonLabel) || "Search" : undefined} disabled={ctx.editor || undefined}>
                {set.button === "icon" ? <SiteIcon name="search" size={18} /> : str(node.props.buttonLabel) || "Search"}
              </button>
            )}
          </form>
        </Tag>
      );
    }
    case "social": {
      const share = set.mode === "share";
      const page = ctx.page;
      const links: { key: string; network: string; label: string; href: string }[] = share
        ? (SHARE_SETS[set.networks as string] ?? SHARE_SETS.popular).map((n) => ({
            key: n,
            network: n,
            label: `Share on ${SHARE[n].label}`,
            href: page ? SHARE[n].url(encodeURIComponent(page.url), encodeURIComponent(page.title)) : "#",
          }))
        : items(node.props.items)
            .filter((it) => hasLink(it.link) || (it.link && typeof (it.link as LinkValue).href === "string" && (it.link as LinkValue).href))
            .map((it, i) => {
              const network = str(it.network) || "website";
              const link = it.link as LinkValue;
              const name = BRAND_ICONS[network]?.label ?? (network === "email" ? "Email" : network === "phone" ? "Phone" : "Website");
              return { key: String(i), network, label: link.label || name, href: link.href };
            });
      if (!links.length) return ctx.editor ? <div {...common} data-empty="" aria-label="Social links (add profiles under Content)" /> : null;
      return (
        <Tag {...common} data-shape={set.shape as string} data-colors={set.colors as string} data-labels={set.labels ? "" : undefined} style={{ "--wb-icon": `${set.size}px` } as Vars}>
          <ul>
            {links.map((l) => {
              const brand = BRAND_ICONS[l.network];
              const external = /^https?:/.test(l.href);
              return (
                <li key={l.key}>
                  <a
                    href={l.href}
                    aria-label={set.labels ? undefined : l.label}
                    title={l.label}
                    target={external ? "_blank" : undefined}
                    rel={external ? (share ? "noopener noreferrer" : "me noopener noreferrer") : undefined}
                    data-network={l.network}
                    style={brand ? ({ "--wb-brand": brand.color } as Vars) : undefined}
                  >
                    <SocialGlyph network={l.network} />
                    {set.labels ? <span>{share ? SHARE[l.network]?.label ?? l.label : l.label}</span> : null}
                  </a>
                </li>
              );
            })}
          </ul>
        </Tag>
      );
    }
    case "audio": {
      const v = node.props.audio as VideoValue | undefined;
      const src = v?.src ? (v.assetId ? v.src : parseAudioUrl(v.src)) : null;
      if (!src) return ctx.editor ? <div {...common} data-empty="" aria-label="Audio player (pick a file under Content)" /> : null;
      const cover = node.props.cover as ImageValue | undefined;
      const Caption = Tag === "figure" ? "figcaption" : "div";
      const title = str(node.props.title);
      const artist = str(node.props.artist);
      return (
        <Tag {...common} data-look={set.look as string}>
          {set.look === "card" && cover?.src ? (
            <div data-audio-cover="">
              <Img img={cover} sizes="160px" />
            </div>
          ) : null}
          <div data-audio-body="">
            {title || artist ? (
              <Caption data-audio-meta="">
                {title ? <strong>{title}</strong> : null}
                {artist ? <span>{artist}</span> : null}
              </Caption>
            ) : null}
            <audio controls preload="metadata" src={src} loop={set.loop ? true : undefined} controlsList={set.download ? undefined : "nodownload"} aria-label={title || "Audio"}>
              <a href={src}>{title || "Listen"}</a>
            </audio>
          </div>
        </Tag>
      );
    }
    case "embed": {
      const code = str(set.code);
      if (!code.trim()) return ctx.editor ? <div {...common} data-empty="" aria-label="Embed code (paste it under Settings)" /> : null;
      const direct = singleIframeSrc(code);
      const style = { height: `${set.height}px` };
      return (
        <div {...common}>
          {direct ? (
            <iframe src={direct} title={str(set.title) || "Embedded content"} loading="lazy" style={style} referrerPolicy="strict-origin-when-cross-origin" allow="fullscreen; clipboard-write; encrypted-media; picture-in-picture" />
          ) : (
            <iframe
              srcDoc={`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base target="_blank"><style>html,body{margin:0}</style></head><body>${code}</body></html>`}
              title={str(set.title) || "Embedded content"}
              loading="lazy"
              style={style}
              sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation"
              referrerPolicy="no-referrer"
            />
          )}
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
    case "tilted-grid-hero": {
      const own = ((node.props.images as ImageValue[] | undefined) ?? []).filter((img) => img?.src).map((img) => ({ src: img.src, alt: img.alt }));
      const [w, h] = String(set.aspect).split("/").map(Number);
      // The band is the one Client Component here: its ResizeObserver sizes the loop and hands tiles their next image.
      return (
        <Tag {...common}>
          <TiltedGridHero
            data-tgh=""
            images={own.length ? own : TILTED_PLACEHOLDERS}
            speed={Number(set.speed)}
            tileHeight={Number(set.tileHeight)}
            aspectRatio={w > 0 && h > 0 ? w / h : 16 / 9}
            gap={Number(set.gap)}
            axis={Number(set.axis)}
            curve={Number(set.curve)}
            fade={Number(set.fade)}
          >
            <div data-tgh-content="" data-position={set.contentPosition as string}>
              {kids()}
            </div>
          </TiltedGridHero>
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
