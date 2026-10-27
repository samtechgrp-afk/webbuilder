import "server-only";
import { BLUEPRINTS } from "@/lib/templates/registry";
import type { TemplateSummary } from "./TemplateGallery";

/** What the gallery shows per blueprint: identity, colours and fonts for the thumbnail, pages for the preview. */
export const templateSummaries = (): TemplateSummary[] =>
  BLUEPRINTS.map((bp) => {
    const home = bp.pages[0];
    const hero = home.sections.find((s) => s.kind === "hero");
    const c = bp.tokens.colors;
    return {
      key: bp.key,
      name: bp.name,
      sector: bp.sector,
      description: bp.description,
      highlights: bp.highlights,
      siteName: bp.site.name,
      colors: { background: c.background, surface: c["surface-low"], primary: c.primary, onPrimary: c["on-primary"], heading: c.heading, text: c.text, muted: c.muted, border: c.border, accent: c.accent },
      fonts: { heading: bp.tokens.fonts.display, body: bp.tokens.fonts.body },
      radius: bp.tokens.radii.button,
      uppercase: bp.look.headings === "uppercase",
      hero: { eyebrow: hero?.eyebrow ?? "", title: (hero?.title ?? home.title).replaceAll("{{site}}", bp.site.name) },
      pages: bp.pages.map((p) => ({ slug: p.slug, title: p.title.replaceAll("{{site}}", bp.site.name) })),
      counts: { pages: bp.pages.length, entries: bp.entries.length, products: bp.products.length },
    };
  });
