// End-to-end headless GraphQL API:
//   1. A Designer opens Developer, runs the embedded GraphiQL playground and
//      creates a read-only and a read-write key (each shown once).
//   2. Single entries, collections (term filters, ordering, pagination),
//      pages, taxonomies and strongly typed custom fields by slug.
//   3. DataLoader batching: 2 or 20 entries with fields, terms, images and
//      authors cost the same number of database queries.
//   4. Drafts: anonymous and read-key requests can't see or preview drafts;
//      a read-write key can, and its writes stay drafts (never live, never
//      designer-only fields).
//   5. Tenant isolation: keys only work on their own site and no query
//      reaches another site's rows.
//   6. Depth and cost limits refuse hostile queries before they run.
//   7. Client Admins get no Developer screen and can't create keys (the
//      replayed action is refused); revoking a key and closing public access
//      take effect immediately.
//
// Usage: npm run db:seed && npm run build && npm start   (in another shell)
//        npm run e2e:graphql
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SHOTS = process.env.SCREENSHOT_DIR ?? "e2e-screenshots";
await mkdir(SHOTS, { recursive: true });

const prisma = new PrismaClient();
const browser = await chromium.launch();
const step = (msg) => console.log(`✓ ${msg}`);
const fail = (msg) => {
  throw new Error(msg);
};

async function login(email) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.on("dialog", (d) => d.accept());
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "demo-password-2026");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin/);
  return page;
}

/** POST a GraphQL operation; returns { status, body }. */
async function gql(site, query, { key, variables } = {}) {
  const res = await fetch(`${BASE}/api/v1/sites/${site}/graphql`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) },
    body: JSON.stringify({ query, variables }),
  });
  return { status: res.status, body: await res.json() };
}
const errCode = (r) => r.body.errors?.[0]?.extensions?.code;

const aurelia = await prisma.site.findUniqueOrThrow({ where: { subdomain: "aurelia" } });
const northwind = await prisma.site.findUniqueOrThrow({ where: { subdomain: "northwind" } });
let designer;
let client;
const extraIds = [];
try {
  // ── 1. Developer screen, playground, keys ────────────────────────────────
  designer = await login("designer@studio.test");
  await designer.goto(`${BASE}/admin/sites/${aurelia.id}`);
  await designer.getByRole("link", { name: "Developer", exact: true }).click();
  await designer.waitForURL(/\/developer$/);
  await designer.locator('[data-api-status="on"]').waitFor();
  await designer.locator("[data-playground] .graphiql-execute-button").waitFor({ timeout: 30_000 });
  // On a cold server the editor can still be booting when the button appears, and an early click is dropped.
  const result = designer.locator("[data-playground] .result-window").getByText("Alabaster Table Lamp").first();
  for (let attempt = 0; attempt < 5 && !(await result.isVisible()); attempt++) {
    await designer.locator("[data-playground] .graphiql-execute-button").click();
    await result.waitFor({ timeout: 6_000 }).catch(() => {});
  }
  await result.waitFor({ timeout: 5_000 });
  step("Designer opens Developer; the embedded GraphiQL playground runs a query against this site");

  const createKey = async (name, scope) => {
    await designer.getByLabel("Key name").fill(name);
    await designer.locator(`input[name="scope"][value="${scope}"]`).check();
    const req = designer.waitForRequest((r) => r.method() === "POST" && !!r.headers()["next-action"]);
    await designer.locator("[data-create-key]").click();
    const actionReq = await req;
    const key = (await designer.locator("[data-new-key-value]").textContent()).trim();
    await designer.getByRole("button", { name: "Done" }).click();
    return { key, actionReq };
  };
  const { key: readKey, actionReq: createKeyReq } = await createKey("Next.js storefront", "READ");
  const { key: writeKey } = await createKey("Preview server", "READ_WRITE");
  if (!/^wbk_ro_[A-Za-z0-9]{32}$/.test(readKey) || !/^wbk_rw_[A-Za-z0-9]{32}$/.test(writeKey)) fail(`Unexpected key formats ${readKey} ${writeKey}`);
  const stored = await prisma.apiKey.findMany({ where: { siteId: aurelia.id } });
  if (stored.length !== 2 || stored.some((k) => k.keyHash.includes(readKey.slice(7)) || k.keyHash.length !== 64)) fail("Keys aren't stored hashed");
  await designer.locator('[data-api-key="read"]').waitFor();
  await designer.locator('[data-api-key="read-write"]').waitFor();
  await designer.screenshot({ path: path.join(SHOTS, "graphql-developer.png"), fullPage: true });
  step("Designer creates a read-only and a read-write key; each is shown once and stored only as a hash");

  // ── 2. Queries ───────────────────────────────────────────────────────────
  const single = await gql("aurelia", `{ post(type: "product", slug: "alabaster-table-lamp") { title uri status isPreview featuredImage { url width srcSet } terms { name slug taxonomy { key } } author { name }
      customFields { price { amount currency formatted } material sku dimensions { label value } } } }`, { key: readKey });
  const p = single.body.data?.post;
  if (!p || p.title !== "Alabaster Table Lamp" || p.uri !== "/shop/alabaster-table-lamp" || p.status !== "PUBLISHED" || p.isPreview) fail(`Single post: ${JSON.stringify(single.body)}`);
  if (p.customFields.price.amount !== 680 || p.customFields.price.formatted !== "$680.00" || p.customFields.sku !== "AUR-L-014" || p.customFields.dimensions[0].label !== "Height") fail(`Custom fields: ${JSON.stringify(p.customFields)}`);
  if (p.terms[0]?.slug !== "lighting" || p.terms[0].taxonomy.key !== "product_cat" || !p.featuredImage?.url.endsWith(".webp") || !p.featuredImage.srcSet) fail(`Relations: ${JSON.stringify(p)}`);

  const coll = await gql("aurelia", `query ($after: String) {
      all: posts(type: "product", orderBy: TITLE_ASC) { totalCount nodes { title } }
      seating: posts(type: "product", where: { terms: [{ taxonomy: "product_cat", slug: "seating" }] }, orderBy: TITLE_ASC) { totalCount nodes { title } }
      page1: posts(type: "product", first: 2, orderBy: TITLE_ASC) { pageInfo { hasNextPage endCursor } nodes { title } }
      page2: posts(type: "product", first: 2, after: $after, orderBy: TITLE_ASC) { pageInfo { hasNextPage } nodes { title } }
    }`, { variables: { after: Buffer.from("o:2").toString("base64url") } });
  const c = coll.body.data;
  if (c?.all.totalCount !== 3 || c.all.nodes.map((n) => n.title).join() !== "Alabaster Table Lamp,Linen Lounge Sofa,Velvet Garden Chair") fail(`Collection: ${JSON.stringify(coll.body)}`);
  if (c.seating.totalCount !== 2 || c.seating.nodes.some((n) => n.title === "Alabaster Table Lamp")) fail("Term filter");
  if (!c.page1.pageInfo.hasNextPage || c.page2.nodes.length !== 1 || c.page2.pageInfo.hasNextPage || c.page2.nodes[0].title !== "Velvet Garden Chair") fail(`Pagination: ${JSON.stringify(c)}`);

  const misc = await gql("aurelia", `{ site { name tagline logo { url } } page(slug: "/") { title uri document } postType(key: "product") { labelPlural fields { key type } taxonomies { key } }
      taxonomies { key terms { slug } } term(taxonomy: "product_cat", slug: "seating") { name taxonomy { label } } }`);
  const m = misc.body.data;
  if (m?.site.name !== "Aurelia Interiors" || m.site.tagline !== "Interior architecture in New England" || !m.site.logo) fail(`Site: ${JSON.stringify(misc.body)}`);
  if (m.page.title !== "Home" || m.page.uri !== "/" || !m.page.document?.nodes) fail("Page by slug");
  if (m.postType.fields.map((f) => `${f.key}:${f.type}`).join() !== "price:PRICE,material:TEXT,sku:TEXT,dimensions:REPEATER" || m.postType.taxonomies[0].key !== "product_cat") fail("Post type fields");
  if (m.taxonomies[0].terms.length !== 2 || m.term.name !== "Seating") fail("Taxonomies");
  step("Queries return single entries, collections (term filter, order, pagination), pages, taxonomies and typed custom fields by slug");

  // ── 3. No N+1: 2 vs 20 entries cost the same queries ─────────────────────
  const product = await prisma.postType.findFirstOrThrow({ where: { siteId: aurelia.id, key: "product" } });
  const lighting = await prisma.term.findFirstOrThrow({ where: { siteId: aurelia.id, slug: "lighting" } });
  const images = await prisma.mediaAsset.findMany({ where: { siteId: aurelia.id, tags: { has: "demo" } } });
  const olivia = await prisma.user.findUniqueOrThrow({ where: { email: "client@aurelia.test" } });
  const fields = await prisma.customField.findMany({ where: { siteId: aurelia.id, key: { in: ["price", "material"] } } });
  for (let i = 0; i < 22; i++) {
    const values = { price: { amount: 100 + i, currency: "USD" }, material: `Batch ${i}` };
    const post = await prisma.post.create({
      data: { siteId: aurelia.id, postTypeId: product.id, authorId: olivia.id, title: `Batch item ${i}`, slug: `batch-item-${i}`, status: "PUBLISHED", publishedAt: new Date(Date.now() - (10 + i) * 86_400_000), featuredImageId: images[i % images.length].id, draft: { type: "html", html: "" } },
    });
    extraIds.push(post.id);
    for (const f of fields) await prisma.fieldValue.create({ data: { siteId: aurelia.id, postId: post.id, fieldId: f.id, value: values[f.key] } });
    await prisma.postTerm.create({ data: { postId: post.id, termId: lighting.id } });
    const rev = await prisma.postRevision.create({
      data: { siteId: aurelia.id, postId: post.id, version: 1, kind: "PUBLISHED", title: post.title, document: post.draft, meta: { fields: values, featuredImageId: post.featuredImageId, termIds: [lighting.id], authorName: "Olivia Hart" }, authorId: olivia.id },
    });
    await prisma.post.update({ where: { id: post.id }, data: { publishedRevisionId: rev.id } });
  }
  const heavy = (n) => `{ posts(type: "product", first: ${n}) { totalCount nodes { title author { name } featuredImage { url variants { url } } terms { name taxonomy { key } } customFields { price { amount } material dimensions { label } } } } }`;
  const small = await gql("aurelia", heavy(2), { key: readKey });
  const big = await gql("aurelia", heavy(20), { key: readKey });
  if (big.body.data?.posts.nodes.length !== 20 || big.body.data.posts.totalCount !== 25) fail(`Batch query: ${JSON.stringify(big.body).slice(0, 300)}`);
  if (big.body.data.posts.nodes.some((n) => !n.featuredImage || !n.terms.length || !n.customFields.price)) fail("Batch relations missing");
  const [qs, qb] = [small.body.extensions.dbQueries, big.body.extensions.dbQueries];
  if (qs !== qb || qb > 8) fail(`Query count grows with page size: ${qs} for 2 entries, ${qb} for 20`);
  step(`DataLoader batching: 20 entries with authors, images, terms and fields take ${qb} database queries, the same as 2`);

  // ── 4. Drafts ────────────────────────────────────────────────────────────
  const draftSlug = `{ post(type: "post", slug: "warm-up-a-north-facing-room") { title status } }`;
  const draftPreview = `{ post(type: "post", slug: "warm-up-a-north-facing-room", preview: true) { id title status isPreview } }`;
  const draftList = `{ posts(type: "post", where: { status: [DRAFT, PENDING_REVIEW] }) { nodes { title } } }`;
  for (const [who, key] of [["anonymous", undefined], ["read key", readKey]]) {
    if ((await gql("aurelia", draftSlug, { key })).body.data.post !== null) fail(`${who} saw a draft by slug`);
    if (errCode(await gql("aurelia", draftPreview, { key })) !== "FORBIDDEN") fail(`${who} previewed a draft`);
    if (errCode(await gql("aurelia", draftList, { key })) !== "FORBIDDEN") fail(`${who} listed drafts`);
    const blog = await gql("aurelia", `{ posts(type: "post") { nodes { title } } }`, { key });
    if (blog.body.data.posts.nodes.some((n) => n.title.includes("north-facing"))) fail(`${who} saw a draft in a list`);
  }
  const preview = await gql("aurelia", draftPreview, { key: writeKey });
  const d = preview.body.data?.post;
  if (d?.title !== "Five ways to warm up a north-facing room" || d.status !== "PENDING_REVIEW" || !d.isPreview) fail(`Read-write preview: ${JSON.stringify(preview.body)}`);
  if (errCode(await gql("aurelia", `mutation { createEntry(type: "product", title: "Sneaky") { id } }`, { key: readKey })) !== "FORBIDDEN") fail("A read key created an entry");
  if (errCode(await gql("aurelia", `{ mediaAssets { nodes { url } } }`, { key: readKey })) !== "FORBIDDEN") fail("A read key browsed the media library");

  const created = await gql("aurelia", `mutation { createEntry(type: "product", title: "Headless stool") { id status isPreview } }`, { key: writeKey });
  const newId = created.body.data?.createEntry?.id;
  if (!newId || created.body.data.createEntry.status !== "DRAFT") fail(`createEntry: ${JSON.stringify(created.body)}`);
  extraIds.push(newId);
  const lamp = await prisma.post.findFirstOrThrow({ where: { siteId: aurelia.id, slug: "alabaster-table-lamp" } });
  const upd = await gql("aurelia", `mutation ($id: ID!) { updateEntry(id: $id, input: { title: "Alabaster Lamp (draft)", customFields: { material: "Onyx", sku: "HACKED" } }) { title status customFields { material sku } } }`, { key: writeKey, variables: { id: lamp.id } });
  const u = upd.body.data?.updateEntry;
  if (u?.title !== "Alabaster Lamp (draft)" || u.customFields.material !== "Onyx" || u.customFields.sku !== "AUR-L-014") fail(`updateEntry: ${JSON.stringify(upd.body)}`);
  const live = (await gql("aurelia", `{ post(type: "product", slug: "alabaster-table-lamp") { title customFields { material } } }`)).body.data.post;
  if (live.title !== "Alabaster Table Lamp" || live.customFields.material !== "Spanish alabaster, brass") fail("An API draft changed the live entry");
  if ((await gql("aurelia", `{ posts(type: "product") { totalCount } }`)).body.data.posts.totalCount !== 25) fail("An API-created draft went live");
  step("Drafts stay private: anonymous and read-key requests can't fetch or preview them; a read-write key can, and its writes stay drafts without touching designer-only fields");

  // ── 5. Tenant isolation ──────────────────────────────────────────────────
  if ((await gql("northwind", "{ site { name } }")).status !== 404) fail("Northwind's API answered while turned off");
  await designer.goto(`${BASE}/admin/sites/${northwind.id}/developer`);
  await designer.locator('[data-api-status="off"]').waitFor();
  await designer.locator("#graphql-enabled").click();
  await designer.locator('[data-api-status="on"]').waitFor();
  const { key: nwKey } = await createKey("Northwind app", "READ_WRITE");
  const nwHome = await prisma.post.findFirstOrThrow({ where: { siteId: northwind.id, slug: "home" } });
  const auAsset = images[0].id;
  if ((await gql("aurelia", "{ site { name } }", { key: nwKey })).status !== 401) fail("Northwind's key worked on Aurelia");
  if ((await gql("northwind", "{ site { name } }", { key: writeKey })).status !== 401) fail("Aurelia's key worked on Northwind");
  const cross = await gql("aurelia", `query ($id: ID!) { post(id: $id) { title } p: post(id: $id, preview: true) { title } pages { nodes { title } } }`, { key: writeKey, variables: { id: nwHome.id } });
  if (cross.body.data.post !== null || cross.body.data.p !== null) fail("Aurelia's endpoint returned a Northwind entry by id");
  const nw = await gql(northwind.id, `query ($a: ID!) { site { name } mediaAsset(id: $a) { url } mediaAssets { totalCount } posts(type: "page") { nodes { title } } product: postType(key: "product") { key } }`, { key: nwKey, variables: { a: auAsset } });
  if (nw.body.data?.site.name !== "Northwind Dental" || nw.body.data.mediaAsset !== null || nw.body.data.mediaAssets.totalCount !== 0 || nw.body.data.product !== null || nw.body.data.posts.nodes.length !== 1) fail(`Northwind isolation: ${JSON.stringify(nw.body)}`);
  step("Tenant isolation: each key works only on its own site, and ids from another site resolve to nothing (by subdomain or site id)");

  // ── 6. Depth and cost limits ─────────────────────────────────────────────
  const deep = await gql("aurelia", `{ page(slug: "home") { parent { parent { parent { parent { title } } } } } }`);
  if (deep.status !== 400 || errCode(deep) !== "DEPTH_LIMIT" || deep.body.data) fail(`Depth limit: ${JSON.stringify(deep.body)}`);
  const viaFragment = await gql("aurelia", `{ page(slug: "home") { ...P } } fragment P on Post { children { children { children { children { title } } } } }`);
  if (errCode(viaFragment) !== "DEPTH_LIMIT") fail("Depth limit through fragments");
  const wide = `{ ${[1, 2, 3].map((i) => `a${i}: posts(type: "product", first: 100) { nodes { terms { children { name } } } }`).join(" ")} }`;
  if (errCode(await gql("aurelia", wide)) !== "COST_LIMIT") fail("Cost limit");
  if (errCode(await gql("aurelia", `{ posts(type: "product", first: 1000) { nodes { title } } }`)) !== "COST_LIMIT") fail("Page size limit");
  step("Queries nested more than 5 levels (also through fragments) or too expensive are refused before they run");

  // ── 7. Client lockout, revoke, public access ─────────────────────────────
  client = await login("client@aurelia.test");
  await client.goto(`${BASE}/admin/sites/${aurelia.id}`);
  if (await client.getByRole("link", { name: "Developer", exact: true }).count()) fail("Client Admin sees the Developer link");
  await client.goto(`${BASE}/admin/sites/${aurelia.id}/developer`);
  await client.getByText("This page could not be found.").waitFor();
  const before = await prisma.apiKey.count();
  const replay = await client.request.post(createKeyReq.url(), {
    headers: { "next-action": createKeyReq.headers()["next-action"], "content-type": createKeyReq.headers()["content-type"], accept: "text/x-component", origin: new URL(BASE).origin },
    data: createKeyReq.postData(),
  });
  if (!/permission/i.test(await replay.text())) fail("Client's replayed key creation wasn't refused");
  if ((await prisma.apiKey.count()) !== before) fail("A client's replay created a key");
  step("Client Admins get no Developer link or page and can't create keys (replayed action refused)");

  await designer.goto(`${BASE}/admin/sites/${aurelia.id}/developer`);
  await designer.locator('[data-api-key="read"]').getByRole("button", { name: "Revoke" }).click();
  await designer.locator("[data-revoked-key]").first().waitFor({ state: "attached" });
  if ((await gql("aurelia", "{ site { name } }", { key: readKey })).status !== 401) fail("A revoked key still works");
  await designer.locator("#graphql-public").click();
  await designer.getByText("GraphQL API settings saved.").waitFor();
  if ((await gql("aurelia", "{ site { name } }")).status !== 401) fail("Anonymous request worked with public access off");
  if ((await gql("aurelia", "{ site { name } }", { key: writeKey })).body.data?.site.name !== "Aurelia Interiors") fail("Keys stopped working with public access off");
  step("Revoking a key and closing public access take effect on the next request");

  console.log("\nGraphQL API passed.");
} catch (err) {
  for (const [name, p] of [["designer", designer], ["client", client]]) {
    if (p) await p.screenshot({ path: path.join(SHOTS, `graphql-failure-${name}.png`), fullPage: true }).catch(() => {});
  }
  console.error(err);
  process.exitCode = 1;
} finally {
  if (extraIds.length) await prisma.post.deleteMany({ where: { id: { in: extraIds } } }).catch(() => {});
  await browser.close();
  await prisma.$disconnect();
}
