# Website Builder

A visual website builder and multi-tenant CMS with a client portal. Designers build premium sites with full control; clients sign in to their own portal and edit words, images, links and prices directly on the live page, inside guardrails the designer sets.

**Status: phase 2.** Phase 1 laid the multi-tenant foundation, full Prisma schema, RBAC, Client Mode editor with locked containers, revisions and rollback, and media ingest (WebP). Phase 2 adds Design mode for designers: drag widgets from a palette onto the canvas, rearrange in a Layers tree, and style every element per breakpoint (Flexbox/Grid layout, spacing, size, typography, fill, border) with the desktop-first cascade shown in each field. The token editor, CPT admin screens, SEO screens, sitemap and export engine come next.

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
npm test                         # guardrail policy + tenant isolation (needs seeded DB)
npm run build && npm start       # then, in another shell:
npm run e2e                      # Playwright: client edits hero → publish → live site → isolation
npm run e2e:designer             # Playwright: designer drags, reorders, styles per breakpoint → publish
```

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
| `src/app/sites/[site]/[[...slug]]` | Public site, cached per tenant, expired on publish |
