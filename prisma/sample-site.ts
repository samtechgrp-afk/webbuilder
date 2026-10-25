import type { DesignTokens } from "../src/lib/builder/styles";
import type { BuilderDocument, BuilderNode, ImageValue, LockSettings, ResponsiveStyle, SemanticTag, WidgetType } from "../src/lib/builder/types";

/**
 * Demo content for "Aurelia Interiors": the kind of page a designer hands to
 * a client. Locks are set the way a real studio would: layout and style
 * locked on the hero and services, a style-unlocked announcement bar, a
 * reorderable testimonials row, and a fully locked footer.
 */

export const aureliaTokens: DesignTokens = {
  colors: {
    background: "#FBF8F3",
    surface: "#F2ECE2",
    text: "#1F1B16",
    muted: "#6B6259",
    accent: "#8A6A3B",
    gold: "#C9A66B",
    deep: "#2B2620",
    inverse: "#FBF8F3",
  },
  fonts: {
    display: "var(--font-fraunces), Georgia, serif",
    body: "var(--font-geist-sans), system-ui, sans-serif",
  },
  fontSizes: {
    display: "clamp(2.6rem, 1.4rem + 4.4cqi, 5.25rem)",
    h2: "clamp(2rem, 1.3rem + 2.2cqi, 3.25rem)",
    h3: "1.375rem",
    lead: "clamp(1.05rem, .95rem + .4cqi, 1.25rem)",
    body: "1rem",
    small: ".8125rem",
  },
  radii: { sm: "6px", md: "14px", lg: "28px", pill: "999px" },
  shadows: {
    soft: "0 1px 2px rgba(31,27,22,.06), 0 18px 40px -18px rgba(31,27,22,.28)",
  },
  spacing: { xs: ".5rem", sm: ".875rem", md: "1.5rem", lg: "2.75rem", xl: "clamp(4rem, 2rem + 7cqi, 8rem)" },
};

export type SampleImages = Record<"hero" | "living" | "kitchen" | "bedroom" | "portrait", ImageValue>;

class DocBuilder {
  nodes: Record<string, BuilderNode> = {};
  add(
    id: string,
    type: WidgetType,
    opts: { name?: string; tag?: SemanticTag; props?: Record<string, unknown>; style?: ResponsiveStyle; locks?: LockSettings; children?: string[] } = {},
  ) {
    this.nodes[id] = { id, type, props: opts.props ?? {}, style: opts.style ?? {}, ...opts, ...(type === "section" || type === "container" ? { children: opts.children ?? [] } : {}) };
    return id;
  }
}

const eyebrow = { fontSize: "var(--text-small)", letterSpacing: ".22em", textTransform: "uppercase" as const, color: "var(--color-accent)", fontWeight: "600" };
const display = { fontFamily: "var(--font-display)", fontWeight: "400", letterSpacing: "-.02em", lineHeight: "1.02" };
const primaryBtn = { background: "var(--color-deep)", color: "var(--color-inverse)", padding: ".95rem 1.6rem", borderRadius: "var(--radius-pill)", fontSize: ".9375rem", fontWeight: "500" };
const ghostBtn = { color: "var(--color-text)", padding: ".95rem 1.4rem", borderRadius: "var(--radius-pill)", border: "1px solid rgba(31,27,22,.22)", fontSize: ".9375rem", fontWeight: "500" };
const shell = { maxWidth: "1240px", margin: "0 auto", width: "100%" };

export function buildAureliaHome(img: SampleImages): BuilderDocument {
  const b = new DocBuilder();

  // Announcement: layout locked, colours open to the client.
  b.add("ann-text", "text", { name: "Announcement text", props: { text: "Now booking spring 2027 projects · Limited availability" }, style: { desktop: { fontSize: "var(--text-small)", letterSpacing: ".04em" } } });
  b.add("announcement", "section", {
    name: "Announcement bar",
    locks: { layout: true },
    children: ["ann-text"],
    style: { desktop: { display: "flex", justifyContent: "center", padding: ".7rem 1rem", background: "var(--color-deep)", color: "var(--color-inverse)", textAlign: "center" } },
  });

  // Header
  b.add("brand", "heading", { name: "Logo", tag: "h4", locks: { content: true }, props: { text: "Aurelia" }, style: { desktop: { ...display, fontSize: "1.65rem" } } });
  b.add("nav-1", "button", { name: "Nav link", props: { link: { label: "Work", href: "/work" } }, style: { desktop: { color: "var(--color-text)", fontSize: ".9375rem" } } });
  b.add("nav-2", "button", { name: "Nav link", props: { link: { label: "Studio", href: "/studio" } }, style: { desktop: { color: "var(--color-text)", fontSize: ".9375rem" } } });
  b.add("nav-3", "button", { name: "Nav link", props: { link: { label: "Journal", href: "/journal" } }, style: { desktop: { color: "var(--color-text)", fontSize: ".9375rem" } } });
  b.add("nav", "container", { name: "Navigation", tag: "nav", children: ["nav-1", "nav-2", "nav-3"], style: { desktop: { display: "flex", gap: "2.25rem" }, mobile: { display: "none" } } });
  b.add("header-cta", "button", { name: "Header button", props: { link: { label: "Book a consultation", href: "/contact" } }, style: { desktop: { ...primaryBtn, padding: ".7rem 1.2rem", fontSize: ".875rem" } } });
  b.add("header-inner", "container", { name: "Header row", children: ["brand", "nav", "header-cta"], style: { desktop: { ...shell, display: "flex", alignItems: "center", justifyContent: "space-between" } } });
  b.add("header", "section", { name: "Header", tag: "header", locks: { layout: true, style: true }, children: ["header-inner"], style: { desktop: { padding: "1.4rem 2rem" }, mobile: { padding: "1rem 1.25rem" } } });

  // Hero
  b.add("hero-eyebrow", "text", { name: "Eyebrow", props: { text: "Interior architecture · Since 2011" }, style: { desktop: eyebrow } });
  b.add("hero-title", "heading", { name: "Hero headline", tag: "h1", props: { text: "Rooms that feel like they were always meant to be yours." }, style: { desktop: { ...display, fontSize: "var(--text-display)" } } });
  b.add("hero-copy", "text", { name: "Hero intro", props: { text: "We design calm, considered homes across New England, from the first sketch to the last cushion. Every project is led personally by our principal designer." }, style: { desktop: { fontSize: "var(--text-lead)", lineHeight: "1.6", color: "var(--color-muted)", maxWidth: "34rem" } } });
  b.add("hero-cta", "button", { name: "Primary button", props: { link: { label: "Start your project", href: "/contact" } }, style: { desktop: primaryBtn } });
  b.add("hero-cta-2", "button", { name: "Secondary button", props: { link: { label: "View our work", href: "/work" } }, style: { desktop: ghostBtn } });
  b.add("hero-actions", "container", { name: "Hero buttons", children: ["hero-cta", "hero-cta-2"], style: { desktop: { display: "flex", gap: ".75rem", flexWrap: "wrap", margin: ".75rem 0 0" } } });
  b.add("hero-text", "container", { name: "Hero text", children: ["hero-eyebrow", "hero-title", "hero-copy", "hero-actions"], style: { desktop: { display: "flex", flexDirection: "column", gap: "var(--space-md)" } } });
  b.add("hero-image", "image", { name: "Hero image", props: { image: img.hero, priority: true }, style: { desktop: { aspectRatio: "4 / 5", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-soft)", objectFit: "cover" }, mobile: { aspectRatio: "4 / 3" } } });
  b.add("hero-grid", "container", {
    name: "Hero layout",
    children: ["hero-text", "hero-image"],
    style: {
      desktop: { ...shell, display: "grid", gridTemplateColumns: "1.05fr .95fr", gap: "clamp(2rem, 5cqi, 5rem)", alignItems: "center" },
      tablet: { gridTemplateColumns: "1fr" },
    },
  });
  b.add("hero", "section", { name: "Hero", locks: { layout: true, style: true }, children: ["hero-grid"], style: { desktop: { padding: "clamp(3rem, 6cqi, 6rem) 2rem var(--space-xl)" }, mobile: { padding: "2.5rem 1.25rem 4rem" } } });

  // Services
  const card = (n: number, image: ImageValue, title: string, copy: string) => {
    b.add(`svc-${n}-img`, "image", { name: "Service image", props: { image }, style: { desktop: { aspectRatio: "4 / 3", borderRadius: "var(--radius-md)", objectFit: "cover" } } });
    b.add(`svc-${n}-title`, "heading", { name: "Service title", tag: "h3", props: { text: title }, style: { desktop: { ...display, fontSize: "var(--text-h3)", lineHeight: "1.2" } } });
    b.add(`svc-${n}-copy`, "text", { name: "Service description", props: { text: copy }, style: { desktop: { color: "var(--color-muted)", lineHeight: "1.6" } } });
    return b.add(`svc-${n}`, "container", { name: "Service card", tag: "article", children: [`svc-${n}-img`, `svc-${n}-title`, `svc-${n}-copy`], style: { desktop: { display: "flex", flexDirection: "column", gap: "var(--space-sm)" } } });
  };
  b.add("svc-eyebrow", "text", { name: "Eyebrow", props: { text: "What we do" }, style: { desktop: eyebrow } });
  b.add("svc-title", "heading", { name: "Services headline", tag: "h2", props: { text: "Full-service design, quietly handled." }, style: { desktop: { ...display, fontSize: "var(--text-h2)", maxWidth: "18ch" } } });
  b.add("svc-head", "container", { name: "Services heading", children: ["svc-eyebrow", "svc-title"], style: { desktop: { display: "flex", flexDirection: "column", gap: "var(--space-sm)" } } });
  b.add("svc-grid", "container", {
    name: "Service cards",
    children: [
      card(1, img.living, "Whole-home design", "Space planning, finishes, furniture and art, delivered as one coherent vision."),
      card(2, img.kitchen, "Kitchens & baths", "Custom millwork and stone, detailed with the trades we have trusted for a decade."),
      card(3, img.bedroom, "Styling & refresh", "A lighter touch for rooms that need new life without a renovation."),
    ],
    style: { desktop: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--space-lg) var(--space-md)" }, tablet: { gridTemplateColumns: "repeat(2, 1fr)" }, mobile: { gridTemplateColumns: "1fr" } },
  });
  b.add("services-inner", "container", { name: "Services content", children: ["svc-head", "svc-grid"], style: { desktop: { ...shell, display: "flex", flexDirection: "column", gap: "var(--space-lg)" } } });
  b.add("services", "section", { name: "Services", locks: { layout: true, style: true }, children: ["services-inner"], style: { desktop: { padding: "var(--space-xl) 2rem", background: "var(--color-surface)" }, mobile: { padding: "4rem 1.25rem" } } });

  // Consultation offer with a client-editable price
  b.add("offer-eyebrow", "text", { name: "Eyebrow", props: { text: "Begin here" }, style: { desktop: eyebrow } });
  b.add("offer-title", "heading", { name: "Offer title", tag: "h2", props: { text: "The Design Consultation" }, style: { desktop: { ...display, fontSize: "var(--text-h2)" } } });
  b.add("offer-price", "price", { name: "Consultation price", props: { price: { amount: 450, currency: "USD", compareAt: null } }, style: { desktop: { ...display, fontSize: "2.5rem" } } });
  b.add("offer-copy", "text", { name: "Offer details", props: { text: "Two hours in your home with our principal designer, followed by a written plan and mood board. Fully credited to your project if you go ahead." }, style: { desktop: { color: "var(--color-muted)", lineHeight: "1.6", maxWidth: "36rem" } } });
  b.add("offer-cta", "button", { name: "Offer button", props: { link: { label: "Reserve a date", href: "/contact" } }, style: { desktop: primaryBtn } });
  b.add("offer-card", "container", {
    name: "Offer card",
    children: ["offer-eyebrow", "offer-title", "offer-price", "offer-copy", "offer-cta"],
    style: { desktop: { ...shell, maxWidth: "860px", display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--space-md)", textAlign: "center", padding: "var(--space-lg)", borderRadius: "var(--radius-lg)", border: "1px solid rgba(31,27,22,.12)", background: "#fff", boxShadow: "var(--shadow-soft)" } },
  });
  b.add("offer", "section", { name: "Consultation offer", locks: { layout: true, style: true }, children: ["offer-card"], style: { desktop: { padding: "var(--space-xl) 2rem" }, mobile: { padding: "4rem 1.25rem" } } });

  // Testimonials: style locked, layout explicitly re-opened inside the locked page so the client can reorder quotes.
  const quote = (n: number, text: string, who: string) => {
    b.add(`q-${n}-text`, "text", { name: "Quote", props: { text }, style: { desktop: { ...display, fontSize: "1.3rem", lineHeight: "1.45" } } });
    b.add(`q-${n}-who`, "text", { name: "Client name", props: { text: who }, style: { desktop: { fontSize: "var(--text-small)", color: "var(--color-gold)", letterSpacing: ".08em", textTransform: "uppercase" } } });
    return b.add(`q-${n}`, "container", { name: "Testimonial", tag: "article", children: [`q-${n}-text`, `q-${n}-who`], style: { desktop: { display: "flex", flexDirection: "column", gap: "var(--space-md)", padding: "var(--space-md)", borderRadius: "var(--radius-md)", border: "1px solid rgba(251,248,243,.14)" } } });
  };
  b.add("quotes-title", "heading", { name: "Testimonials headline", tag: "h2", props: { text: "Kind words" }, style: { desktop: { ...display, fontSize: "var(--text-h2)" } } });
  b.add("quotes-grid", "container", {
    name: "Testimonials row",
    children: [
      quote(1, "“They listened more than they talked, and the house finally feels like us.”", "The Whitfields · Concord"),
      quote(2, "“Calm, organised and endlessly patient. The kitchen is a work of art.”", "Priya & Tom · Beacon Hill"),
      quote(3, "“Every decision felt easy because Aurelia had already thought it through.”", "Dana L. · Nantucket"),
    ],
    style: { desktop: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--space-md)" }, tablet: { gridTemplateColumns: "1fr" } },
  });
  b.add("quotes-inner", "container", { name: "Testimonials content", children: ["quotes-title", "quotes-grid"], style: { desktop: { ...shell, display: "flex", flexDirection: "column", gap: "var(--space-lg)" } } });
  b.add("testimonials", "section", { name: "Testimonials", locks: { style: true, layout: false }, children: ["quotes-inner"], style: { desktop: { padding: "var(--space-xl) 2rem", background: "var(--color-deep)", color: "var(--color-inverse)" }, mobile: { padding: "4rem 1.25rem" } } });

  b.add("main", "container", { name: "Main content", tag: "main", locks: { layout: true }, children: ["hero", "services", "offer", "testimonials"] });

  // Footer: fully locked, including legal copy.
  b.add("footer-brand", "heading", { name: "Footer logo", tag: "h4", props: { text: "Aurelia" }, style: { desktop: { ...display, fontSize: "1.4rem" } } });
  b.add("footer-legal", "text", { name: "Legal", props: { text: "© 2026 Aurelia Interiors LLC · Licensed in MA, NH and ME" }, style: { desktop: { fontSize: "var(--text-small)", color: "var(--color-muted)" } } });
  b.add("footer-inner", "container", { name: "Footer row", children: ["footer-brand", "footer-legal"], style: { desktop: { ...shell, display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" }, mobile: { flexDirection: "column", alignItems: "flex-start" } } });
  b.add("footer", "section", { name: "Footer", tag: "footer", locks: { layout: true, style: true, content: true }, children: ["footer-inner"], style: { desktop: { padding: "2.5rem 2rem" } } });

  b.add("root", "container", { name: "Page", locks: { layout: true }, children: ["announcement", "header", "main", "footer"] });

  // Drop undefined style values left by spreads so documents stay clean JSON.
  const doc: BuilderDocument = { version: 1, rootId: "root", nodes: b.nodes };
  return JSON.parse(JSON.stringify(doc));
}
