import { PrismaClient, type Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { rm } from "node:fs/promises";
import path from "node:path";
import { SYSTEM_ROLES, type SystemRoleKey } from "../src/lib/rbac";
import { processImage } from "../src/server/media-processing";
import { aureliaTokens, buildAureliaHome, type SampleImages } from "./sample-site";

const prisma = new PrismaClient();
export const DEMO_PASSWORD = "demo-password-2026";

/** Abstract "interior" artwork so the demo has real images without shipping photos. */
function artwork(w: number, h: number, palette: string[], seed: number) {
  const [bg, a, b, c] = palette;
  const r = (n: number) => ((Math.sin(seed * 97 + n * 13) + 1) / 2);
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${bg}"/><stop offset="1" stop-color="${a}"/></linearGradient>
    <radialGradient id="l" cx="${30 + r(1) * 40}%" cy="20%" r="70%"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <path d="M${w * 0.18} ${h} V${h * 0.42} a${w * 0.22} ${w * 0.22} 0 0 1 ${w * 0.44} 0 V${h}" fill="${b}" opacity=".85"/>
    <rect x="0" y="${h * 0.78}" width="${w}" height="${h * 0.22}" fill="${c}" opacity=".9"/>
    <ellipse cx="${w * (0.68 + r(2) * 0.12)}" cy="${h * 0.74}" rx="${w * 0.2}" ry="${h * 0.07}" fill="${b}" opacity=".7"/>
    <circle cx="${w * 0.78}" cy="${h * (0.28 + r(3) * 0.1)}" r="${w * 0.07}" fill="${c}" opacity=".55"/>
    <rect width="100%" height="100%" fill="url(#l)"/></svg>`);
}

async function seedImages(siteId: string, uploaderId: string) {
  const specs: [keyof SampleImages, string, number, number, string[]][] = [
    ["hero", "warm-living-room-with-arched-doorway.png", 1200, 1500, ["#E9DFD0", "#C9B79C", "#8A6A3B", "#5B4A36"]],
    ["living", "linen-sofa-in-a-sunlit-sitting-room.png", 1200, 900, ["#EFE8DC", "#D8CBB6", "#A88E6A", "#6F5E49"]],
    ["kitchen", "marble-kitchen-with-oak-cabinetry.png", 1200, 900, ["#F2F0EB", "#D9D4CA", "#9C9284", "#4E4943"]],
    ["bedroom", "calm-bedroom-in-soft-neutrals.png", 1200, 900, ["#F1E9E1", "#DCCABA", "#B58F74", "#7A5B48"]],
    ["portrait", "garden-room-with-green-velvet-chair.png", 1200, 1500, ["#E4E7DD", "#BCC3AE", "#5E6E4E", "#3C4632"]],
  ];
  const images = {} as SampleImages;
  let i = 0;
  for (const [key, name, w, h, palette] of specs) {
    const processed = await processImage(siteId, artwork(w, h, palette, ++i), name);
    const asset = await prisma.mediaAsset.create({ data: { ...processed, siteId, uploadedById: uploaderId, tags: ["demo", key] } });
    images[key] = { assetId: asset.id, src: asset.url, alt: asset.altText ?? "", width: asset.width ?? undefined, height: asset.height ?? undefined };
  }
  return images;
}

async function createSite(data: { name: string; subdomain: string; branding: object; tokens: object }) {
  const site = await prisma.site.create({
    data: { name: data.name, subdomain: data.subdomain, status: "LIVE", branding: data.branding, designTokens: data.tokens },
  });
  const page = await prisma.postType.create({
    data: { siteId: site.id, key: "page", labelSingular: "Page", labelPlural: "Pages", hierarchical: true, usesBuilder: true, isSystem: true },
  });
  const post = await prisma.postType.create({
    data: { siteId: site.id, key: "post", labelSingular: "Blog post", labelPlural: "Blog posts", hasArchive: true, routePrefix: "journal", isSystem: true },
  });
  return { site, page, post };
}

async function publishPage(siteId: string, postTypeId: string, authorId: string, title: string, slug: string, document: unknown, seo: Partial<Prisma.PostUncheckedCreateInput> = {}) {
  const doc = document as Prisma.InputJsonValue;
  const post = await prisma.post.create({ data: { siteId, postTypeId, authorId, title, slug, draft: doc, status: "PUBLISHED", publishedAt: new Date(), ...seo } });
  const rev = await prisma.postRevision.create({
    data: { siteId, postId: post.id, version: 1, kind: "PUBLISHED", title, document: doc, message: "Site launch", authorId },
  });
  await prisma.post.update({ where: { id: post.id }, data: { publishedRevisionId: rev.id } });
  return post;
}

/** A published, non-builder entry: field values plus a revision whose meta snapshot the live site reads. */
async function publishEntry(
  siteId: string,
  postTypeId: string,
  authorId: string,
  e: { title: string; slug: string; excerpt?: string; featuredImageId?: string | null; termIds?: string[]; fields?: Record<string, unknown>; html?: string; publishedAt?: Date },
) {
  const draft = { type: "html", html: e.html ?? "" };
  const author = await prisma.user.findUniqueOrThrow({ where: { id: authorId } });
  const post = await prisma.post.create({
    data: { siteId, postTypeId, authorId, title: e.title, slug: e.slug, excerpt: e.excerpt, featuredImageId: e.featuredImageId, draft, status: "PUBLISHED", publishedAt: e.publishedAt ?? new Date() },
  });
  const fields = await prisma.customField.findMany({ where: { siteId, key: { in: Object.keys(e.fields ?? {}) } } });
  for (const f of fields) await prisma.fieldValue.create({ data: { siteId, postId: post.id, fieldId: f.id, value: e.fields![f.key] as Prisma.InputJsonValue } });
  for (const termId of e.termIds ?? []) await prisma.postTerm.create({ data: { postId: post.id, termId } });
  const meta = {
    fields: e.fields ?? {}, featuredImageId: e.featuredImageId ?? null, excerpt: e.excerpt ?? null, termIds: e.termIds ?? [],
    template: null, parentId: null, authorName: author.name, seo: { seoTitle: null, seoDescription: null, noIndex: false },
  };
  const rev = await prisma.postRevision.create({
    data: { siteId, postId: post.id, version: 1, kind: "PUBLISHED", title: e.title, document: draft, meta: meta as Prisma.InputJsonValue, message: "Published", authorId },
  });
  await prisma.post.update({ where: { id: post.id }, data: { publishedRevisionId: rev.id } });
  return post;
}

/** A translation of `source` in `locale`, grouped with it (the original joins the group as the default language). */
async function translate(
  source: { id: string; siteId: string; postTypeId: string },
  defaultCode: string,
  locale: string,
  authorId: string,
  t: { title: string; slug: string; document: unknown; excerpt?: string; fields?: Record<string, unknown>; seo?: { seoTitle?: string; seoDescription?: string }; publish: boolean },
) {
  const { siteId } = source;
  await prisma.postTranslation.upsert({ where: { postId: source.id }, create: { siteId, translationId: source.id, postId: source.id, localeCode: defaultCode }, update: {} });
  const doc = t.document as Prisma.InputJsonValue;
  const post = await prisma.post.create({
    data: {
      siteId, postTypeId: source.postTypeId, authorId, locale, title: t.title, slug: t.slug, excerpt: t.excerpt, draft: doc,
      seoTitle: t.seo?.seoTitle, seoDescription: t.seo?.seoDescription, status: t.publish ? "PUBLISHED" : "DRAFT", publishedAt: t.publish ? new Date() : null,
    },
  });
  await prisma.postTranslation.create({ data: { siteId, translationId: source.id, postId: post.id, localeCode: locale } });
  const fields = await prisma.customField.findMany({ where: { siteId, key: { in: Object.keys(t.fields ?? {}) } } });
  for (const f of fields) await prisma.fieldValue.create({ data: { siteId, postId: post.id, fieldId: f.id, value: t.fields![f.key] as Prisma.InputJsonValue } });
  const meta = { fields: t.fields ?? {}, featuredImageId: null, excerpt: t.excerpt ?? null, termIds: [], template: null, parentId: null, authorName: null, seo: { seoTitle: t.seo?.seoTitle ?? null, seoDescription: t.seo?.seoDescription ?? null, noIndex: false } };
  const rev = await prisma.postRevision.create({
    data: { siteId, postId: post.id, version: 1, kind: t.publish ? "PUBLISHED" : "DRAFT", title: t.title, document: doc, meta: meta as Prisma.InputJsonValue, message: "Translated", authorId },
  });
  if (t.publish) await prisma.post.update({ where: { id: post.id }, data: { publishedRevisionId: rev.id } });
  return post;
}

async function main() {
  console.log("Resetting demo data…");
  await prisma.site.deleteMany();
  await prisma.user.deleteMany();
  await prisma.role.deleteMany();
  await rm(path.join(process.cwd(), "public", "uploads"), { recursive: true, force: true });

  // System roles (siteId = null) shared by every site.
  const roles = {} as Record<SystemRoleKey, string>;
  for (const [key, def] of Object.entries(SYSTEM_ROLES) as [SystemRoleKey, (typeof SYSTEM_ROLES)[SystemRoleKey]][]) {
    const role = await prisma.role.create({ data: { key, name: def.name, description: def.description, permissions: def.permissions, isSystem: true } });
    roles[key] = role.id;
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const user = (email: string, name: string, isPlatformAdmin = false) =>
    prisma.user.create({ data: { email, name, passwordHash, isPlatformAdmin } });

  const [admin, designer, olivia, sam, nora] = await Promise.all([
    user("admin@platform.test", "Platform Admin", true),
    user("designer@studio.test", "Maya Chen"),
    user("client@aurelia.test", "Olivia Hart"),
    user("author@aurelia.test", "Sam Rivera"),
    user("client@northwind.test", "Nora Patel"),
  ]);

  // ── Tenant 1: Aurelia Interiors ────────────────────────────────────────────
  const aurelia = await createSite({ name: "Aurelia Interiors", subdomain: "aurelia", branding: { accent: "#2B2620", logoText: "Aurelia" }, tokens: aureliaTokens });

  await prisma.membership.createMany({
    data: [
      { userId: designer.id, siteId: aurelia.site.id, roleId: roles.designer },
      { userId: olivia.id, siteId: aurelia.site.id, roleId: roles.client_admin, invitedBy: designer.id },
      { userId: sam.id, siteId: aurelia.site.id, roleId: roles.author, invitedBy: olivia.id },
    ],
  });
  const images = await seedImages(aurelia.site.id, designer.id);
  // Site identity for "Site" bindings: tagline and a monogram logo.
  const logo = await processImage(aurelia.site.id, Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><rect width="240" height="240" rx="48" fill="#2B2620"/><text x="120" y="158" font-family="Georgia, serif" font-size="128" fill="#F4EFE7" text-anchor="middle">A</text></svg>`), "aurelia-monogram.png");
  const logoAsset = await prisma.mediaAsset.create({ data: { ...logo, siteId: aurelia.site.id, uploadedById: designer.id, altText: "Aurelia Interiors", title: "Aurelia monogram", tags: ["brand"] } });
  await prisma.site.update({
    where: { id: aurelia.site.id },
    data: { graphqlEnabled: true, settings: { tagline: "Interior architecture in New England" }, branding: { accent: "#2B2620", logoText: "Aurelia", logoAssetId: logoAsset.id } },
  });
  const home = await publishPage(aurelia.site.id, aurelia.page.id, designer.id, "Home", "home", buildAureliaHome(images), {
    seoTitle: "Aurelia Interiors · Interior architecture in New England",
    seoDescription: "Calm, considered homes designed from the first sketch to the last cushion.",
    ogImageId: images.hero.assetId,
  });

  // A designed "page not found" layout. Choosing it in Site settings makes it the site's 404 page.
  await publishPage(aurelia.site.id, aurelia.page.id, designer.id, "Page not found", "page-not-found", {
    version: 1,
    rootId: "root",
    nodes: {
      root: { id: "root", type: "section", tag: "main", props: {}, style: { desktop: { padding: "8rem 2rem", display: "flex", flexDirection: "column", gap: "1.25rem", alignItems: "center", textAlign: "center" } }, children: ["nf-kicker", "nf-title", "nf-copy", "nf-home"] },
      "nf-kicker": { id: "nf-kicker", type: "text", props: { text: "404" }, style: { desktop: { letterSpacing: ".2em", color: "var(--color-accent)" } } },
      "nf-title": { id: "nf-title", type: "heading", tag: "h1", props: { text: "This room doesn't exist (yet)." }, style: { desktop: { fontFamily: "var(--font-display)", fontSize: "var(--text-display)" } } },
      "nf-copy": { id: "nf-copy", type: "text", props: { text: "The page you were looking for has moved or never existed." }, style: {} },
      "nf-home": { id: "nf-home", type: "button", props: { link: { label: "Back to the home page", href: "/" } }, style: { desktop: { background: "var(--color-deep)", color: "var(--color-inverse)", padding: ".95rem 1.6rem", borderRadius: "var(--radius-pill)", fontSize: ".9375rem", fontWeight: "500" } } },
    },
  });

  // A CPT with ACF-style fields, a taxonomy, and published entries, to show the content model.
  const product = await prisma.postType.create({
    data: { siteId: aurelia.site.id, key: "product", labelSingular: "Product", labelPlural: "Shop", routePrefix: "shop", hasArchive: true, icon: "🛋️", description: "Pieces from the Aurelia studio collection." },
  });
  const group = await prisma.fieldGroup.create({
    data: { siteId: aurelia.site.id, key: "product_details", label: "Product details", location: [[{ param: "post_type", op: "==", value: product.id }]] },
  });
  await prisma.customField.createMany({
    data: [
      { siteId: aurelia.site.id, groupId: group.id, key: "price", label: "Price", type: "PRICE", required: true, config: { currency: "USD" }, order: 0 },
      { siteId: aurelia.site.id, groupId: group.id, key: "material", label: "Material", type: "TEXT", order: 1 },
      { siteId: aurelia.site.id, groupId: group.id, key: "sku", label: "SKU", type: "TEXT", clientEditable: false, instructions: "Set by the studio; matches the supplier catalogue.", order: 2 },
      {
        siteId: aurelia.site.id, groupId: group.id, key: "dimensions", label: "Dimensions", type: "REPEATER", order: 3,
        config: { maxRows: 6, subFields: [{ key: "label", label: "Measurement", type: "TEXT", required: true, clientEditable: true, config: {} }, { key: "value", label: "Value", type: "TEXT", required: true, clientEditable: true, config: {} }] },
      },
    ],
  });
  const category = await prisma.taxonomy.create({
    data: { siteId: aurelia.site.id, key: "product_cat", label: "Product category", hierarchical: true, postTypes: { connect: { id: product.id } } },
  });
  const [lighting, seating] = await Promise.all([
    prisma.term.create({ data: { siteId: aurelia.site.id, taxonomyId: category.id, name: "Lighting", slug: "lighting" } }),
    prisma.term.create({ data: { siteId: aurelia.site.id, taxonomyId: category.id, name: "Seating", slug: "seating" } }),
  ]);
  const products = [
    { title: "Alabaster Table Lamp", slug: "alabaster-table-lamp", image: images.living, term: lighting.id, price: 680, material: "Spanish alabaster, brass", sku: "AUR-L-014", excerpt: "Hand-turned alabaster that glows like a lantern at dusk." },
    { title: "Velvet Garden Chair", slug: "velvet-garden-chair", image: images.portrait, term: seating.id, price: 1450, material: "Moss cotton velvet, oak", sku: "AUR-S-031", excerpt: "A deep, low chair upholstered in moss-green velvet." },
    { title: "Linen Lounge Sofa", slug: "linen-lounge-sofa", image: images.bedroom, term: seating.id, price: 3900, material: "Belgian linen, kiln-dried ash", sku: "AUR-S-007", excerpt: "Loose linen covers over a feather-wrapped frame." },
  ];
  const productPosts = [];
  for (const [i, item] of products.entries()) {
    productPosts[i] = await publishEntry(aurelia.site.id, product.id, olivia.id, {
      title: item.title, slug: item.slug, excerpt: item.excerpt, featuredImageId: item.image.assetId, termIds: [item.term],
      publishedAt: new Date(Date.now() - (i + 1) * 86_400_000),
      fields: { price: { amount: item.price, currency: "USD" }, material: item.material, sku: item.sku, dimensions: [{ label: "Height", value: `${40 + i * 15} cm` }] },
    });
  }
  await publishEntry(aurelia.site.id, aurelia.post.id, olivia.id, {
    title: "How we choose a white paint", slug: "choosing-a-white-paint", excerpt: "Undertones matter more than the name on the tin.", featuredImageId: images.kitchen.assetId,
    html: "<p>Undertones matter more than the name on the tin. We paint large swatches on every wall and look at them morning and evening.</p>",
  });
  await prisma.post.create({
    data: {
      siteId: aurelia.site.id, postTypeId: aurelia.post.id, authorId: sam.id, title: "Five ways to warm up a north-facing room", slug: "warm-up-a-north-facing-room", status: "PENDING_REVIEW",
      draft: { type: "html", html: "<p>North light is soft, even and cool…</p>" },
    },
  });

  // Languages: English (default, clean URLs), French under /fr and Spanish
  // under /es. French has the home page, a product and the 404 page
  // translated; Spanish has only an unpublished draft, so its pages fall
  // back to English.
  await prisma.siteLocale.createMany({
    data: [
      { siteId: aurelia.site.id, code: "en-US", label: "English", prefix: "en", isDefault: true, currency: "USD", order: 0 },
      { siteId: aurelia.site.id, code: "fr-FR", label: "Français", prefix: "fr", currency: "EUR", order: 1 },
      { siteId: aurelia.site.id, code: "es-ES", label: "Español", prefix: "es", currency: "EUR", order: 2 },
    ],
  });
  await translate(home, "en-US", "fr-FR", olivia.id, {
    title: "Accueil",
    slug: "home",
    publish: true,
    seo: { seoTitle: "Aurelia Interiors · Architecture d'intérieur en Nouvelle-Angleterre", seoDescription: "Des intérieurs calmes et réfléchis, du premier croquis au dernier coussin." },
    document: {
      type: "translation",
      version: 1,
      overrides: {
        "ann-text": { text: "Réservations ouvertes pour le printemps 2027 · Places limitées" },
        "nav-1": { link: { label: "Projets", href: "/work" } },
        "nav-3": { link: { label: "Journal", href: "/journal" } },
        "header-cta": { link: { label: "Prendre rendez-vous", href: "/contact" } },
        "hero-eyebrow": { text: "Architecture d'intérieur · Depuis 2011" },
        "hero-title": { text: "Des pièces qui semblent vous avoir toujours appartenu." },
        "hero-cta": { link: { label: "Démarrer votre projet", href: "/contact" } },
        "offer-title": { text: "La consultation déco" },
        "offer-price": { price: { amount: 420, currency: "EUR", compareAt: null } },
      },
    },
  });
  await translate(home, "en-US", "es-ES", olivia.id, {
    title: "Inicio",
    slug: "home",
    publish: false,
    document: { type: "translation", version: 1, overrides: { "hero-title": { text: "Borrador: habitaciones que parecen tuyas desde siempre." } } },
  });
  await translate(productPosts[0], "en-US", "fr-FR", olivia.id, {
    title: "Lampe de table en albâtre",
    slug: "lampe-de-table-albatre",
    excerpt: "De l'albâtre tourné à la main qui s'illumine comme une lanterne au crépuscule.",
    fields: { material: "Albâtre d'Espagne, laiton" },
    document: { type: "html", html: "<p>Chaque lampe est tournée à la main dans un bloc d'albâtre.</p>" },
    publish: true,
  });
  const notFoundPage = await prisma.post.findFirstOrThrow({ where: { siteId: aurelia.site.id, slug: "page-not-found" } });
  await translate(notFoundPage, "en-US", "fr-FR", olivia.id, {
    title: "Page introuvable",
    slug: "page-introuvable",
    publish: true,
    document: { type: "translation", version: 1, overrides: { "nf-title": { text: "Cette pièce n'existe pas (encore)." }, "nf-home": { link: { label: "Retour à l'accueil", href: "/" } } } },
  });

  // ── Tenant 2: Northwind Dental (proves isolation) ──────────────────────────
  const northwind = await createSite({
    name: "Northwind Dental",
    subdomain: "northwind",
    branding: { accent: "#0E7490", logoText: "Northwind" },
    tokens: { colors: { background: "#FFFFFF", text: "#0F172A", accent: "#0E7490" }, fontSizes: { display: "clamp(2.25rem, 1.5rem + 3cqi, 4rem)" } },
  });
  await prisma.membership.createMany({
    data: [
      { userId: designer.id, siteId: northwind.site.id, roleId: roles.designer },
      { userId: nora.id, siteId: northwind.site.id, roleId: roles.client_admin },
    ],
  });
  await publishPage(northwind.site.id, northwind.page.id, designer.id, "Home", "home", {
    version: 1,
    rootId: "root",
    nodes: {
      root: { id: "root", type: "section", tag: "main", props: {}, style: { desktop: { padding: "6rem 2rem", display: "flex", flexDirection: "column", gap: "1rem", alignItems: "center", textAlign: "center" } }, locks: { layout: true, style: true }, children: ["t", "c"] },
      t: { id: "t", type: "heading", tag: "h1", props: { text: "Gentle dentistry for the whole family." }, style: { desktop: { fontSize: "var(--text-display)", color: "var(--color-accent)" } } },
      c: { id: "c", type: "text", props: { text: "Same-week appointments in Portland, Maine." }, style: {} },
    },
  });

  console.log(`
Seeded.
  Aurelia live site:    /sites/aurelia   (home page id ${home.id})
  Northwind live site:  /sites/northwind

  Logins (password: ${DEMO_PASSWORD})
    client@aurelia.test     Client Admin, Aurelia
    author@aurelia.test     Author, Aurelia
    designer@studio.test    Designer, both sites
    client@northwind.test   Client Admin, Northwind
    admin@platform.test     Super Admin
`);
  void admin;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
