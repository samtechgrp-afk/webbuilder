import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DefaultArchive, DefaultEntry } from "@/components/site/DefaultLayouts";
import { requireUser } from "@/lib/auth";
import { SiteDocument } from "@/lib/builder/render";
import { compileBlueprint } from "@/lib/templates/compile";
import { entryPosts, previewCommerce, previewContext, previewDynamic, previewImages } from "@/lib/templates/preview";
import { getBlueprint } from "@/lib/templates/registry";

export const metadata: Metadata = { title: "Template preview", robots: { index: false } };

/**
 * A starter template rendered straight from its blueprint, for the gallery's
 * preview frame. Same compiler and renderer as a real site; images, loop
 * items and products come from the JSON instead of the database, and links
 * stay inside the preview.
 */
export default async function TemplatePreview({ params }: PageProps<"/admin/sites/new/preview/[template]/[[...slug]]">) {
  await requireUser();
  const { template, slug = [] } = await params;
  const bp = getBlueprint(template);
  if (!bp) notFound();
  const images = previewImages(bp);
  const compiled = compileBlueprint(bp, previewContext(bp, images));
  const linkBase = `/admin/sites/new/preview/${bp.key}`;
  const tokens = bp.tokens;
  const path = slug.join("/");

  const page = compiled.pages.find((p) => p.slug === (path || "home"));
  if (page) {
    return <SiteDocument doc={page.document} data={previewDynamic(bp, page.document, images)} tokens={tokens} linkBase={linkBase} lang="en" commerce={previewCommerce(bp, images, linkBase)} />;
  }
  if (slug[0] === "products" && slug.length === 2 && compiled.productTemplate && bp.products.some((p) => p.slug === slug[1])) {
    const doc = compiled.productTemplate;
    return <SiteDocument doc={doc} data={previewDynamic(bp, doc, images)} tokens={tokens} linkBase={linkBase} lang="en" commerce={previewCommerce(bp, images, linkBase, slug[1])} />;
  }
  const pt = bp.postTypes.find((p) => p.prefix === slug[0]);
  if (pt && slug.length === 1) return <DefaultArchive title={pt.plural} entries={entryPosts(bp, pt.key, images)} tokens={tokens} linkBase={linkBase} lang="en" />;
  const entry = pt && slug.length === 2 ? entryPosts(bp, pt.key, images).find((e) => e.slug === slug[1]) : undefined;
  if (pt && entry) return <DefaultEntry entry={entry} label={pt.singular} tokens={tokens} lang="en" />;
  notFound();
}
