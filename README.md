# Website Builder

A visual website builder and multi-tenant CMS with a client portal. Designers build premium sites with full control; clients sign in to their own portal and edit words, images, links and prices directly on the live page, inside guardrails the designer sets.

**Status: phase 3.** Phase 1 laid the multi-tenant foundation, full Prisma schema, RBAC, Client Mode editor with locked containers, revisions and rollback, and media ingest (WebP). Phase 2 added Design mode: drag widgets from a palette, rearrange in Layers, and style every element per breakpoint. Phase 3 adds the CMS:

- **Content dashboard** (`/admin/sites/:id/content`): per post type tables with search, sort, pagination and Published / Draft / Scheduled / Trash tabs; bulk publish, draft, trash, restore, delete and duplicate; a revision drawer with rollback; scheduled publishing through `/api/cron/scheduled`.
- **Post types** (`/cpts`): labels, slug rules, URL prefix, archive, hierarchy, REST API toggle, icons, page templates, a taxonomy manager, and a single template designed on the canvas.
- **Field engine** (`/fields`): drag-and-drop field group builder with 19 field types (text, rich text, media, choice, relational, repeater, flexible content) and ACF-style location rules by post type, template, term or parent page. Designer-only fields are enforced on the server.
- **Media library** (`/media`): grid and list views, drag-and-drop upload, type filter, search, batch tag and delete with usage checks, a metadata drawer; WebP plus responsive variants for images, and sanitised SVG.
- **Dynamic binding**: bind widget props to post data, custom fields or site data, and a Loop grid widget that previews real entries on the canvas. Clients see bound content as read-only. Site name, tagline and logo are set under **Settings** (`/settings`).

GraphQL, the token editor, SEO screens, sitemap and the export engine come next.

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
CRON_SECRET=… npm run e2e:cms    # Playwright: CPT + fields → client entry → loop grid binding → live site, media, trash, restore, schedule
```

Reseed with the server stopped (or restart it after seeding): resolved sites are cached by subdomain. For scheduled publishing in production, set `CRON_SECRET`; `vercel.json` calls the cron route every minute.

## Where things live

| Path | What |
| --- | --- |
| `prisma/schema.prisma` | Data model: tenants, users, roles, memberships, CPTs, posts, revisions, edit locks, custom fields, taxonomies, media, audit log |
| `src/proxy.ts` | Host routing (subdomain / custom domain → tenant) and the admin auth gate |
| `src/lib/tenant-db.ts` | `tenantDb(siteId)`: Prisma client that forces every query into one site |
| `src/lib/tenant.ts` | `getTenant(siteId)`: session + membership + permissions + scoped DB, 404 for non-members |
| `src/lib/rbac.ts` | Permission keys and system roles |
| `src/lib/builder/types.ts` | Builder document (flat node tree, responsive styles, locks) |
| `src/lib/builder/tree.ts` | Pure tree ops (insert, move, duplicate, remove), structural validation, cascade lookup |
| `src/lib/builder/policy.ts` | Guardrail engine: lock inheritance, document diffing, change authorisation |
| `src/lib/builder/render.tsx` | One renderer for the live site and the editor canvas |
| `src/lib/builder/styles.ts` | Style injection (container queries), design tokens → CSS vars, WCAG contrast |
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
| `src/app/api/v1/sites/[site]/[type]` | Public REST API for post types with the API enabled |
