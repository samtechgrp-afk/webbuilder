# Website Builder

A visual website builder and multi-tenant CMS with a client portal. Designers build premium sites with full control; clients sign in to their own portal and edit words, images, links and prices directly on the live page, inside guardrails the designer sets.

**Status: phase 10** (starter templates; see [Starter templates](#starter-templates)). Phase 1 laid the multi-tenant foundation, full Prisma schema, RBAC, Client Mode editor with locked containers, revisions and rollback, and media ingest (WebP). Phase 2 added Design mode: drag widgets from a palette, rearrange in Layers, and style every element per breakpoint. Phase 3 added the CMS:

- **Content dashboard** (`/admin/sites/:id/content`): per post type tables with search, sort, pagination and Published / Draft / Scheduled / Trash tabs; bulk publish, draft, trash, restore, delete and duplicate; a revision drawer with rollback; scheduled publishing through `/api/cron/scheduled`.
- **Post types** (`/cpts`): labels, slug rules, URL prefix, archive, hierarchy, REST API toggle, icons, page templates, a taxonomy manager, and a single template designed on the canvas.
- **Field engine** (`/fields`): drag-and-drop field group builder with 19 field types (text, rich text, media, choice, relational, repeater, flexible content) and ACF-style location rules by post type, template, term or parent page. Designer-only fields are enforced on the server.
- **Media library** (`/media`): grid and list views, drag-and-drop upload, type filter, search, batch tag and delete with usage checks, a metadata drawer; WebP plus responsive variants for images, and sanitised SVG.
- **Dynamic binding**: bind widget props to post data, custom fields or site data, and a Loop grid widget that previews real entries on the canvas. Clients see bound content as read-only. Site name, tagline, logo and the site's 404 page are set under **Settings** (`/settings`).
- **Real 404s**: missing pages, entries, drafts and trashed content answer HTTP 404 with the site's designed 404 page (or a default in its style). Signed-in editors preview drafts at their public address with `?preview=1`.

Phase 4 added the global design system:

- **Tokens** (`Site.designTokens`, versioned, with a `DesignTokenRevision` history): colours (canvas, three surfaces, primary, accent, heading, body, muted, border, plus any custom names), fonts, a fluid type scale, line heights, letter spacing, an 8pt spacing grid, radii, multi-layer shadows, backdrop blur, border glows and radial ambient glows.
- **Compiler** (`src/lib/design/tokens.ts`): one function turns tokens into `.site-root` CSS variables for the canvas, the live site (SSR) and the preview. The type scale compiles to `clamp()` values such as `--text-h1: clamp(2.33rem, 1.6rem + 3.26cqi, 4.21rem)`; it uses `cqi` (the site container) instead of `vw` so the editor's tablet and mobile previews scale exactly like a device. Spacing emits `--space-1` … `--space-32`.
- **Presets**: Linear Dark, Stripe Clean and Vercel Monochrome, applied in one click. A preset keeps the site's own extra tokens, so existing pages keep rendering.
- **Editors**: `/admin/sites/:id/design-system` (panel, live specimen, history with restore) and a **Design system** drawer in Design mode that restyles the canvas as you edit. The Style inspector switches fields between a raw value and a global token.
- **Guardrails**: only roles with `design.tokens` see the page or drawer; the server asserts the permission, validates every value (zod plus the CSS-injection filter) and refuses stale saves.

Phase 5 added SEO:

- **Live metadata**: title (site title template, home title), description (entry, then excerpt, then site default), canonical URL, Open Graph and Twitter cards with an absolute share image (entry share image, then featured image, then site default), Search Console / Bing verification on the home page, and JSON-LD (WebSite, Article, CollectionPage). Read from the published snapshot only.
- **robots.txt and sitemap.xml per site**, on the site's own host and under `/sites/<site>/`. The sitemap lists live pages, entries and archives only, using the 404 rules (no drafts, review, scheduled or trashed entries, never the designated 404 page) and leaves out noindex entries, excluded post types and entries canonicalised elsewhere. "Discourage search engines" closes robots.txt and empties the sitemap.
- **SEO screen** (`/seo`): an audit of every live page (missing, short or long descriptions, long or duplicate titles, no share image, hidden) for anyone who edits content, and site defaults for site-settings holders.
- **Entry editor**: search and social previews built from the same rules as the live page, a share image and a canonical URL.

Phase 6 added the export engine:

- **Static compilation** (`src/lib/export/compile.ts`): every live page, entry and archive is rendered by the live renderer and turned into a standalone `index.html`. Runtime scripts are dropped (JSON-LD stays), `/sites/<site>` paths become root-relative, canonical and Open Graph URLs point at the hosting address, and every stylesheet, font, image and icon the page uses is copied in. A page captured mid-stream is refused rather than exported half-rendered.
- **Bundle**: one zip with the pages, `404.html` (the site's designed 404 page), `sitemap.xml` and `robots.txt` for the hosting address, `data/content.json` with published entries and fields, the CSS, fonts and media, and a README. Drafts, review, scheduled and trashed entries are never included. It works on any static host (Netlify, Vercel, Cloudflare Pages, S3, nginx).
- **Export screen** (`/admin/sites/:id/export`): pick the hosting address, start an export that runs in the background with live progress, then download or delete it from the history. Each job lists warnings such as links with no page in the export. Bundles live in private storage (`storage/exports` under the app root, not public) and download only through an authenticated route.
- **Guardrails**: only roles with `site.settings` see the screen; starting, downloading and deleting all check the permission on the server, and one export per site runs at a time.

Phase 7 adds a headless GraphQL API:

- **Endpoint** `/api/v1/sites/<site id or subdomain>/graphql` (POST, or GET for cacheable public reads). Each site gets its own schema: `customFields` is a typed object built from the site's field groups (a price is a `Price`, an image a `MediaAsset`, a repeater a list of row objects, flexible content a union of layouts), rebuilt when field definitions change.
- **Queries**: `site`, `postTypes`, `post` / `page` by id or slug (with `parent` and `children` for page trees), `posts(type, first, after, where: { terms, category, tag, status, search, parent }, orderBy)`, `pages`, `taxonomies`, `term`, `mediaAsset`. Mutations `createEntry` and `updateEntry` save drafts only.
- **Access**: requests without a key (when public access is on) and read-only keys see live content, read from published snapshots. Read-write keys and signed-in editors can pass `preview: true` or a draft `status` to read working copies, and read-write keys can write drafts (never publish, never designer-only fields). Keys are `wbk_ro_…` / `wbk_rw_…`, stored as SHA-256 hashes, scoped to one site, revocable.
- **Performance and guardrails**: per-request DataLoaders batch every relation (fields, terms, images, authors, parents, children), so a page of 20 entries costs the same handful of queries as 2; each response reports `extensions.dbQueries`. Queries deeper than 5 levels or costlier than the budget (lists priced by `first`, at most 100) are refused before they run. Every read goes through the tenant-scoped client.
- **Developer screen** (`/admin/sites/:id/developer`, `developer.api` permission, designers only): API on/off, public access, key create/revoke (shown once), and an embedded GraphiQL playground.

## Quick start

```bash
cp .env.example .env            # set DATABASE_URL and SESSION_SECRET
npm install
npm run db:migrate              # creates the schema
npm run db:seed                 # two demo tenants, users, media, published pages
npm run dev                     # http://localhost:3000
```

Demo logins (password `demo-password-2026`):

| Email | Role | Sees |
| --- | --- | --- |
| `client@aurelia.test` | Client Admin | Aurelia only: edit content, publish, restore |
| `author@aurelia.test` | Author | Aurelia only: no inline page editing, can submit posts |
| `designer@studio.test` | Designer | Both sites: full control, can toggle locks |
| `client@northwind.test` | Client Admin | Northwind only |
| `admin@platform.test` | Super Admin | Everything |

Live sites: `/sites/aurelia`, `/sites/northwind`, or `aurelia.localhost:3000` once your hosts resolve subdomains.

## Checks

```bash
npm run typecheck
npm test                         # guardrails, tenant isolation, fields, location rules, binding, sanitising (needs seeded DB)
npm run build && npm start       # then, in another shell:
npm run e2e                      # Playwright: client edits hero → publish → live site → isolation
npm run e2e:designer             # Playwright: designer drags, reorders, styles per breakpoint → publish
npm run e2e:tokens               # Playwright: presets + live preview, save → live CSS vars, drawer, token/raw toggle, client lockout, restore
npm run e2e:seo                  # Playwright: sitemap/robots per site, live meta, site defaults, client entry SEO, lockout, discourage
npm run e2e:graphql              # Playwright: playground, keys, typed queries, no N+1, draft protection, isolation, depth/cost limits, lockout
npm run e2e:export               # Playwright: background export → zip contents → served by a plain static server → client lockout, delete
npm run e2e:404                  # Playwright: true 404 status, custom 404 page, drafts/trash hidden, editor preview
STRIPE_API_BASE=http://127.0.0.1:4242 npm start   # for the shop suite, start the server against the local Stripe mock
npm run e2e:ecommerce            # Playwright + Stripe mock: payments lockout, catalog, grid, variants, cart drawer, checkout, signed webhook, stock, orders
npm run e2e:i18n                 # Playwright: languages, prefixed routing, Accept-Language, locale domain, translation drawer, structural lockout, hreflang, sitemap, GraphQL
CRON_SECRET=… npm run e2e:cms    # Playwright: CPT + fields → client entry → loop grid binding → live site, media, trash, restore, schedule
npm run e2e:templates            # Playwright: client lockout, gallery filters, device previews, one-click create → canvas, all 30 templates → entity counts, live = preview, tenant isolation
```

Reseed with the server stopped (or restart it after seeding): resolved sites are cached by subdomain. For scheduled publishing in production, set `CRON_SECRET`; `vercel.json` calls the cron route every minute. The proxy fetches the rendered 404 page from `INTERNAL_URL` (defaults to `https://$VERCEL_URL`, else `http://127.0.0.1:$PORT`); with Vercel Deployment Protection on, point `INTERNAL_URL` at a reachable origin.

## Languages

A site starts with one language. Designers and admins add more under **Settings → Languages** (code, label, URL prefix, currency, optional domain); clients can't.

- **Routing.** The default language keeps clean paths (`/about`); the others are prefixed (`/fr/about`) or served on their own domain. A translated entry keeps its own slug, and `/fr/<original-slug>` redirects (308) to it. With detection on, a first visit to the home page is redirected (307) by `Accept-Language` and the choice is remembered in the `wb_locale` cookie; bots and returning visitors are left alone. A page with no translation falls back to the default language with a canonical pointing at it. Unknown paths get the 404 page in that language when one exists.
- **Translations.** A translation is its own post, linked to its original through `PostTranslation`. Builder pages store only overrides (text, images, links, SEO) keyed by node, laid over the original's published layout, so structure and styles can't drift between languages. Edit them side by side under **Translations**; the visual builder redirects there. Anything structural, bound or designer-locked is rejected on the server.
- **Admin.** The language picker in the admin bar filters Content; the canvas header lists each language's status.
- **Widget.** The *Language switcher* (inline or dropdown, label or code) links to the current page in each language and hides itself on single-language sites.
- **SEO.** Pages carry `hreflang` alternates (with `x-default`) in the head and a `Link` header; `sitemap.xml` lists every language with `xhtml:link` alternates.
- **GraphQL.** `page`, `post` and `posts` take `locale`; nodes expose `locale`, `translations` and `hreflangs`; `locales` lists the site's languages.

Limits in this version: single templates aren't translated (entries in other languages use the original template with their own field values); translations carry no terms, so term-filtered lists in another language come back empty; a GraphQL list in another language returns translated entries only.

## Shop

A native catalog with Stripe Checkout, separate from content post types.

- **Products** (`/admin/sites/<id>/products`, `commerce.manage`: designers and client admins): photos from the media library, price and compare-at price, SKU, stock tracking, physical or digital, and up to three options (Size, Color…) whose every combination is a variant with its own price, SKU and stock. Prices are stored in minor units.
- **Orders** (`/orders`): filter by status, see items, customer and shipping address, mark fulfilled or refunded (refunds themselves are issued in Stripe).
- **Payments** (`Settings → Payments`, `site.settings`: designers only): Stripe secret key and webhook signing secret, encrypted at rest with AES-256-GCM (`SECRETS_KEY`, else derived from `SESSION_SECRET`) and only ever shown masked; shipping countries; the product page template. The currency follows the default language (Phase 8), or the store currency on single-language sites.
- **Widgets**: *Product grid* (sort, limit, hide sold-out, optional visitor sorting), *Product details* (gallery, live price per variant, option selectors, stock, Add to cart; a fixed product or the page's product) and *Cart* (button with count and a slide-out drawer: quantities, subtotal, checkout). The cart lives in `localStorage` per site and is only a wish list. These three are the only Client Components on the live site.
- **Product pages** live at `/products/<slug>` (in every language), laid out by the chosen template, with Product JSON-LD and sitemap entries. Static exports include them as a catalog without cart or checkout.
- **Checkout** (`POST /api/v1/sites/<site>/checkout`, same-origin only) re-reads every product, variant, price and stock level from the site's own catalog, creates a `PENDING` order with prices frozen, and opens a Stripe Checkout session carrying the order id.
- **Webhook** (`POST /api/webhooks/stripe`, one endpoint for every shop): the signature must verify against the signing secret of the site the session names. `checkout.session.completed` marks the order `PAID` and takes items out of stock in one transaction, once; `checkout.session.expired` cancels it.

Stripe is called over its REST API (`src/server/commerce/stripe.ts`); `STRIPE_API_BASE` points it at another host, which is how `e2e:ecommerce` runs against `scripts/stripe-mock.mjs` without real keys. The seeded Aurelia shop uses placeholder keys, so real payments need a designer to enter real ones.

Limits in this version: product content isn't translated; no taxes, shipping rates, discounts or customer accounts (Stripe Checkout can add tax and shipping later); refunds don't restock automatically.

## Starter templates

New sites start from one of 30 blueprints across six sectors: SaaS & Tech, E-Commerce, Agency & Services, Portfolio, Education & Health, and Hospitality & Events.

- **Onboarding** (`/admin/sites/new`, linked from **Your sites**): a gallery filtered by sector, with a live preview of every page at desktop (1440), tablet (820) and mobile (390) widths. "Use this template" takes a name and an address and opens the new site's home page in the builder canvas. Platform admins and anyone who is a Designer somewhere can create sites; the creator becomes the new site's Designer. New sites start as drafts.
- **Blueprints** (`src/lib/templates/blueprints/*.json`) are data, not code: site settings and SEO, a full design-token preset, a few "look" switches (heading case, density, card style), header and footer, artwork specs, custom post types with fields and taxonomies, sample entries, products with options and variant prices, and pages made of sections (hero, features, pricing, loop grids bound to a post type, product grids, FAQ, contact and so on). `src/lib/templates/types.ts` is the schema; `schema.ts` validates it with zod and cross-checks links, slugs, route prefixes, field values and image references.
- **Compiler** (`compile.ts`): turns a blueprint into ordinary builder documents (one per page, plus the 404 page and, for shops, the product page template) with deterministic node ids and token-based styles, so everything stays editable on the canvas. The gallery preview and real sites use the same compiler and renderer; only the data source differs.
- **Seeder** (`seeder.ts`): renders the artwork through the normal media pipeline, then writes the site, membership, post types, field groups, fields, taxonomies, terms, media, entries, pages with published revisions, field values, store, products and variants in one Prisma transaction. If any step fails, nothing is kept: the transaction rolls back and the files written for it are deleted. A site takes about two seconds.
- **Artwork** (`artwork.ts`): images are generated SVG illustrations in each template's palette (no stock photos to license), stored as real media assets that clients can replace.

To add a blueprint, drop a JSON file named after its `key` into `blueprints/`, add it to `blueprints/index.ts`, and run `npm test`; the catalog tests check that it parses, compiles to valid documents and has valid sample values.

Uploads now go through a route handler (`src/app/uploads/[...path]`), because `next start` only serves files that were in `public/` when it booted. Without it, images uploaded or seeded after start-up returned 404 until a restart.

## Where things live

| Path | What |
| --- | --- |
| `prisma/schema.prisma` | Data model: tenants, users, roles, memberships, CPTs, posts, revisions, edit locks, custom fields, taxonomies, media, audit log, store, products, variants, orders |
| `src/proxy.ts` | Host routing (subdomain / custom domain → tenant) and the admin auth gate |
| `src/lib/tenant-db.ts` | `tenantDb(siteId)`: Prisma client that forces every query into one site |
| `src/lib/tenant.ts` | `getTenant(siteId)`: session + membership + permissions + scoped DB, 404 for non-members |
| `src/lib/rbac.ts` | Permission keys and system roles |
| `src/lib/builder/types.ts` | Builder document (flat node tree, responsive styles, locks) |
| `src/lib/builder/tree.ts` | Pure tree ops (insert, move, duplicate, remove), structural validation, cascade lookup |
| `src/lib/builder/policy.ts` | Guardrail engine: lock inheritance, document diffing, change authorisation |
| `src/lib/builder/render.tsx` | One renderer for the live site and the editor canvas |
| `src/lib/builder/styles.ts` | Style injection (container queries), token-driven base CSS, WCAG contrast |
| `src/lib/design/*` | Token types and compiler (fluid type, spacing grid), presets and fonts, zod validation |
| `src/server/design/tokens-service.ts`, `src/server/design-actions.ts` | Save / apply preset / restore tokens, version check, revisions, cache expiry |
| `src/lib/seo/*`, `src/server/seo/*` | SEO resolution and audit rules, site defaults schema, sitemap/robots bodies; sitemap data, page metadata + JSON-LD, public base URL |
| `src/app/sites/[site]/sitemap.xml`, `robots.txt` | Per-site crawler files (the proxy maps a site's own host here) |
| `src/components/design/*` | Tokens panel and live specimen, shared by the drawer and the design-system page |
| `src/components/editor/*` | Editor: Zustand store with undo/redo, canvas overlay with drag and drop (`dnd.ts`), Design mode sidebar (palette + Layers), designer style panel, client inspector, media picker, history |
| `src/server/content-service.ts` | Save / submit / publish / restore, edit locks, optimistic concurrency |
| `src/server/media-processing.ts` | Upload → WebP + responsive variants + blur placeholder + alt text |
| `src/app/admin/sites/[siteId]` | Client portal dashboard and editor routes |
| `src/app/sites/[site]/[[...slug]]` | Public site: builder pages, CPT entries (via single template) and archives, cached per tenant, expired on publish |
| `src/lib/cms/fields.ts` | Field types, definition and value validation (zod), repeater and flexible content |
| `src/lib/cms/location.ts` | Field group location rules (OR of AND groups) |
| `src/lib/cms/binding.ts` | `applyDynamic`: writes bound values into a document and expands loop grids (pure) |
| `src/server/cms/*` | Entry save/bulk/restore/schedule, schema service (post types, taxonomies, field groups), media metadata, dynamic data loading, revision snapshots |
| `src/server/sanitize.ts` | DOMPurify allowlists for rich text and uploaded SVG |
| `src/server/route-check.ts`, `src/app/site-404` | Proxy-side route check and the per-site 404 page served with status 404 |
| `src/lib/export/compile.ts`, `src/server/export/*` | Static HTML/CSS compiler; export jobs, bundling, private storage |
| `src/app/admin/sites/[siteId]/export`, `src/app/api/sites/[siteId]/exports` | Export screen and authenticated bundle download |
| `src/lib/graphql/*` | Per-site GraphQL SDL (typed custom fields), depth and cost analysis |
| `src/server/graphql/*`, `src/app/api/v1/sites/[site]/graphql` | GraphQL handler, resolvers, DataLoaders, API keys, Developer settings |
| `src/app/admin/sites/[siteId]/developer` | Developer screen and GraphiQL playground |
| `src/app/api/v1/sites/[site]/[type]` | Public REST API for post types with the API enabled |
| `src/lib/i18n/*` | Locale paths, Accept-Language matching, hreflang, translation overlay (`composeDocument`) |
| `src/server/i18n/*`, `src/server/i18n-actions.ts` | Language settings, translation create/save with structure guardrails, admin language picker |
| `src/app/admin/sites/[siteId]/translations`, `settings/languages` | Side-by-side translation drawer and language settings |
| `src/lib/commerce/*` | Money, cart, variant and storefront logic, Stripe signatures and form encoding (pure) |
| `src/server/commerce/*`, `src/server/commerce-actions.ts` | Catalog reads, products, orders, store settings, checkout, Stripe client, webhook processing |
| `src/components/commerce/*` | Product grid, product details and cart drawer widgets (Client Components) |
| `src/app/admin/sites/[siteId]/products`, `orders`, `settings/payments` | Product manager, orders dashboard, payment settings |
| `src/app/api/v1/sites/[site]/checkout`, `src/app/api/webhooks/stripe` | Checkout session API and Stripe webhook |
| `src/lib/templates/*` | Blueprint schema and validation, compiler to builder documents, artwork, preview data, transactional seeder |
| `src/lib/templates/blueprints/*.json` | The 30 starter template manifests |
| `src/server/template-service.ts`, `src/server/template-actions.ts` | Who can create sites, and the create-from-template action |
| `src/app/admin/sites/new` | Template gallery, preview modal and preview routes |
| `src/app/uploads/[...path]` | Serves uploaded files added after the server started |
