import type { Binding, BuilderDocument, BuilderNode, ImageValue, ResponsiveStyle, SemanticTag, StyleProps, WidgetType } from "@/lib/builder/types";
import type { ProductGridProps } from "@/lib/commerce/types";
import type { Blueprint, Link, LoopCard, PageSpec, SectionSpec, Tone } from "./types";
import { blueprintCurrency } from "./content";

/**
 * Expands a blueprint into builder documents: every page gets the shared
 * header and footer around its sections, and shops also get a product page
 * template. Output depends only on the blueprint and the context (the new
 * site's name, its image values and the ids its rows were given), so the
 * gallery preview and the seeder produce the same trees, and tests can
 * compare a seeded site with its specification node for node.
 *
 * Styles only reference design tokens (`var(--color-*)`, `--text-*`,
 * `--radius-*`…), so a designer restyles a whole template from the design
 * system screen.
 */

export interface CompileContext {
  siteName: string;
  /** Image values by blueprint image key. */
  images: Record<string, ImageValue>;
  /** Post type ids by blueprint key. */
  postTypeIds: Record<string, string>;
  /** Product ids by slug. */
  productIds: Record<string, string>;
}

export interface CompiledPage {
  slug: string;
  title: string;
  seo: { title: string; description: string };
  document: BuilderDocument;
}

export interface CompiledBlueprint {
  pages: CompiledPage[];
  notFound: BuilderDocument;
  /** Renders /products/<slug>; only for blueprints with products. */
  productTemplate: BuilderDocument | null;
}

type Opts = { name?: string; tag?: SemanticTag; props?: Record<string, unknown>; style?: ResponsiveStyle; children?: string[]; bindings?: Record<string, Binding> };

class Doc {
  nodes: Record<string, BuilderNode> = {};
  add(id: string, type: WidgetType, o: Opts = {}): string {
    if (this.nodes[id]) throw new Error(`Duplicate node id ${id}`);
    const node: BuilderNode = { id, type, props: o.props ?? {}, style: o.style ?? {} };
    if (o.name) node.name = o.name;
    if (o.tag) node.tag = o.tag;
    if (o.bindings) node.bindings = o.bindings;
    if (type === "section" || type === "container" || type === "loop") node.children = o.children ?? [];
    this.nodes[id] = node;
    return id;
  }
  done(rootId: string): BuilderDocument {
    return { version: 1, rootId, nodes: this.nodes };
  }
}

const SHELL: StyleProps = { width: "100%", maxWidth: "1200px", margin: "0 auto" };

const PADDING = {
  compact: "clamp(3rem, 2rem + 4cqi, 5rem) clamp(1.25rem, 4cqi, 2.5rem)",
  regular: "clamp(4rem, 2.5rem + 6cqi, 7rem) clamp(1.25rem, 4cqi, 2.5rem)",
  airy: "clamp(5rem, 3rem + 8cqi, 9.5rem) clamp(1.25rem, 4cqi, 2.5rem)",
};

/** Colours for one band, so text stays readable on every tone. */
interface Palette {
  bg?: string;
  heading: string;
  text: string;
  muted: string;
  accent: string;
  card: string;
  border: string;
  btnBg: string;
  btnText: string;
}

const mix = (color: string, pct: number) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;

function palette(tone: Tone = "base"): Palette {
  switch (tone) {
    case "alt":
      return { bg: "var(--color-surface-low)", heading: "var(--color-heading)", text: "var(--color-text)", muted: "var(--color-muted)", accent: "var(--color-accent)", card: "var(--color-surface-high)", border: "var(--color-border)", btnBg: "var(--color-primary)", btnText: "var(--color-on-primary)" };
    case "inverse":
      return { bg: "var(--color-heading)", heading: "var(--color-background)", text: mix("var(--color-background)", 82), muted: mix("var(--color-background)", 62), accent: "var(--color-accent)", card: mix("var(--color-background)", 7), border: mix("var(--color-background)", 16), btnBg: "var(--color-background)", btnText: "var(--color-heading)" };
    case "primary":
      return { bg: "var(--color-primary)", heading: "var(--color-on-primary)", text: mix("var(--color-on-primary)", 88), muted: mix("var(--color-on-primary)", 70), accent: "var(--color-on-primary)", card: mix("var(--color-on-primary)", 10), border: mix("var(--color-on-primary)", 22), btnBg: "var(--color-on-primary)", btnText: "var(--color-primary)" };
    default:
      return { heading: "var(--color-heading)", text: "var(--color-text)", muted: "var(--color-muted)", accent: "var(--color-accent)", card: "var(--color-surface-low)", border: "var(--color-border)", btnBg: "var(--color-primary)", btnText: "var(--color-on-primary)" };
  }
}

const cols = (n: number) => `repeat(${n}, minmax(0, 1fr))`;
/** Grid columns that step down on tablets and phones. */
const grid = (n: number, gap = "clamp(1rem, 2.5cqi, 1.75rem)"): ResponsiveStyle => ({
  desktop: { display: "grid", gridTemplateColumns: cols(n), gap },
  ...(n > 2 ? { tablet: { gridTemplateColumns: cols(2) } } : {}),
  mobile: { gridTemplateColumns: cols(1) },
});

/** Compiles one blueprint. Throws if the context is missing an id the pages need. */
export function compileBlueprint(bp: Blueprint, ctx: CompileContext): CompiledBlueprint {
  const t = (s: string) => s.replaceAll("{{site}}", ctx.siteName);
  const shop = bp.products.length > 0;
  const look = bp.look;
  const heading = (size: "display" | "h1" | "h2" | "h3" | "h4", p: Palette, extra: StyleProps = {}): ResponsiveStyle => ({
    desktop: {
      fontFamily: size === "display" || size === "h1" ? "var(--font-display)" : "var(--font-heading)",
      fontSize: `var(--text-${size})`,
      lineHeight: size === "h3" || size === "h4" ? "var(--leading-snug)" : "var(--leading-tight)",
      letterSpacing: look.headings === "uppercase" ? "0.02em" : size === "h4" ? "var(--tracking-snug)" : "var(--tracking-tight)",
      ...(look.headings === "uppercase" ? { textTransform: "uppercase" as const } : {}),
      color: p.heading,
      ...extra,
    },
  });
  const cardStyle = (p: Palette, extra: StyleProps = {}): StyleProps => ({
    display: "flex",
    flexDirection: "column",
    gap: ".75rem",
    padding: "clamp(1.25rem, 2.5cqi, 1.75rem)",
    borderRadius: "var(--radius-card)",
    ...(look.cards === "flat" ? { background: p.card } : look.cards === "bordered" ? { border: `1px solid ${p.border}` } : { background: p.bg ? p.card : "var(--color-surface-high)", boxShadow: "var(--shadow-md)", border: `1px solid ${p.border}` }),
    ...extra,
  });
  const image = (key: string) => {
    const img = ctx.images[key];
    if (!img) throw new Error(`No image value for "${key}"`);
    return img;
  };
  const postTypeId = (key: string) => {
    const id = ctx.postTypeIds[key];
    if (!id) throw new Error(`No post type id for "${key}"`);
    return id;
  };

  function header(d: Doc): string {
    const h = bp.header;
    const nav = h.nav.map((l, i) =>
      d.add(`hdr-nav-${i}`, "button", { name: "Nav link", props: { link: { label: t(l.label), href: l.href } }, style: { desktop: { color: "var(--color-text)", fontSize: ".9375rem", fontWeight: "500" } } }),
    );
    const right: string[] = [];
    if (shop) right.push(d.add("hdr-cart", "cart", { name: "Cart", props: { label: "Cart" }, style: { desktop: { fontSize: ".875rem", color: "var(--color-heading)" } } }));
    if (h.action) {
      right.push(d.add("hdr-action", "button", {
        name: "Header button",
        props: { link: { label: t(h.action.label), href: h.action.href } },
        style: { desktop: { background: "var(--color-primary)", color: "var(--color-on-primary)", padding: ".6rem 1.1rem", borderRadius: "var(--radius-button)", fontSize: ".875rem", fontWeight: "600" }, mobile: { padding: ".55rem .9rem" } },
      }));
    }
    d.add("hdr-logo", "heading", { name: "Logo", tag: "h4", props: { text: t(h.logo) }, style: heading("h4", palette(), { fontSize: "1.25rem", fontWeight: "700", letterSpacing: "var(--tracking-snug)" }) });
    d.add("hdr-nav", "container", { name: "Navigation", tag: "nav", children: nav, style: { desktop: { display: "flex", gap: "clamp(1rem, 2.5cqi, 2rem)", alignItems: "center" }, tablet: { display: "none" } } });
    d.add("hdr-right", "container", { name: "Header actions", children: right, style: { desktop: { display: "flex", gap: "1rem", alignItems: "center" } } });
    d.add("hdr-row", "container", { name: "Header row", children: ["hdr-logo", "hdr-nav", "hdr-right"], style: { desktop: { ...SHELL, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1.5rem" } } });
    return d.add("hdr", "section", {
      name: "Header",
      tag: "header",
      children: ["hdr-row"],
      style: { desktop: { padding: "1.1rem clamp(1.25rem, 4cqi, 2.5rem)", background: "var(--color-background)", ...(look.headerBorder ? { boxShadow: "inset 0 -1px 0 var(--color-border)" } : {}) } },
    });
  }

  function footer(d: Doc): string {
    const f = bp.footer;
    d.add("ftr-logo", "heading", { name: "Footer logo", tag: "h4", props: { text: t(bp.header.logo) }, style: heading("h4", palette(), { fontSize: "1.2rem", fontWeight: "700" }) });
    d.add("ftr-text", "text", { name: "Footer text", props: { text: t(f.text) }, style: { desktop: { color: "var(--color-muted)", fontSize: ".9375rem", maxWidth: "34ch" } } });
    d.add("ftr-brand", "container", { name: "Footer brand", children: ["ftr-logo", "ftr-text"], style: { desktop: { display: "flex", flexDirection: "column", gap: ".75rem" } } });
    const columns = f.columns.map((c, i) => {
      const links = c.links.map((l, j) =>
        d.add(`ftr-c${i}-l${j}`, "button", { name: "Footer link", props: { link: { label: t(l.label), href: l.href } }, style: { desktop: { color: "var(--color-muted)", fontSize: ".9375rem", justifyContent: "flex-start" } } }),
      );
      d.add(`ftr-c${i}-title`, "heading", { name: "Column title", tag: "h4", props: { text: t(c.title) }, style: { desktop: { fontFamily: "var(--font-body)", fontSize: ".8125rem", letterSpacing: "var(--tracking-wide)", textTransform: "uppercase", color: "var(--color-heading)", fontWeight: "600" } } });
      return d.add(`ftr-c${i}`, "container", { name: "Footer column", children: [`ftr-c${i}-title`, ...links], style: { desktop: { display: "flex", flexDirection: "column", gap: ".6rem", alignItems: "flex-start" } } });
    });
    d.add("ftr-top", "container", {
      name: "Footer columns",
      children: ["ftr-brand", ...columns],
      style: { desktop: { display: "grid", gridTemplateColumns: `minmax(0, 1.6fr) ${columns.length ? `repeat(${columns.length}, minmax(0, 1fr))` : ""}`.trim(), gap: "2rem" }, tablet: { gridTemplateColumns: cols(2) }, mobile: { gridTemplateColumns: cols(1) } },
    });
    d.add("ftr-legal", "text", { name: "Legal", props: { text: t(f.legal) }, style: { desktop: { color: "var(--color-muted)", fontSize: ".8125rem", padding: "1.5rem 0 0", boxShadow: "inset 0 1px 0 var(--color-border)" } } });
    d.add("ftr-inner", "container", { name: "Footer inner", children: ["ftr-top", "ftr-legal"], style: { desktop: { ...SHELL, display: "flex", flexDirection: "column", gap: "2.5rem" } } });
    return d.add("ftr", "section", { name: "Footer", tag: "footer", children: ["ftr-inner"], style: { desktop: { padding: "clamp(3rem, 6cqi, 4.5rem) clamp(1.25rem, 4cqi, 2.5rem) 2rem", background: "var(--color-surface-low)", boxShadow: "inset 0 1px 0 var(--color-border)" } } });
  }

  function section(d: Doc, s: SectionSpec, i: number): string {
    const id = (part: string) => `s${i}-${part}`;
    const p = palette(s.tone);
    const kids: string[] = [];
    const eyebrow = (center = false) =>
      s.eyebrow
        ? d.add(id("eyebrow"), "text", { name: "Eyebrow", props: { text: t(s.eyebrow) }, style: { desktop: { fontSize: "var(--text-small)", letterSpacing: "var(--tracking-wide)", textTransform: "uppercase", fontWeight: "600", color: p.accent, ...(center ? { textAlign: "center" } : {}) } } })
        : null;
    const lead = (text: string | undefined, key = "text", center = false) =>
      text ? d.add(id(key), "text", { name: "Lead", props: { text: t(text) }, style: { desktop: { fontSize: "var(--text-lead)", color: p.text, maxWidth: "62ch", ...(center ? { textAlign: "center" } : {}) } } }) : null;
    const button = (key: string, l: Link, kind: "primary" | "ghost", extra: StyleProps = {}) =>
      d.add(id(key), "button", {
        name: kind === "primary" ? "Button" : "Secondary button",
        props: { link: { label: t(l.label), href: l.href } },
        style: {
          desktop: kind === "primary"
            ? { background: p.btnBg, color: p.btnText, padding: ".85rem 1.4rem", borderRadius: "var(--radius-button)", fontWeight: "600", fontSize: ".9375rem", ...extra }
            : { color: p.heading, padding: ".85rem 1.4rem", borderRadius: "var(--radius-button)", border: `1px solid ${p.border}`, fontWeight: "600", fontSize: ".9375rem", ...extra },
        },
      });
    const actions = (links: Link[] | undefined, center = false) =>
      links?.length
        ? d.add(id("actions"), "container", { name: "Buttons", children: links.map((l, j) => button(`btn-${j}`, l, j === 0 ? "primary" : "ghost")), style: { desktop: { display: "flex", flexWrap: "wrap", gap: ".75rem", ...(center ? { justifyContent: "center" } : {}) } } })
        : null;
    /** Eyebrow, title and lead stacked, the usual section intro. */
    const intro = (center = false, size: "h2" | "display" | "h1" = "h2", tag: SemanticTag = size === "h2" ? "h2" : "h1") => {
      const parts = [eyebrow(center), s.title ? d.add(id("title"), "heading", { name: "Title", tag, props: { text: t(s.title) }, style: heading(size, p, { maxWidth: size === "h2" ? "24ch" : "18ch", ...(center ? { textAlign: "center", margin: "0 auto" } : {}) }) }) : null, lead(s.text, "text", center)].filter((x): x is string => !!x);
      return parts.length ? d.add(id("intro"), "container", { name: "Intro", children: parts, style: { desktop: { display: "flex", flexDirection: "column", gap: "1rem", ...(center ? { alignItems: "center", textAlign: "center" } : {}) } } }) : null;
    };
    const img = (key: string, imageKey: string, style: StyleProps) => d.add(id(key), "image", { name: "Image", props: { image: image(imageKey) }, style: { desktop: { objectFit: "cover", borderRadius: "var(--radius-card)", ...style } } });
    const bullets = (list: string[] | undefined) =>
      list?.length
        ? d.add(id("bullets"), "container", { name: "Bullets", children: list.map((b, j) => d.add(id(`bullet-${j}`), "text", { name: "Bullet", props: { text: `✓  ${t(b)}` }, style: { desktop: { color: p.text } } })), style: { desktop: { display: "flex", flexDirection: "column", gap: ".6rem" } } })
        : null;
    const push = (...ids: (string | null)[]) => kids.push(...ids.filter((x): x is string => !!x));

    switch (s.kind) {
      case "hero": {
        if (s.variant === "split") {
          const text = d.add(id("copy"), "container", { name: "Hero copy", children: [intro(false, "display", "h1"), actions(s.actions), s.note ? d.add(id("note"), "text", { name: "Note", props: { text: t(s.note) }, style: { desktop: { fontSize: "var(--text-small)", color: p.muted } } }) : null].filter((x): x is string => !!x), style: { desktop: { display: "flex", flexDirection: "column", gap: "1.75rem", justifyContent: "center" } } });
          push(d.add(id("grid"), "container", { name: "Hero grid", children: [text, img("image", s.image!, { aspectRatio: "4 / 5", boxShadow: "var(--shadow-lg)" })], style: { desktop: { display: "grid", gridTemplateColumns: "minmax(0, 1.05fr) minmax(0, .95fr)", gap: "clamp(2rem, 5cqi, 4.5rem)", alignItems: "center" }, mobile: { gridTemplateColumns: cols(1) } } }));
        } else if (s.variant === "banner") {
          const left = d.add(id("left"), "container", { name: "Hero title", children: [eyebrow(), d.add(id("title"), "heading", { name: "Title", tag: "h1", props: { text: t(s.title) }, style: heading("display", p, { maxWidth: "16ch" }) })].filter((x): x is string => !!x), style: { desktop: { display: "flex", flexDirection: "column", gap: "1rem" } } });
          const right = d.add(id("right"), "container", { name: "Hero copy", children: [lead(s.text), actions(s.actions)].filter((x): x is string => !!x), style: { desktop: { display: "flex", flexDirection: "column", gap: "1.5rem", justifyContent: "flex-end" } } });
          push(
            d.add(id("top"), "container", { name: "Hero text", children: [left, right], style: { desktop: { display: "grid", gridTemplateColumns: "minmax(0, 1.3fr) minmax(0, .7fr)", gap: "2.5rem", alignItems: "end" }, mobile: { gridTemplateColumns: cols(1) } } }),
            img("image", s.image!, { aspectRatio: "21 / 9", width: "100%" }),
          );
        } else {
          const center = s.variant === "centered";
          push(intro(center, "display", "h1"), actions(s.actions, center));
          if (s.note) push(d.add(id("note"), "text", { name: "Note", props: { text: t(s.note) }, style: { desktop: { fontSize: "var(--text-small)", color: p.muted, ...(center ? { textAlign: "center" } : {}) } } }));
          if (s.image) push(img("image", s.image, { aspectRatio: "16 / 9", width: "100%", maxWidth: "1100px", margin: "1.5rem auto 0", boxShadow: "var(--shadow-lg)", border: `1px solid ${p.border}` }));
        }
        break;
      }
      case "logos": {
        push(s.title ? d.add(id("title"), "text", { name: "Title", props: { text: t(s.title) }, style: { desktop: { textAlign: "center", color: p.muted, fontSize: "var(--text-small)", letterSpacing: "var(--tracking-wide)", textTransform: "uppercase" } } }) : null);
        push(d.add(id("row"), "container", {
          name: "Logos",
          children: s.items.map((name, j) => d.add(id(`logo-${j}`), "text", { name: "Logo", props: { text: t(name) }, style: { desktop: { fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "1.35rem", letterSpacing: "var(--tracking-tight)", color: p.muted, opacity: ".8" } } })),
          style: { desktop: { display: "flex", flexWrap: "wrap", justifyContent: "space-around", alignItems: "center", gap: "1.5rem 3rem" } },
        }));
        break;
      }
      case "features": {
        push(intro());
        const items = s.items.map((f, j) => {
          const parts = [
            f.icon ? d.add(id(`f${j}-icon`), "text", { name: "Icon", props: { text: f.icon }, style: { desktop: { display: "flex", alignItems: "center", justifyContent: "center", width: "2.75rem", minHeight: "2.75rem", borderRadius: "var(--radius-md)", background: s.tone === "inverse" || s.tone === "primary" ? p.card : mix("var(--color-accent)", 14), fontSize: "1.25rem", color: p.heading } } }) : null,
            d.add(id(`f${j}-title`), "heading", { name: "Feature title", tag: "h3", props: { text: t(f.title) }, style: heading("h4", p) }),
            d.add(id(`f${j}-text`), "text", { name: "Feature text", props: { text: t(f.text) }, style: { desktop: { color: p.muted } } }),
          ].filter((x): x is string => !!x);
          return d.add(id(`f${j}`), "container", { name: "Feature", children: parts, style: { desktop: cardStyle(p) } });
        });
        push(d.add(id("grid"), "container", { name: "Features", children: items, style: grid(s.columns ?? 3) }));
        break;
      }
      case "split": {
        const copy = d.add(id("copy"), "container", { name: "Copy", children: [intro(), bullets(s.bullets), s.action ? button("action", s.action, "primary") : null].filter((x): x is string => !!x), style: { desktop: { display: "flex", flexDirection: "column", gap: "1.5rem", justifyContent: "center", alignItems: "flex-start" } } });
        const picture = img("image", s.image, { aspectRatio: "5 / 4" });
        push(d.add(id("grid"), "container", { name: "Split", children: s.reverse ? [picture, copy] : [copy, picture], style: { desktop: { display: "grid", gridTemplateColumns: cols(2), gap: "clamp(2rem, 5cqi, 4.5rem)", alignItems: "center" }, mobile: { gridTemplateColumns: cols(1) } } }));
        break;
      }
      case "stats": {
        push(intro(true));
        push(d.add(id("grid"), "container", {
          name: "Stats",
          children: s.items.map((st, j) =>
            d.add(id(`st${j}`), "container", {
              name: "Stat",
              children: [
                d.add(id(`st${j}-value`), "heading", { name: "Value", tag: "h3", props: { text: t(st.value) }, style: heading("h1", p, { fontFamily: "var(--font-display)" }) }),
                d.add(id(`st${j}-label`), "text", { name: "Label", props: { text: t(st.label) }, style: { desktop: { color: p.muted } } }),
              ],
              style: { desktop: { display: "flex", flexDirection: "column", gap: ".35rem", padding: "0 0 0 1.25rem", boxShadow: `inset 1px 0 0 ${p.border}` } },
            }),
          ),
          style: grid(s.items.length),
        }));
        break;
      }
      case "steps": {
        push(intro());
        push(d.add(id("grid"), "container", {
          name: "Steps",
          children: s.items.map((st, j) =>
            d.add(id(`sp${j}`), "container", {
              name: "Step",
              children: [
                d.add(id(`sp${j}-n`), "text", { name: "Number", props: { text: String(j + 1).padStart(2, "0") }, style: { desktop: { fontFamily: "var(--font-mono)", color: p.accent, fontWeight: "600" } } }),
                d.add(id(`sp${j}-title`), "heading", { name: "Step title", tag: "h3", props: { text: t(st.title) }, style: heading("h4", p) }),
                d.add(id(`sp${j}-text`), "text", { name: "Step text", props: { text: t(st.text) }, style: { desktop: { color: p.muted } } }),
              ],
              style: { desktop: cardStyle(p) },
            }),
          ),
          style: grid(Math.min(s.items.length, 4)),
        }));
        break;
      }
      case "pricing": {
        push(intro(true));
        push(d.add(id("grid"), "container", {
          name: "Pricing",
          children: s.tiers.map((tier, j) => {
            const parts = [
              tier.featured ? d.add(id(`t${j}-badge`), "text", { name: "Badge", props: { text: "Most popular" }, style: { desktop: { fontSize: "var(--text-small)", fontWeight: "600", color: "var(--color-primary)", letterSpacing: "var(--tracking-wide)", textTransform: "uppercase" } } }) : null,
              d.add(id(`t${j}-name`), "heading", { name: "Plan", tag: "h3", props: { text: t(tier.name) }, style: heading("h4", p) }),
              d.add(id(`t${j}-desc`), "text", { name: "Plan description", props: { text: t(tier.description) }, style: { desktop: { color: p.muted, fontSize: ".9375rem" } } }),
              d.add(id(`t${j}-pricing`), "container", {
                name: "Price",
                children: [
                  d.add(id(`t${j}-price`), "heading", { name: "Price", tag: "h4", props: { text: t(tier.price) }, style: heading("h2", p, { fontFamily: "var(--font-display)" }) }),
                  ...(tier.period ? [d.add(id(`t${j}-period`), "text", { name: "Period", props: { text: t(tier.period) }, style: { desktop: { color: p.muted, fontSize: ".9375rem" } } })] : []),
                ],
                style: { desktop: { display: "flex", alignItems: "baseline", gap: ".4rem", flexWrap: "wrap" } },
              }),
              d.add(id(`t${j}-features`), "text", { name: "Plan features", props: { text: tier.features.map((f) => `✓  ${t(f)}`).join("\n") }, style: { desktop: { color: p.text, lineHeight: "2" } } }),
              button(`t${j}-btn`, tier.action, tier.featured ? "primary" : "ghost", { width: "100%", margin: "auto 0 0" }),
            ].filter((x): x is string => !!x);
            return d.add(id(`t${j}`), "container", { name: "Plan card", children: parts, style: { desktop: cardStyle(p, { gap: "1rem", ...(tier.featured ? { border: "2px solid var(--color-primary)", boxShadow: "var(--shadow-lg)" } : {}) }) } });
          }),
          style: { ...grid(s.tiers.length), desktop: { display: "grid", gridTemplateColumns: cols(s.tiers.length), gap: "1.25rem", alignItems: "stretch" } },
        }));
        break;
      }
      case "testimonials": {
        push(intro(true));
        push(d.add(id("grid"), "container", {
          name: "Testimonials",
          children: s.items.map((q, j) =>
            d.add(id(`q${j}`), "container", {
              name: "Testimonial",
              tag: "article",
              children: [
                d.add(id(`q${j}-quote`), "text", { name: "Quote", props: { text: `“${t(q.quote)}”` }, style: { desktop: { fontSize: "var(--text-lead)", color: p.heading, lineHeight: "var(--leading-snug)" } } }),
                d.add(id(`q${j}-name`), "text", { name: "Name", props: { text: t(q.name) }, style: { desktop: { fontWeight: "600", color: p.heading, margin: "auto 0 0" } } }),
                d.add(id(`q${j}-role`), "text", { name: "Role", props: { text: t(q.role) }, style: { desktop: { color: p.muted, fontSize: ".9375rem" } } }),
              ],
              style: { desktop: cardStyle(p, { gap: "1rem" }) },
            }),
          ),
          style: grid(Math.min(s.items.length, 3)),
        }));
        break;
      }
      case "cta": {
        push(d.add(id("box"), "container", { name: "Call to action", children: [intro(true), actions(s.actions, true)].filter((x): x is string => !!x), style: { desktop: { display: "flex", flexDirection: "column", gap: "1.75rem", alignItems: "center", textAlign: "center", maxWidth: "760px", margin: "0 auto" } } }));
        break;
      }
      case "faq": {
        const qa = s.items.map((item, j) =>
          d.add(id(`qa${j}`), "container", {
            name: "Question",
            children: [
              d.add(id(`qa${j}-q`), "heading", { name: "Question", tag: "h3", props: { text: t(item.q) }, style: heading("h4", p) }),
              d.add(id(`qa${j}-a`), "text", { name: "Answer", props: { text: t(item.a) }, style: { desktop: { color: p.muted } } }),
            ],
            style: { desktop: { display: "flex", flexDirection: "column", gap: ".5rem", padding: "0 0 1.5rem", boxShadow: `inset 0 -1px 0 ${p.border}` } },
          }),
        );
        push(d.add(id("grid"), "container", { name: "FAQ", children: [intro()!, d.add(id("list"), "container", { name: "Questions", children: qa, style: { desktop: { display: "flex", flexDirection: "column", gap: "1.5rem" } } })], style: { desktop: { display: "grid", gridTemplateColumns: "minmax(0, .8fr) minmax(0, 1.2fr)", gap: "clamp(2rem, 5cqi, 4rem)" }, mobile: { gridTemplateColumns: cols(1) } } }));
        break;
      }
      case "gallery": {
        push(intro());
        const n = s.columns ?? 3;
        push(d.add(id("gallery"), "gallery", { name: "Gallery", props: { images: s.images.map(image) }, style: { desktop: { display: "grid", gridTemplateColumns: cols(n), gap: "clamp(.5rem, 1.5cqi, 1rem)", borderRadius: "var(--radius-card)" }, mobile: { gridTemplateColumns: cols(2) } } }));
        break;
      }
      case "products": {
        push(intro());
        const props: ProductGridProps = { limit: s.limit, sort: s.sort ?? "newest", inStockOnly: false, showSort: !!s.showSort, buttonLabel: s.buttonLabel ?? "Add to cart" };
        push(d.add(id("grid"), "productgrid", { name: "Product grid", props: { ...props }, style: grid(s.columns ?? 3) }));
        break;
      }
      case "product": {
        push(intro());
        const productId = ctx.productIds[s.product];
        if (!productId) throw new Error(`No product id for "${s.product}"`);
        push(d.add(id("product"), "product", { name: "Product details", props: { productId, buttonLabel: s.buttonLabel ?? "Add to cart" }, style: { desktop: { display: "grid", gridTemplateColumns: cols(2), gap: "clamp(2rem, 5cqi, 4rem)" }, mobile: { gridTemplateColumns: cols(1) } } }));
        break;
      }
      case "loop": {
        const pt = bp.postTypes.find((x) => x.key === s.postType)!;
        push(intro());
        const card = loopCard(d, id, s.card, p, pt.fields.map((f) => ({ key: f.key, type: f.type })), s.fields ?? [], s.linkLabel);
        const n = s.columns ?? (s.card === "row" || s.card === "menu" ? 1 : 3);
        push(d.add(id("loop"), "loop", {
          name: "Loop grid",
          children: [card],
          props: { query: { postTypeId: postTypeId(s.postType), limit: s.limit, orderBy: "menu", order: "asc", termId: null, offset: 0 }, emptyText: "Nothing here yet." },
          style: grid(n, s.card === "row" || s.card === "menu" ? "1rem 2.5rem" : undefined),
        }));
        if (s.action) push(d.add(id("more"), "container", { name: "More", children: [button("more-btn", s.action, "ghost")], style: { desktop: { display: "flex", justifyContent: "center" } } }));
        break;
      }
      case "list": {
        push(intro());
        push(d.add(id("grid"), "container", {
          name: "List",
          children: s.items.map((item, j) => {
            const left = d.add(id(`li${j}-copy`), "container", {
              name: "Item",
              children: [
                item.meta ? d.add(id(`li${j}-meta`), "text", { name: "Meta", props: { text: t(item.meta) }, style: { desktop: { fontSize: "var(--text-small)", color: p.accent, letterSpacing: "var(--tracking-wide)", textTransform: "uppercase", fontWeight: "600" } } }) : null,
                d.add(id(`li${j}-title`), "heading", { name: "Item title", tag: "h3", props: { text: t(item.title) }, style: heading("h4", p) }),
                item.text ? d.add(id(`li${j}-text`), "text", { name: "Item text", props: { text: t(item.text) }, style: { desktop: { color: p.muted } } }) : null,
              ].filter((x): x is string => !!x),
              style: { desktop: { display: "flex", flexDirection: "column", gap: ".3rem" } },
            });
            const right = item.price ? d.add(id(`li${j}-price`), "text", { name: "Price", props: { text: t(item.price) }, style: { desktop: { fontFamily: "var(--font-heading)", fontWeight: "600", color: p.heading, fontSize: "1.1rem" } } }) : null;
            return d.add(id(`li${j}`), "container", { name: "List item", children: right ? [left, right] : [left], style: { desktop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1.5rem", padding: "0 0 1.25rem", boxShadow: `inset 0 -1px 0 ${p.border}` } } });
          }),
          style: { desktop: { display: "grid", gridTemplateColumns: cols(s.columns ?? 1), gap: "1.25rem 3rem" }, mobile: { gridTemplateColumns: cols(1) } },
        }));
        break;
      }
      case "prose": {
        push(d.add(id("body"), "container", {
          name: "Article",
          tag: "article",
          children: [intro()!, ...s.paragraphs.map((para, j) => d.add(id(`para-${j}`), "text", { name: "Paragraph", props: { text: t(para) }, style: { desktop: { color: p.text, fontSize: "1.0625rem", lineHeight: "1.75" } } }))],
          style: { desktop: { display: "flex", flexDirection: "column", gap: "1.25rem", maxWidth: "720px", margin: "0 auto", width: "100%" } },
        }));
        break;
      }
      case "contact": {
        const copy = d.add(id("copy"), "container", { name: "Copy", children: [intro(), s.action ? button("action", s.action, "primary") : null].filter((x): x is string => !!x), style: { desktop: { display: "flex", flexDirection: "column", gap: "1.5rem", alignItems: "flex-start" } } });
        const items = s.items.map((item, j) =>
          d.add(id(`ct${j}`), "container", {
            name: "Contact detail",
            children: [
              d.add(id(`ct${j}-label`), "text", { name: "Label", props: { text: t(item.label) }, style: { desktop: { fontSize: "var(--text-small)", color: p.muted, letterSpacing: "var(--tracking-wide)", textTransform: "uppercase" } } }),
              item.href
                ? d.add(id(`ct${j}-value`), "button", { name: "Value", props: { link: { label: t(item.value), href: item.href } }, style: { desktop: { color: p.heading, fontWeight: "600", fontSize: "1.1rem", justifyContent: "flex-start" } } })
                : d.add(id(`ct${j}-value`), "text", { name: "Value", props: { text: t(item.value) }, style: { desktop: { color: p.heading, fontWeight: "600", fontSize: "1.1rem" } } }),
            ],
            style: { desktop: cardStyle(p, { gap: ".4rem" }) },
          }),
        );
        push(d.add(id("grid"), "container", { name: "Contact", children: [copy, d.add(id("details"), "container", { name: "Details", children: items, style: grid(2, "1rem") })], style: { desktop: { display: "grid", gridTemplateColumns: "minmax(0, .9fr) minmax(0, 1.1fr)", gap: "clamp(2rem, 5cqi, 4rem)", alignItems: "start" }, mobile: { gridTemplateColumns: cols(1) } } }));
        break;
      }
      case "code": {
        const copy = d.add(id("copy"), "container", { name: "Copy", children: [intro(), bullets(s.bullets)].filter((x): x is string => !!x), style: { desktop: { display: "flex", flexDirection: "column", gap: "1.5rem", justifyContent: "center" } } });
        // Leading spaces become no-break spaces so indentation survives `white-space: pre-line`.
        const code = s.code.split("\n").map((line) => line.replace(/^ +/, (m) => " ".repeat(m.length))).join("\n");
        const panel = d.add(id("panel"), "container", {
          name: "Code panel",
          children: [
            d.add(id("dots"), "text", { name: "Window bar", props: { text: "●  ●  ●" }, style: { desktop: { color: p.muted, fontSize: ".625rem", letterSpacing: ".2em" } } }),
            d.add(id("code"), "text", { name: "Code", props: { text: code }, style: { desktop: { fontFamily: "var(--font-mono)", fontSize: ".875rem", lineHeight: "1.75", color: "var(--color-text)" } } }),
          ],
          style: { desktop: { display: "flex", flexDirection: "column", gap: "1rem", padding: "1.25rem 1.5rem 1.5rem", background: "var(--color-surface-mid)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-lg)" } },
        });
        push(d.add(id("grid"), "container", { name: "Code example", children: [copy, panel], style: { desktop: { display: "grid", gridTemplateColumns: cols(2), gap: "clamp(2rem, 5cqi, 4rem)", alignItems: "center" }, mobile: { gridTemplateColumns: cols(1) } } }));
        break;
      }
    }

    const inner = d.add(id("inner"), "container", { name: "Inner", children: kids, style: { desktop: { ...SHELL, display: "flex", flexDirection: "column", gap: "clamp(2rem, 4cqi, 3rem)" } } });
    const label = s.kind === "cta" ? "Call to action" : s.kind === "faq" ? "FAQ" : s.kind[0].toUpperCase() + s.kind.slice(1);
    const bandStyle: StyleProps = { padding: PADDING[look.density], ...(p.bg ? { background: p.bg } : {}) };
    if (s.kind === "hero" && s.variant === "centered" && bp.tokens.ambient?.primary && !p.bg) bandStyle.background = "var(--ambient-primary)";
    if (s.kind === "logos") bandStyle.padding = "clamp(2rem, 4cqi, 3rem) clamp(1.25rem, 4cqi, 2.5rem)";
    return d.add(id("band"), "section", { name: label, tag: "section", children: [inner], style: { desktop: { ...bandStyle, color: p.text } } });
  }

  function loopCard(d: Doc, id: (part: string) => string, card: LoopCard, p: Palette, fields: { key: string; type: string }[], show: string[], linkLabel?: string): string {
    const bind = (source: Binding["source"], key: string, fallback?: string): Record<string, Binding> => ({ [source === "post" && key === "featured_image" ? "image" : "text"]: { source, key, ...(fallback ? { fallback } : {}) } });
    const title = (tag: SemanticTag = "h3", size: "h3" | "h4" = "h4") => d.add(id("card-title"), "heading", { name: "Entry title", tag, props: { text: "Entry title" }, bindings: bind("post", "title"), style: heading(size, p) });
    const excerpt = () => d.add(id("card-excerpt"), "text", { name: "Excerpt", props: { text: "" }, bindings: bind("post", "excerpt"), style: { desktop: { color: p.muted } } });
    const fieldTexts = (keys: string[], style: StyleProps) => keys.filter((k) => fields.some((f) => f.key === k && f.type !== "IMAGE")).map((k) => d.add(id(`card-f-${k}`), "text", { name: "Field", props: { text: "" }, bindings: { text: { source: "field", key: k } }, style: { desktop: style } }));
    const metaStyle: StyleProps = { fontSize: "var(--text-small)", color: p.accent, letterSpacing: "var(--tracking-wide)", textTransform: "uppercase", fontWeight: "600" };
    const link = () =>
      linkLabel
        ? d.add(id("card-link"), "button", { name: "Entry link", props: { link: { label: linkLabel, href: "/" } }, bindings: { "link.href": { source: "post", key: "url" } }, style: { desktop: { color: p.heading, fontWeight: "600", fontSize: ".9375rem", justifyContent: "flex-start" } } })
        : null;
    const picture = (ratio: string, radius = "var(--radius-card)") => d.add(id("card-image"), "image", { name: "Featured image", props: { image: { assetId: null, src: "", alt: "" } }, bindings: { image: { source: "post", key: "featured_image" } }, style: { desktop: { aspectRatio: ratio, objectFit: "cover", borderRadius: radius } } });
    const only = (xs: (string | null)[]) => xs.filter((x): x is string => !!x);

    switch (card) {
      case "media": {
        const body = d.add(id("card-body"), "container", { name: "Card body", children: only([...fieldTexts(show.slice(0, 1), metaStyle), title(), excerpt(), ...fieldTexts(show.slice(1), { color: p.text, fontSize: ".9375rem" }), link()]), style: { desktop: { display: "flex", flexDirection: "column", gap: ".55rem", alignItems: "flex-start" } } });
        return d.add(id("card"), "container", { name: "Card", tag: "article", children: [picture("4 / 3"), body], style: { desktop: { display: "flex", flexDirection: "column", gap: "1.1rem" } } });
      }
      case "person":
        return d.add(id("card"), "container", { name: "Person", tag: "article", children: only([picture("1 / 1"), title("h3", "h4"), ...fieldTexts(show, { color: p.muted, fontSize: ".9375rem" }), excerpt()]), style: { desktop: { display: "flex", flexDirection: "column", gap: ".5rem" } } });
      case "row": {
        const copy = d.add(id("card-copy"), "container", { name: "Row copy", children: only([...fieldTexts(show.slice(0, 1), metaStyle), title("h3", "h3"), excerpt(), ...fieldTexts(show.slice(1), { color: p.text, fontSize: ".9375rem" })]), style: { desktop: { display: "flex", flexDirection: "column", gap: ".4rem" } } });
        return d.add(id("card"), "container", { name: "Row", tag: "article", children: only([copy, link()]), style: { desktop: { ...cardStyle(p), flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: "1.5rem" }, mobile: { flexDirection: "column", alignItems: "flex-start" } } });
      }
      case "menu": {
        const price = fields.find((f) => f.type === "PRICE")!;
        const copy = d.add(id("card-copy"), "container", { name: "Dish", children: only([title("h3", "h4"), excerpt(), ...fieldTexts(show.filter((k) => k !== price.key), { ...metaStyle, color: p.muted })]), style: { desktop: { display: "flex", flexDirection: "column", gap: ".3rem" } } });
        const priceNode = d.add(id("card-price"), "price", { name: "Price", tag: "p", props: { price: { amount: 0, currency: blueprintCurrency(bp), compareAt: null } }, bindings: { price: { source: "field", key: price.key } }, style: { desktop: { fontFamily: "var(--font-heading)", fontWeight: "600", color: p.heading, fontSize: "1.1rem" } } });
        return d.add(id("card"), "container", { name: "Menu item", tag: "article", children: [copy, priceNode], style: { desktop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1.5rem", padding: "0 0 1rem", boxShadow: `inset 0 -1px 0 ${p.border}` } } });
      }
    }
  }

  const pageDoc = (sections: (d: Doc) => string[]): BuilderDocument => {
    const d = new Doc();
    const h = header(d);
    const main = d.add("main", "container", { name: "Main", tag: "main", children: sections(d), style: { desktop: { display: "flex", flexDirection: "column" } } });
    const f = footer(d);
    d.add("root", "container", { name: "Page", tag: "div", children: [h, main, f], style: { desktop: { display: "flex", flexDirection: "column", minHeight: "100dvh" } } });
    return d.done("root");
  };

  const pages = bp.pages.map((page: PageSpec) => ({
    slug: page.slug,
    title: t(page.title),
    seo: { title: t(page.seo.title), description: t(page.seo.description) },
    document: pageDoc((d) => page.sections.map((s, i) => section(d, s, i))),
  }));

  const notFound = pageDoc((d) => [
    section(d, { kind: "cta", eyebrow: "404", title: "We couldn't find that page", text: "It may have moved, or the link may be mistyped.", actions: [{ label: "Back to the home page", href: "/" }] }, 0),
  ]);

  const productTemplate = shop
    ? pageDoc((d) => {
        const ids = [d.add("pdp", "product", { name: "Product details", props: { productId: null, buttonLabel: "Add to cart" }, style: { desktop: { display: "grid", gridTemplateColumns: cols(2), gap: "clamp(2rem, 5cqi, 4rem)" }, mobile: { gridTemplateColumns: cols(1) } } })];
        d.add("pdp-inner", "container", { name: "Inner", children: ids, style: { desktop: { ...SHELL } } });
        const top = d.add("pdp-band", "section", { name: "Product", tag: "section", children: ["pdp-inner"], style: { desktop: { padding: PADDING.compact } } });
        return [top, section(d, { kind: "products", tone: "alt", title: "You may also like", limit: 4, columns: 4 }, 1)];
      })
    : null;

  return { pages, notFound, productTemplate };
}
