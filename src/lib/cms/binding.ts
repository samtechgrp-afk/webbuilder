import type { Binding, BuilderDocument, BuilderNode, ImageValue, LinkValue, PriceValue } from "@/lib/builder/types";
import { BACKGROUND_TARGET, BINDABLE, targetField } from "@/lib/builder/widgets";
import type { BindKind, FieldType } from "./fields";

/**
 * Dynamic content binding. Server code loads a `DynamicData` snapshot (the
 * current entry, loop grid items, site identity); `applyDynamic` then writes
 * the bound values into a copy of the document and repeats loop grid cards
 * once per item. The result is an ordinary document, so the same renderer
 * draws the live site and the canvas, and nothing here touches the database.
 *
 * Every value in DynamicData was resolved on the server from this site's
 * rows: images from MediaAsset, rich text already sanitised. Bindings never
 * carry values of their own, only a source and a key.
 */

/** A custom field value, pre-resolved into every shape a widget might want. */
export interface DynamicFieldValue {
  type: FieldType;
  label: string;
  text: string;
  url?: string;
  image?: ImageValue | null;
  gallery?: ImageValue[];
  price?: PriceValue | null;
  html?: string;
}

export interface DynamicPost {
  id: string;
  title: string;
  slug: string;
  /** Site-relative, e.g. /case-studies/harbour-house */
  url: string;
  excerpt: string;
  /** ISO date of publishing (or last update for drafts in preview). */
  date: string | null;
  authorName: string;
  featuredImage: ImageValue | null;
  /** Sanitised HTML body. */
  content: string;
  fields: Record<string, DynamicFieldValue>;
}

export interface DynamicSite {
  name: string;
  tagline: string;
  url: string;
  logo: ImageValue | null;
}

export interface DynamicData {
  site: DynamicSite;
  /** The entry the document renders for: the page itself, or the entry a single template shows. */
  post: DynamicPost | null;
  /** Loop grid items by loop node id. */
  loops: Record<string, DynamicPost[]>;
}

export const POST_SOURCES: Record<string, { label: string; kinds: BindKind[] }> = {
  title: { label: "Post title", kinds: ["text"] },
  excerpt: { label: "Excerpt", kinds: ["text"] },
  date: { label: "Publish date", kinds: ["text"] },
  author: { label: "Author name", kinds: ["text"] },
  url: { label: "Post URL", kinds: ["url"] },
  featured_image: { label: "Featured image", kinds: ["image"] },
  content: { label: "Post content", kinds: ["html", "text"] },
};

export const SITE_SOURCES: Record<string, { label: string; kinds: BindKind[] }> = {
  name: { label: "Site name", kinds: ["text"] },
  tagline: { label: "Site tagline", kinds: ["text"] },
  url: { label: "Home page URL", kinds: ["url"] },
  logo: { label: "Site logo", kinds: ["image"] },
};

const EMPTY_IMAGE: ImageValue = { assetId: null, src: "", alt: "" };

export function formatPostDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }) : "";
}

const stripHtml = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

type Resolved = string | ImageValue | ImageValue[] | PriceValue | null;

/** Reads one binding in the shape a target accepts. Null means "no value". */
export function resolveBinding(binding: Binding, accepts: BindKind, post: DynamicPost | null, site: DynamicSite): Resolved {
  if (binding.source === "site") {
    switch (binding.key) {
      case "name":
        return accepts === "text" ? site.name : null;
      case "tagline":
        return accepts === "text" ? site.tagline : null;
      case "url":
        return accepts === "url" ? site.url : null;
      case "logo":
        return accepts === "image" ? site.logo : accepts === "gallery" && site.logo ? [site.logo] : null;
    }
    return null;
  }
  if (!post) return null;
  if (binding.source === "post") {
    switch (binding.key) {
      case "title":
        return accepts === "text" ? post.title : null;
      case "excerpt":
        return accepts === "text" ? post.excerpt || stripHtml(post.content).slice(0, 220) : null;
      case "date":
        return accepts === "text" ? formatPostDate(post.date) : null;
      case "author":
        return accepts === "text" ? post.authorName : null;
      case "url":
        return accepts === "url" ? post.url : null;
      case "featured_image":
        return accepts === "image" ? post.featuredImage : accepts === "gallery" && post.featuredImage ? [post.featuredImage] : null;
      case "content":
        return accepts === "html" ? post.content : accepts === "text" ? stripHtml(post.content) : null;
    }
    return null;
  }
  const field = post.fields[binding.key];
  if (!field) return null;
  switch (accepts) {
    case "text":
      return field.text;
    case "url":
      return field.url ?? null;
    case "image":
      return field.image ?? field.gallery?.[0] ?? null;
    case "gallery":
      return field.gallery ?? (field.image ? [field.image] : null);
    case "price":
      return field.price ?? null;
    case "html":
      return field.html ?? null;
  }
}

/** Only our own upload paths (or https) may become a CSS background. */
export const SAFE_BG_URL = /^(\/uploads\/[A-Za-z0-9/_.-]+|https:\/\/[A-Za-z0-9.-]+\/[A-Za-z0-9/_.%-]*)$/;

function applyBindings(node: BuilderNode, post: DynamicPost | null, site: DynamicSite, editor: boolean, labelFor: (b: Binding) => string): BuilderNode {
  const props: Record<string, unknown> = { ...node.props };
  // Rich content only ever shows server-resolved HTML, never a stored prop.
  if (node.type === "richtext") props.html = "";
  if (!node.bindings) return node.type === "richtext" ? { ...node, props } : node;

  for (const target of BINDABLE[node.type]) {
    const binding = node.bindings[target.key];
    if (!binding) continue;
    const value = resolveBinding(binding, target.accepts, post, site);
    const placeholder = binding.fallback || (editor ? `{${labelFor(binding)}}` : "");
    const field = targetField(target.key);

    if (target.key === BACKGROUND_TARGET) {
      const src = (value as ImageValue | null)?.src;
      props.__bg = src && SAFE_BG_URL.test(src) ? src : undefined;
      continue;
    }
    switch (target.accepts) {
      case "text":
      case "url": {
        const str = typeof value === "string" && value ? value : placeholder;
        if (field === "link") {
          const link = { ...(props.link as LinkValue | undefined ?? { label: "", href: "#" }) };
          if (target.key === "link.label") link.label = str;
          else link.href = typeof value === "string" && value ? value : "#";
          props.link = link;
        } else props[field] = str;
        break;
      }
      case "image":
        props[field] = (value as ImageValue | null) ?? { ...EMPTY_IMAGE, alt: binding.fallback ?? "" };
        break;
      case "gallery":
        props[field] = (value as ImageValue[] | null) ?? [];
        break;
      case "price":
        props[field] = value ?? undefined;
        break;
      case "html":
        props[field] = typeof value === "string" ? value : "";
        break;
    }
  }
  return { ...node, props };
}

export const CLONE_SEP = "~";

/** The id a node's styles and selection belong to (loop copies share the original's). */
export const baseNodeId = (id: string) => id.split(CLONE_SEP)[0];

/**
 * Writes bound values into a copy of `doc` and expands loop grids. The first
 * loop item keeps the template's ids, so it stays selectable on the canvas;
 * the other items get `<id>~<n>` copies.
 */
export function applyDynamic(
  doc: BuilderDocument,
  data: DynamicData,
  opts: { editor?: boolean; labelFor?: (b: Binding) => string } = {},
): BuilderDocument {
  const editor = !!opts.editor;
  const labelFor = opts.labelFor ?? ((b: Binding) => (b.source === "post" ? POST_SOURCES[b.key]?.label : b.source === "site" ? SITE_SOURCES[b.key]?.label : b.key) ?? b.key);
  const out: Record<string, BuilderNode> = {};

  const visit = (id: string, post: DynamicPost | null, suffix: string): string | null => {
    const src = doc.nodes[id];
    if (!src) return null;
    const newId = id + suffix;
    const node = applyBindings({ ...src, id: newId }, post, site, editor, labelFor);

    if (src.type === "loop") {
      const items = data.loops[id] ?? [];
      const children: string[] = [];
      if (!items.length) {
        // Keep the card visible on the canvas so it can still be designed.
        if (editor) for (const c of src.children ?? []) children.push(visit(c, null, suffix)!);
        node.props = { ...node.props, __empty: true };
      }
      items.forEach((item, i) => {
        const itemSuffix = i === 0 ? suffix : `${suffix}${CLONE_SEP}${i}`;
        for (const c of src.children ?? []) {
          const cid = visit(c, item, itemSuffix);
          if (cid) children.push(cid);
        }
      });
      node.children = children;
    } else if (src.children) {
      node.children = src.children.map((c) => visit(c, post, suffix)).filter((c): c is string => !!c);
    }
    out[newId] = node;
    return newId;
  };

  const site = data.site;
  visit(doc.rootId, data.post, "");
  return { ...doc, nodes: out };
}
