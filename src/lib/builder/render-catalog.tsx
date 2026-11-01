import { Fragment, type CSSProperties, type ReactNode } from "react";
import type { DynamicSite } from "@/lib/cms/binding";
import { BRAND_ICONS } from "./brand-icons";
import { SiteIcon } from "./icons";
import type { BuilderNode, CatalogWidgetType, ImageValue, LinkValue } from "./types";

/**
 * Renderers for the master catalog widgets (see widgets-catalog.ts). Same
 * rules as render.tsx: no hooks, no client code, works without JavaScript.
 * The only enhanced behaviours are the hero carousel's arrows and autoplay
 * (shared with the image carousel) and the code snippet's copy button; both
 * degrade to a swipeable track and selectable text.
 */

type Vars = CSSProperties & Record<`--${string}`, string | number | undefined>;
type Item = Record<string, unknown>;

export interface CatalogArgs {
  node: BuilderNode;
  /** Settings with defaults filled in. */
  set: Record<string, unknown>;
  /** Class, data-w and the editor's selection attributes for the root element. */
  common: Record<string, unknown>;
  Tag: keyof React.JSX.IntrinsicElements;
  kids: () => ReactNode;
  editor?: boolean;
  linkBase: string;
  site?: DynamicSite;
  page?: { url: string; title: string; now?: string };
  /** The shared <img> renderer (srcset, lazy loading). */
  Img: (p: { img: ImageValue; priority?: boolean; sizes?: string }) => ReactNode;
}

const items = (v: unknown): Item[] => (Array.isArray(v) ? v.filter((x): x is Item => !!x && typeof x === "object") : []);
const str = (v: unknown) => (typeof v === "string" ? v : "");
const css = (v: unknown) => (typeof v === "string" && v ? v : undefined);
const hasLink = (l: unknown): l is LinkValue => !!l && typeof l === "object" && !!(l as LinkValue).label && !!(l as LinkValue).href;
const hasHref = (l: unknown): l is LinkValue => !!l && typeof l === "object" && !!(l as LinkValue).href;
const image = (v: unknown) => (v && typeof v === "object" && (v as ImageValue).src ? (v as ImageValue) : null);
const withBase = (href: string, base: string) => (base && /^\/(?!\/)/.test(href) ? `${base}${href === "/" ? "" : href}` || "/" : href);
const domId = (prefix: string, id: string) => `${prefix}-${id.replace(/[^\w-]/g, "")}`;
/** A heading level picked in settings; anything else falls back to h3. */
const headingTag = (v: unknown, fallback = "h3") => (["h1", "h2", "h3", "h4", "h5", "h6", "p"].includes(String(v)) ? String(v) : fallback) as "h3";

function A({ link, base, children, ...rest }: { link: LinkValue; base: string; children: ReactNode } & Record<string, unknown>) {
  return (
    <a href={withBase(link.href, base)} {...(link.newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})} {...rest}>
      {children}
    </a>
  );
}

/** Lower-case letters, digits and dashes: safe as an HTML id and a #fragment. */
export function anchorSlug(v: string) {
  return (
    v
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "section"
  );
}

/** Points of a regular polygon or star in a 100×100 box, first point at the top. */
export function shapePoints(kind: "polygon" | "star", count: number, innerPct = 50) {
  const n = Math.max(3, Math.min(24, Math.round(count)));
  const steps = kind === "star" ? n * 2 : n;
  const pts: string[] = [];
  for (let i = 0; i < steps; i++) {
    const r = kind === "star" && i % 2 ? (50 * innerPct) / 100 : 50;
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / steps;
    pts.push(`${+(50 + r * Math.cos(a)).toFixed(2)},${+(50 + r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(" ");
}

const SOUNDCLOUD_HOSTS = new Set(["soundcloud.com", "www.soundcloud.com", "m.soundcloud.com", "on.soundcloud.com", "api.soundcloud.com"]);

/** SoundCloud's player URL for a track or playlist address, or null if it isn't SoundCloud. */
export function soundcloudEmbedUrl(address: string, o: { color: string; autoplay: boolean; visual: boolean; comments: boolean }) {
  let u: URL;
  try {
    u = new URL(address.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || !SOUNDCLOUD_HOSTS.has(u.hostname) || u.pathname.length < 2) return null;
  const color = /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(o.color) ? o.color : "#ff5500";
  const q = new URLSearchParams({
    url: `${u.origin}${u.pathname}`,
    color,
    auto_play: String(o.autoplay),
    visual: String(o.visual),
    show_comments: String(o.comments),
    hide_related: "true",
    show_teaser: "false",
  });
  return `https://w.soundcloud.com/player/?${q}`;
}

const TEXT_PATHS: Record<string, { viewBox: string; d: string }> = {
  arc: { viewBox: "0 -10 400 210", d: "M 30,190 A 170,170 0 0 1 370,190" },
  wave: { viewBox: "0 0 400 200", d: "M 10,110 C 100,20 180,20 200,100 S 300,180 390,90" },
  circle: { viewBox: "0 0 300 300", d: "M 150,150 m -115,0 a 115,115 0 1,1 230,0 a 115,115 0 1,1 -230,0" },
};

const ALERT_ICONS: Record<string, string> = { info: "info", success: "circle-check", warning: "triangle-alert", error: "circle-x", neutral: "bell" };

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

function Cap({ kind, end }: { kind: string; end?: boolean }) {
  if (kind === "arrow")
    return (
      <svg data-cap="" viewBox="0 0 10 10" aria-hidden="true" style={end ? undefined : { transform: "scaleX(-1)" }}>
        <path d="M0,0 L10,5 L0,10 L2.5,5 Z" fill="currentColor" />
      </svg>
    );
  if (kind === "circle")
    return (
      <svg data-cap="" viewBox="0 0 10 10" aria-hidden="true">
        <circle cx="5" cy="5" r="4" fill="currentColor" />
      </svg>
    );
  return null;
}

/** Shortcodes: [name attr="value"]. Text in between is kept as plain text. */
const SHORTCODE_RE = /\[([a-z_]+)((?:\s+[a-z_]+\s*=\s*"[^"\]]*")*)\s*\]/gi;
const ATTR_RE = /([a-z_]+)\s*=\s*"([^"\]]*)"/gi;

export function parseShortcodes(src: string): ({ text: string } | { code: string; attrs: Record<string, string>; raw: string })[] {
  const out: ({ text: string } | { code: string; attrs: Record<string, string>; raw: string })[] = [];
  let last = 0;
  for (const m of src.matchAll(SHORTCODE_RE)) {
    if (m.index > last) out.push({ text: src.slice(last, m.index) });
    const attrs: Record<string, string> = {};
    for (const a of m[2].matchAll(ATTR_RE)) attrs[a[1].toLowerCase()] = a[2];
    out.push({ code: m[1].toLowerCase(), attrs, raw: m[0] });
    last = m.index + m[0].length;
  }
  if (last < src.length) out.push({ text: src.slice(last) });
  return out;
}

function Shortcode({ code, attrs, raw, a }: { code: string; attrs: Record<string, string>; raw: string; a: CatalogArgs }): ReactNode {
  // The canvas has no published clock; it shows the visitor's (designer's) date instead.
  const nowIso = a.page?.now ?? (a.editor ? new Date().toISOString() : "");
  const safe = (href: string) => /^(\/(?!\/)|#|https:\/\/|http:\/\/|mailto:|tel:)/i.test(href);
  switch (code) {
    case "year":
      return nowIso ? nowIso.slice(0, 4) : null;
    case "date":
      return nowIso ? nowIso.slice(0, 10) : null;
    case "site_name":
      return a.site?.name ?? (a.editor ? "Site name" : null);
    case "site_tagline":
      return a.site?.tagline ?? (a.editor ? "Site tagline" : null);
    case "site_url":
      return a.site?.url ?? null;
    case "page_title":
      return a.page?.title ?? (a.editor ? "Page title" : null);
    case "page_url":
      return a.page?.url ?? null;
    case "icon":
      return <SiteIcon name={attrs.name ?? ""} />;
    case "button":
    case "link": {
      const href = attrs.url ?? attrs.href ?? "";
      if (!href || !safe(href)) return a.editor ? <mark data-sc-unknown="">{raw}</mark> : null;
      return (
        <a href={withBase(href, a.linkBase)} data-sc={code} {...(attrs.target === "_blank" ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
          {attrs.label || attrs.text || href}
        </a>
      );
    }
    default:
      return a.editor ? <mark data-sc-unknown="" title="Unknown shortcode: hidden on the live site">{raw}</mark> : null;
  }
}

export function renderCatalogWidget(type: CatalogWidgetType, a: CatalogArgs): ReactNode {
  const { node, set, common, Tag, Img, linkBase, editor } = a;
  const p = node.props;
  const bg = typeof p.__bg === "string" ? { backgroundImage: `url("${p.__bg}")`, backgroundSize: "cover", backgroundPosition: "center" } : undefined;

  switch (type) {
    // ── Layout & structure ──────────────────────────────────────────────────
    case "frame":
      return (
        <Tag {...common} data-arrange={set.arrange === "stack" ? "stack" : undefined} data-clip={set.clip ? "" : undefined} style={bg}>
          {a.kids()}
        </Tag>
      );
    case "grid":
      return (
        <Tag {...common} style={bg}>
          {a.kids()}
        </Tag>
      );
    case "sidebar":
      return (
        <Tag {...common} data-sticky={set.sticky ? "" : undefined} style={{ ...bg, ...(set.sticky ? ({ "--wb-top": `${set.top}px` } as Vars) : {}) }}>
          {a.kids()}
        </Tag>
      );
    case "anchor": {
      const id = anchorSlug(str(set.anchorId));
      return (
        <div {...common} id={id} style={{ scrollMarginTop: `${set.offset}px` }} aria-hidden="true">
          {editor ? <span data-anchor-badge="">#{id}</span> : null}
        </div>
      );
    }
    case "linkinbio": {
      const avatar = image(p.avatar);
      const list = items(p.items).filter((it) => hasLink(it.link));
      return (
        <Tag {...common} data-look={set.look as string} data-shape={set.shape as string} style={{ "--wb-accent": css(set.accent) } as Vars}>
          {avatar ? (
            <div data-lib-avatar="">
              <Img img={avatar} sizes="120px" />
            </div>
          ) : null}
          {str(p.name) ? <h1 data-lib-name="">{str(p.name)}</h1> : null}
          {str(p.bio) ? <p data-lib-bio="">{str(p.bio)}</p> : null}
          <ul>
            {list.map((it, i) => (
              <li key={i}>
                <A link={it.link as LinkValue} base={linkBase} data-featured={it.featured === true ? "" : undefined}>
                  {str(it.icon) ? <SiteIcon name={str(it.icon)} /> : null}
                  <span>{(it.link as LinkValue).label}</span>
                </A>
              </li>
            ))}
          </ul>
        </Tag>
      );
    }

    // ── Shapes & vectors ────────────────────────────────────────────────────
    case "rectangle":
    case "ellipse": {
      const sw = Number(set.strokeWidth);
      const vars: Vars = {
        background: css(set.fill) ?? "transparent",
        border: sw > 0 ? `${sw}px solid ${css(set.stroke) ?? "currentColor"}` : undefined,
        borderRadius: type === "ellipse" ? "50%" : `${set.radius}px`,
        transform: Number(set.rotate) ? `rotate(${set.rotate}deg)` : undefined,
      };
      return (
        <div {...common} aria-hidden="true">
          <span data-shape-fill="" style={vars} />
        </div>
      );
    }
    case "polygon":
    case "star": {
      const sw = Number(set.strokeWidth);
      const points = type === "star" ? shapePoints("star", Number(set.points), Number(set.inner)) : shapePoints("polygon", Number(set.sides));
      return (
        <div {...common} aria-hidden="true">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={Number(set.rotate) ? { transform: `rotate(${set.rotate}deg)` } : undefined}>
            <polygon points={points} fill={css(set.fill) ?? "none"} stroke={sw > 0 ? (css(set.stroke) ?? "currentColor") : undefined} strokeWidth={sw > 0 ? sw : undefined} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          </svg>
        </div>
      );
    }
    case "line": {
      const t = Number(set.thickness);
      const vars: Vars = { color: css(set.color), "--wb-t": `${t}px`, "--wb-cap": `${Math.max(10, t * 4)}px`, "--wb-ls": String(set.lineStyle), transform: Number(set.rotate) ? `rotate(${set.rotate}deg)` : undefined };
      return (
        <div {...common} role="presentation">
          <span data-line="" style={vars}>
            <Cap kind={String(set.start)} />
            <span data-line-bar="" />
            <Cap kind={String(set.end)} end />
          </span>
        </div>
      );
    }

    // ── Basic content ───────────────────────────────────────────────────────
    case "textpath": {
      const shape = TEXT_PATHS[String(set.path)] ?? TEXT_PATHS.arc;
      const pid = domId("tp", node.id);
      const txt = str(p.text);
      return (
        <Tag {...common} data-path={String(set.path)} data-spin={set.spin && set.path === "circle" ? "" : undefined}>
          <svg viewBox={shape.viewBox} role="img" aria-label={txt} style={{ color: css(set.color) }}>
            <path id={pid} d={shape.d} fill="none" />
            <text fill="currentColor" fontSize={Number(set.size)} textAnchor="middle" aria-hidden="true">
              <textPath href={`#${pid}`} startOffset={`${set.offset}%`}>
                {txt}
              </textPath>
            </text>
          </svg>
        </Tag>
      );
    }
    case "readmore": {
      const id = domId("rm", node.id);
      return (
        <Tag {...common} style={{ "--wb-lines": Number(set.lines), "--wb-link": css(set.linkColor) } as Vars}>
          <input type="checkbox" id={id} data-rm-toggle="" aria-label={str(p.moreLabel) || "Read more"} />
          <div data-rm-text="">{str(p.text)}</div>
          <label htmlFor={id} data-rm-more="" aria-hidden="true">
            {str(p.moreLabel) || "Read more"}
          </label>
          <label htmlFor={id} data-rm-less="" aria-hidden="true">
            {str(p.lessLabel) || "Show less"}
          </label>
        </Tag>
      );
    }
    case "detaillist":
      return (
        <Tag {...common} data-layout={set.layout as string} data-dividers={set.dividers ? "" : undefined} style={{ "--wb-label": css(set.labelColor) } as Vars}>
          <dl>
            {items(p.items).map((it, i) => (
              <div key={i} data-dl-row="">
                <dt>
                  {str(it.icon) ? <SiteIcon name={str(it.icon)} /> : null}
                  {str(it.label)}
                </dt>
                <dd>{str(it.value)}</dd>
              </div>
            ))}
          </dl>
        </Tag>
      );
    case "tags":
      return (
        <Tag {...common} data-look={set.look as string} data-size={set.size as string} data-shape={set.shape as string} style={{ "--wb-accent": css(set.accent) } as Vars}>
          <ul>
            {items(p.items)
              .filter((it) => str(it.label))
              .map((it, i) => {
                const inner = (
                  <>
                    {str(it.icon) ? <SiteIcon name={str(it.icon)} /> : null}
                    {str(it.label)}
                  </>
                );
                return (
                  <li key={i}>
                    {hasHref(it.link) ? (
                      <A link={it.link} base={linkBase} data-tag="">
                        {inner}
                      </A>
                    ) : (
                      <span data-tag="">{inner}</span>
                    )}
                  </li>
                );
              })}
          </ul>
        </Tag>
      );
    case "buttongroup":
      return (
        <Tag {...common} data-align={set.align as string} data-joined={set.joined ? "" : undefined} data-stack={set.stack ? "" : undefined} style={{ "--wb-accent": css(set.accent) } as Vars}>
          {items(p.items)
            .filter((it) => hasLink(it.link))
            .map((it, i) => (
              <A key={i} link={it.link as LinkValue} base={linkBase} data-look={str(it.look) || (i === 0 ? "solid" : "outline")}>
                {(it.link as LinkValue).label}
                {str(it.icon) ? <SiteIcon name={str(it.icon)} /> : null}
              </A>
            ))}
        </Tag>
      );

    // ── Media & embeds ──────────────────────────────────────────────────────
    case "soundcloud": {
      const src = soundcloudEmbedUrl(str(p.url), { color: str(set.color), autoplay: !!set.autoplay, visual: !!set.visual, comments: !!set.comments });
      if (!src) return editor ? <div {...common} data-empty="" aria-label="SoundCloud (paste a track or playlist address under Content)" /> : null;
      return (
        <div {...common}>
          <iframe src={src} title="SoundCloud player" loading="lazy" allow="autoplay" style={{ height: `${set.height}px`, ...(editor ? { pointerEvents: "none" } : {}) }} />
        </div>
      );
    }
    case "herocarousel": {
      const list = items(p.items);
      const H = headingTag(set.headingTag, "h2");
      return (
        <Tag
          {...common}
          data-align={set.align as string}
          data-autoplay={set.autoplay ? Number(set.interval) * 1000 : undefined}
          data-loop={set.loop ? "" : undefined}
          style={{ "--wb-h": `${set.height}vh`, "--wb-overlay": css(set.overlay) } as Vars}
          aria-roledescription="carousel"
          aria-label={node.name ?? "Featured"}
        >
          <div data-track="" tabIndex={0}>
            {list.map((it, i) => {
              const img = image(it.image);
              return (
                <div key={i} data-slide="" role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${list.length}`}>
                  <div data-hc-media="">{img ? <Img img={img} priority={i === 0} sizes="100vw" /> : null}</div>
                  <div data-hc-content="">
                    {str(it.eyebrow) ? <p data-eyebrow="">{str(it.eyebrow)}</p> : null}
                    {str(it.title) ? <H>{str(it.title)}</H> : null}
                    {str(it.text) ? <p data-hc-text="">{str(it.text)}</p> : null}
                    {hasLink(it.link) || hasLink(it.link2) ? (
                      <div data-actions="">
                        {hasLink(it.link) ? (
                          <A link={it.link} base={linkBase} data-look="solid">
                            {it.link.label}
                          </A>
                        ) : null}
                        {hasLink(it.link2) ? (
                          <A link={it.link2} base={linkBase} data-look="outline">
                            {it.link2.label}
                          </A>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
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
                <button key={i} type="button" data-dot="" aria-label={`Go to slide ${i + 1}`} aria-current={i === 0 ? "true" : "false"} />
              ))}
            </div>
          ) : null}
        </Tag>
      );
    }
    case "herobanner": {
      const img = image(p.image);
      const H = headingTag(set.headingTag, "h1");
      return (
        <Tag {...common} data-align={set.align as string} data-valign={set.valign as string} style={{ "--wb-h": `${set.height}vh`, "--wb-overlay": css(set.overlay) } as Vars}>
          {img ? (
            <div data-hb-media="">
              <Img img={img} priority sizes="100vw" />
            </div>
          ) : null}
          <div data-hb-content="">
            {str(p.eyebrow) ? <p data-eyebrow="">{str(p.eyebrow)}</p> : null}
            {str(p.title) ? <H>{str(p.title)}</H> : null}
            {str(p.text) ? <p data-hb-text="">{str(p.text)}</p> : null}
            {hasLink(p.link) || hasLink(p.link2) ? (
              <div data-actions="">
                {hasLink(p.link) ? (
                  <A link={p.link} base={linkBase} data-look="solid">
                    {p.link.label}
                  </A>
                ) : null}
                {hasLink(p.link2) ? (
                  <A link={p.link2} base={linkBase} data-look="outline">
                    {p.link2.label}
                  </A>
                ) : null}
              </div>
            ) : null}
          </div>
        </Tag>
      );
    }
    case "imagebanner": {
      const img = image(p.image);
      const showText = set.position !== "none" && (str(p.title) || str(p.text) || hasLink(p.link));
      return (
        <Tag {...common} data-position={set.position as string} data-zoom={set.zoom ? "" : undefined} style={{ "--wb-aspect": String(set.aspect), "--wb-overlay": css(set.overlay) } as Vars}>
          <div data-ib-media="">{img ? <Img img={img} sizes="100vw" /> : null}</div>
          {showText ? (
            <div data-ib-caption="">
              {str(p.title) ? <h3>{str(p.title)}</h3> : null}
              {str(p.text) ? <p>{str(p.text)}</p> : null}
              {hasLink(p.link) ? (
                <A link={p.link} base={linkBase} data-stretch="">
                  {p.link.label}
                </A>
              ) : null}
            </div>
          ) : null}
        </Tag>
      );
    }

    // ── Composite cards ─────────────────────────────────────────────────────
    case "projectgrid": {
      const list = items(p.items);
      const cats: string[] = [];
      for (const it of list) {
        const c = str(it.category).trim();
        if (c && !cats.includes(c) && cats.length < 8) cats.push(c);
      }
      const name = domId("pg", node.id);
      const filter = !!set.filter && cats.length > 1;
      return (
        <Tag {...common} data-caption={set.caption as string} style={{ "--wb-cols": Number(set.columns), "--wb-aspect": String(set.aspect) } as Vars}>
          {filter ? (
            <div data-pg-filters="" role="radiogroup" aria-label="Filter projects">
              {[str(set.allLabel) || "All", ...cats].map((c, i) => (
                <label key={i}>
                  <input type="radio" name={name} data-pg-filter={String(i)} defaultChecked={i === 0} />
                  <span>{c}</span>
                </label>
              ))}
            </div>
          ) : null}
          <ul data-pg-list="">
            {list.map((it, i) => {
              const img = image(it.image);
              const ci = cats.indexOf(str(it.category).trim());
              const body = (
                <>
                  <span data-pg-media="">{img ? <Img img={img} sizes="(max-width: 767px) 100vw, 33vw" /> : null}</span>
                  <span data-pg-text="">
                    {str(it.category) ? <small>{str(it.category)}</small> : null}
                    <strong>{str(it.title)}</strong>
                  </span>
                </>
              );
              return (
                <li key={i} data-pg-item="" data-cat={ci >= 0 ? String(ci + 1) : undefined}>
                  {hasHref(it.link) ? (
                    <A link={it.link} base={linkBase} aria-label={str(it.title) || (it.link as LinkValue).label || undefined}>
                      {body}
                    </A>
                  ) : (
                    <div>{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </Tag>
      );
    }
    case "imagebox": {
      const img = image(p.image);
      const H = headingTag(set.titleTag);
      return (
        <Tag {...common} data-layout={set.layout as string} data-zoom={set.zoom ? "" : undefined} data-hover={set.hover !== "none" ? (set.hover as string) : undefined} style={{ "--wb-aspect": String(set.aspect) } as Vars}>
          <div data-ibx-media="">{img ? <Img img={img} sizes="(max-width: 767px) 100vw, 33vw" /> : null}</div>
          <div data-ibx-body="">
            {str(p.title) ? <H>{str(p.title)}</H> : null}
            {str(p.text) ? <p>{str(p.text)}</p> : null}
            {hasLink(p.link) ? (
              <A link={p.link} base={linkBase} data-ibx-link="">
                {p.link.label}
                <SiteIcon name="arrow-right" />
              </A>
            ) : null}
          </div>
        </Tag>
      );
    }
    case "iconlist":
      return (
        <Tag {...common} data-layout={set.layout as string} data-dividers={set.dividers && set.layout === "list" ? "" : undefined} style={{ "--wb-icon": `${set.iconSize}px`, "--wb-icon-color": css(set.iconColor) } as Vars}>
          <ul>
            {items(p.items).map((it, i) => {
              const inner = (
                <>
                  {str(it.icon) ? (
                    <span data-il-icon="">
                      <SiteIcon name={str(it.icon)} size="1em" />
                    </span>
                  ) : null}
                  <span>{str(it.text)}</span>
                </>
              );
              return <li key={i}>{hasHref(it.link) ? <A link={it.link} base={linkBase}>{inner}</A> : inner}</li>;
            })}
          </ul>
        </Tag>
      );
    case "profilecard": {
      const photo = image(p.photo);
      const links = items(p.items).filter((it) => hasHref(it.link));
      return (
        <Tag {...common} data-layout={set.layout as string} data-photo={set.photoShape as string} style={{ "--wb-photo": `${set.photoSize}px` } as Vars}>
          <div data-pc-photo="">{photo ? <Img img={photo} sizes={`${set.photoSize}px`} /> : <SiteIcon name="user" size="40%" />}</div>
          <div data-pc-body="">
            {str(p.name) ? <h3>{str(p.name)}</h3> : null}
            {str(p.role) ? <p data-pc-role="">{str(p.role)}</p> : null}
            {str(p.bio) ? <p data-pc-bio="">{str(p.bio)}</p> : null}
            {links.length ? (
              <ul data-pc-social="">
                {links.map((it, i) => {
                  const network = str(it.network) || "website";
                  const link = it.link as LinkValue;
                  const label = link.label || BRAND_ICONS[network]?.label || "Website";
                  const external = /^https?:/.test(link.href);
                  return (
                    <li key={i}>
                      <a href={withBase(link.href, linkBase)} aria-label={label} title={label} target={external ? "_blank" : undefined} rel={external ? "me noopener noreferrer" : undefined}>
                        <SocialGlyph network={network} />
                      </a>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        </Tag>
      );
    }

    // ── Interactive & UI ────────────────────────────────────────────────────
    case "alert": {
      const tone = String(set.tone);
      const id = domId("al", node.id);
      return (
        <Tag {...common} role="note" data-tone={tone} data-look={set.look as string}>
          {set.dismissible && !editor ? <input type="checkbox" id={id} data-alert-dismiss="" hidden /> : null}
          {set.showIcon ? (
            <span data-alert-icon="">
              <SiteIcon name={ALERT_ICONS[tone] ?? "info"} />
            </span>
          ) : null}
          <div data-alert-body="">
            {str(p.title) ? <strong>{str(p.title)}</strong> : null}
            {str(p.text) ? <p>{str(p.text)}</p> : null}
            {hasLink(p.link) ? (
              <A link={p.link} base={linkBase} data-alert-link="">
                {p.link.label}
              </A>
            ) : null}
          </div>
          {set.dismissible ? (
            <label htmlFor={editor ? undefined : id} data-alert-close="" aria-label="Close" title="Close">
              <SiteIcon name="x" />
            </label>
          ) : null}
        </Tag>
      );
    }

    // ── Custom code ─────────────────────────────────────────────────────────
    case "shortcode": {
      const parts = parseShortcodes(str(set.code));
      if (!parts.length) return editor ? <div {...common} data-empty="" aria-label="Shortcode (write it under Settings)" /> : null;
      return (
        <Tag {...common}>
          {parts.map((part, i) => ("text" in part ? <Fragment key={i}>{part.text}</Fragment> : <Fragment key={i}>{<Shortcode code={part.code} attrs={part.attrs} raw={part.raw} a={a} />}</Fragment>))}
        </Tag>
      );
    }
    case "codesnippet": {
      const code = str(p.code).replace(/\r\n?/g, "\n").replace(/\n$/, "");
      const lines = code.split("\n");
      const lang = String(set.language);
      return (
        <Tag {...common} data-theme={set.theme as string} data-wrap={set.wrap ? "" : undefined} data-numbers={set.lineNumbers ? "" : undefined}>
          {str(set.filename) || set.copy ? (
            <div data-cs-bar="">
              <span>{str(set.filename) || lang.toUpperCase()}</span>
              {set.copy ? (
                <button type="button" data-copy="" aria-label="Copy code">
                  <SiteIcon name="copy" />
                  <span data-copy-label="">Copy</span>
                </button>
              ) : null}
            </div>
          ) : null}
          <pre tabIndex={0}>
            <code data-lang={lang}>
              {lines.map((l, i) => (
                <span key={i} data-ln="">
                  {l}
                  {i < lines.length - 1 ? "\n" : null}
                </span>
              ))}
            </code>
          </pre>
        </Tag>
      );
    }
  }
}

/** Whether a catalog widget needs the live-site enhancer (carousel controls, copy buttons). */
export function catalogNeedsEnhancer(node: BuilderNode) {
  return node.type === "herocarousel" || (node.type === "codesnippet" && node.props.copy !== false);
}
