// End-to-end starter templates:
//   1. Permissions: a Client Admin gets no "New site" button and no gallery.
//   2. Gallery: sector filters, the live preview modal with its page picker
//      and desktop, tablet and mobile frames.
//   3. One-click create: a designer creates a site from the modal and lands
//      in the builder canvas, which holds the same nodes as the preview.
//      Taken addresses are refused with a message.
//   4. Every one of the 30 blueprints is instantiated through the same form;
//      each new site has exactly the pages, entries, field values, media,
//      products and variants its manifest describes.
//   5. Live render matches the spec: every page of every new site renders
//      the same node tree (node classes and widget types) and the same text
//      as the template preview.
//   6. Tenant isolation: every new row carries the new siteId, the creator is
//      a member of the new sites only, and existing sites are untouched.
//
// Usage: npm run db:seed && npm run build && npm start   (in another shell)
//        npm run e2e:templates
import { mkdir, readFile, readdir } from "node:fs/promises";
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

const dir = path.join(process.cwd(), "src/lib/templates/blueprints");
const blueprints = await Promise.all((await readdir(dir)).filter((f) => f.endsWith(".json")).sort().map(async (f) => JSON.parse(await readFile(path.join(dir, f), "utf8"))));

async function login(email) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "demo-password-2026");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin/);
  return page;
}

/** Node classes, widget types and visible text of a rendered page, in document order. */
function signature(html) {
  const body = html.slice(html.indexOf("<body")).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<template[\s\S]*?<\/template>/g, "");
  const nodes = [...body.matchAll(/class="(n-[\w-]+)[^"]*"[^>]*?data-w="(\w+)"/g)].map((m) => `${m[1]}:${m[2]}`);
  const text = body
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;| /g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { nodes, text };
}

/** Rows per site for every tenant-owned table the seeder writes. */
async function siteCounts(siteId) {
  const where = { siteId };
  const tables = ["post", "postRevision", "postType", "customField", "fieldGroup", "fieldValue", "taxonomy", "term", "mediaAsset", "product", "productVariant", "store", "membership"];
  const counts = await Promise.all(tables.map((t) => prisma[t].count({ where })));
  return { ...Object.fromEntries(tables.map((t, i) => [t, counts[i]])), postTerm: await prisma.postTerm.count({ where: { post: where } }) };
}

const variantCount = (p) => (p.options?.length ? p.options.reduce((n, o) => n * o.values.length, 1) : 0);

let designer, client;
try {
  if (blueprints.length !== 30) fail(`Expected 30 blueprint manifests, found ${blueprints.length}`);
  const existing = await prisma.site.findMany({ select: { id: true, subdomain: true } });
  const before = Object.fromEntries(await Promise.all(existing.map(async (s) => [s.id, await siteCounts(s.id)])));
  const designerUser = await prisma.user.findUniqueOrThrow({ where: { email: "designer@studio.test" } });
  const membershipsBefore = await prisma.membership.count({ where: { userId: designerUser.id } });

  // ── 1. Permissions ──────────────────────────────────────────────────────────
  client = await login("client@aurelia.test");
  await client.goto(`${BASE}/admin`);
  if (await client.locator("[data-new-site]").count()) fail("A Client Admin sees the New site button");
  await client.goto(`${BASE}/admin/sites/new`);
  await client.locator("[data-create-forbidden]").waitFor();
  if (await client.locator("[data-template-card]").count()) fail("A Client Admin sees the template gallery");
  step("A Client Admin gets no New site button, and the gallery tells them only designers can create sites");

  // ── 2. Gallery ──────────────────────────────────────────────────────────────
  designer = await login("designer@studio.test");
  await designer.goto(`${BASE}/admin`);
  await designer.locator("[data-new-site]").click();
  await designer.waitForURL(/\/admin\/sites\/new$/);
  if ((await designer.locator("[data-template-card]").count()) !== 30) fail("The gallery doesn't show 30 templates");
  const sectors = [...new Set(blueprints.map((b) => b.sector))];
  for (const sector of sectors) {
    await designer.locator(`[data-sector-filter="${sector}"]`).click();
    const visible = await designer.locator("[data-template-card]:visible").evaluateAll((els) => els.map((e) => e.getAttribute("data-sector")));
    const expected = blueprints.filter((b) => b.sector === sector).length;
    if (visible.length !== expected || visible.some((s) => s !== sector)) fail(`The ${sector} filter shows ${visible.length} cards (${visible.join(", ")}), expected ${expected}`);
    if ((await designer.locator(`[data-sector-filter="${sector}"]`).getAttribute("aria-pressed")) !== "true") fail("The active filter isn't marked pressed");
  }
  await designer.locator('[data-sector-filter="all"]').click();
  if ((await designer.locator("[data-template-card]:visible").count()) !== 30) fail("Clearing the filter doesn't bring back all 30");
  step(`The gallery filters by sector (${sectors.length} sectors, ${sectors.map((s) => blueprints.filter((b) => b.sector === s).length).join(" + ")} templates)`);

  await designer.locator('[data-preview="tech-summit"]').click();
  const modal = designer.locator('[data-preview-modal="tech-summit"]');
  await modal.waitFor();
  for (const [device, width] of [["desktop", 1440], ["tablet", 820], ["mobile", 390]]) {
    await modal.locator(`[data-device="${device}"]`).click();
    const frame = modal.locator(`[data-preview-frame="${device}"]`);
    await frame.waitFor();
    if ((await frame.evaluate((f) => f.style.width)) !== `${width}px`) fail(`The ${device} frame isn't ${width}px wide`);
    const inner = await frame.elementHandle().then((h) => h.contentFrame());
    await inner.waitForSelector('[data-w="heading"]');
    const innerWidth = await inner.evaluate(() => window.innerWidth);
    if (innerWidth !== width) fail(`The ${device} preview renders at ${innerWidth}px`);
    await designer.screenshot({ path: path.join(SHOTS, `templates-01-preview-${device}.png`) });
  }
  await modal.locator("[data-preview-page]").selectOption("agenda");
  const agenda = await modal.locator("[data-preview-frame]").elementHandle().then((h) => h.contentFrame());
  await agenda.waitForFunction(() => document.body.innerText.includes("Registration and coffee"));
  await modal.locator('[data-device="desktop"]').click();
  await modal.locator("[data-close-preview]").click();
  await modal.waitFor({ state: "hidden" });
  step("The preview modal renders the template at 1440, 820 and 390 px, switches pages and closes");

  // ── 3. One-click create ─────────────────────────────────────────────────────
  async function create(key, name, subdomain) {
    await designer.goto(`${BASE}/admin/sites/new`);
    await designer.locator(`[data-preview="${key}"]`).click();
    const m = designer.locator(`[data-preview-modal="${key}"]`);
    await m.locator('input[name="name"]').fill(name);
    if (subdomain) await m.locator('input[name="subdomain"]').fill(subdomain);
    await m.locator("[data-create-site]").click();
    return m;
  }

  await create("tech-summit", "Horizon Summit");
  await designer.waitForURL(/\/admin\/sites\/[^/]+\/pages\/[^/]+\/edit$/, { timeout: 60_000 });
  const [, summitId] = designer.url().match(/\/admin\/sites\/([^/]+)\//);
  const summitSite = await prisma.site.findUniqueOrThrow({ where: { id: summitId } });
  if (summitSite.subdomain !== "horizon-summit") fail(`The address wasn't suggested from the name: ${summitSite.subdomain}`);
  await designer.locator("[data-node-id]").first().waitFor();
  const canvasIds = new Set(await designer.locator("[data-node-id]").evaluateAll((els) => els.map((e) => e.getAttribute("data-node-id"))));
  const previewHome = signature(await (await designer.request.get(`${BASE}/admin/sites/new/preview/tech-summit`)).text());
  const previewIds = new Set(previewHome.nodes.map((n) => n.split(":")[0].slice(2)));
  const missing = [...previewIds].filter((id) => ![...canvasIds].some((c) => c === id || c.startsWith(`${id}`)));
  if (missing.length) fail(`The canvas is missing preview nodes: ${missing.slice(0, 5).join(", ")}`);
  await designer.screenshot({ path: path.join(SHOTS, "templates-02-canvas.png") });
  step(`“Use this template” creates horizon-summit and opens its home page in the builder canvas, with all ${previewIds.size} preview nodes`);

  const dup = await create("fine-dining", "Another", "horizon-summit");
  await dup.locator("[data-create-error]").waitFor();
  if (!/taken/i.test(await dup.locator("[data-create-error]").textContent())) fail("A taken address isn't explained");
  const reserved = await create("fine-dining", "Another", "admin");
  await reserved.locator("[data-create-error]").waitFor();
  step("Taken and reserved addresses are refused with a message, and nothing is created");

  // ── 4. All 30 blueprints ────────────────────────────────────────────────────
  const sites = { "tech-summit": summitSite };
  const t0 = Date.now();
  for (const bp of blueprints) {
    if (sites[bp.key]) continue;
    await create(bp.key, bp.site.name, `e2e-${bp.key}`);
    await designer.waitForURL(/\/pages\/[^/]+\/edit$/, { timeout: 60_000 });
    sites[bp.key] = await prisma.site.findUniqueOrThrow({ where: { subdomain: `e2e-${bp.key}` } });
  }
  const seconds = ((Date.now() - t0) / 1000).toFixed(0);

  for (const bp of blueprints) {
    const site = sites[bp.key];
    const c = await siteCounts(site.id);
    const fieldCount = bp.postTypes.reduce((n, p) => n + p.fields.length, 0);
    const values = bp.entries.reduce((n, e) => n + Object.keys(e.fields).length, 0);
    const expected = {
      post: bp.pages.length + 1 + bp.entries.length + (bp.products.length ? 1 : 0),
      postType: 3 + bp.postTypes.length,
      customField: fieldCount,
      fieldGroup: bp.postTypes.filter((p) => p.fields.length).length,
      fieldValue: values,
      taxonomy: bp.postTypes.filter((p) => p.taxonomy).length,
      postTerm: bp.entries.reduce((n, e) => n + (e.terms?.length ?? 0), 0),
      mediaAsset: bp.images.length,
      product: bp.products.length,
      productVariant: bp.products.reduce((n, p) => n + variantCount(p), 0),
      store: bp.store || bp.products.length ? 1 : 0,
      membership: 1,
    };
    for (const [k, v] of Object.entries(expected)) if (c[k] !== v) fail(`${bp.key}: ${k} is ${c[k]}, expected ${v}`);
    if (c.postRevision < c.post) fail(`${bp.key}: some posts have no revision`);
    const unpublished = await prisma.post.count({ where: { siteId: site.id, publishedRevisionId: null } });
    if (unpublished) fail(`${bp.key}: ${unpublished} posts aren't published`);
    if (site.status !== "DRAFT") fail(`${bp.key}: new site isn't a draft`);
  }
  step(`All 30 templates were created through the form in ${seconds}s; each site has exactly the pages, entries, field values, media, products and variants in its manifest`);

  // ── 5. Live render matches the preview ──────────────────────────────────────
  let pageCount = 0;
  for (const bp of blueprints) {
    const site = sites[bp.key];
    const paths = [...bp.pages.map((p) => (p.slug === "home" ? "" : `/${p.slug}`)), ...(bp.products.length ? [`/products/${bp.products[0].slug}`] : [])];
    for (const p of paths) {
      const liveRes = await designer.request.get(`${BASE}/sites/${site.subdomain}${p}`);
      const previewRes = await designer.request.get(`${BASE}/admin/sites/new/preview/${bp.key}${p}`);
      if (liveRes.status() !== 200 || previewRes.status() !== 200) fail(`${bp.key}${p || "/"}: live ${liveRes.status()}, preview ${previewRes.status()}`);
      const live = signature(await liveRes.text());
      const preview = signature(await previewRes.text());
      if (!live.nodes.length) fail(`${bp.key}${p || "/"}: no builder nodes rendered`);
      if (live.nodes.join() !== preview.nodes.join()) {
        const i = live.nodes.findIndex((n, j) => n !== preview.nodes[j]);
        fail(`${bp.key}${p || "/"}: node tree differs at #${i}: live ${live.nodes[i]} vs preview ${preview.nodes[i]}`);
      }
      if (live.text !== preview.text) {
        let i = 0;
        while (i < live.text.length && live.text[i] === preview.text[i]) i++;
        fail(`${bp.key}${p || "/"}: text differs: live “…${live.text.slice(Math.max(0, i - 60), i + 60)}…” vs preview “…${preview.text.slice(Math.max(0, i - 60), i + 60)}…”`);
      }
      pageCount++;
    }
  }
  await designer.goto(`${BASE}/sites/e2e-fine-dining/menu`);
  await designer.screenshot({ path: path.join(SHOTS, "templates-03-live-menu.png"), fullPage: true });
  step(`${pageCount} live pages across the 30 sites render the same node tree and text as their template previews`);

  // ── 6. Tenant isolation ─────────────────────────────────────────────────────
  for (const s of existing) {
    const now = await siteCounts(s.id);
    if (JSON.stringify(now) !== JSON.stringify(before[s.id])) fail(`Existing site ${s.subdomain} changed: ${JSON.stringify(before[s.id])} → ${JSON.stringify(now)}`);
  }
  const newIds = Object.values(sites).map((s) => s.id);
  const memberships = await prisma.membership.findMany({ where: { siteId: { in: newIds } }, include: { role: true } });
  if (memberships.length !== 30 || memberships.some((m) => m.userId !== designerUser.id || m.role.key !== "designer")) fail("New sites have memberships other than their creator as Designer");
  if ((await prisma.membership.count({ where: { userId: designerUser.id } })) !== membershipsBefore + 30) fail("The creator gained memberships outside the new sites");
  // Every child row's parent belongs to the same site as the row itself.
  const cross = await Promise.all(
    newIds.map(async (id) => {
      const other = { siteId: { not: id } };
      return [
        await prisma.post.count({ where: { siteId: id, postType: other } }),
        await prisma.postRevision.count({ where: { siteId: id, post: other } }),
        await prisma.fieldValue.count({ where: { siteId: id, OR: [{ post: other }, { field: other }] } }),
        await prisma.customField.count({ where: { siteId: id, group: other } }),
        await prisma.term.count({ where: { siteId: id, taxonomy: other } }),
        await prisma.productVariant.count({ where: { siteId: id, product: other } }),
        await prisma.mediaAsset.count({ where: { siteId: id, NOT: { storageKey: { startsWith: id } } } }),
      ].reduce((a, b) => a + b, 0);
    }),
  );
  if (cross.some((n) => n)) fail(`${cross.reduce((a, b) => a + b, 0)} rows in new sites point at another tenant's rows or files`);
  step(`Tenant isolation holds: ${existing.length} existing sites are unchanged, the creator is Designer on the 30 new sites only, and no row points across tenants`);

  console.log("\nStarter templates passed.");
} catch (err) {
  for (const [name, p] of [["designer", designer], ["client", client]]) {
    if (p) await p.screenshot({ path: path.join(SHOTS, `templates-failure-${name}.png`), fullPage: true }).catch(() => {});
  }
  console.error(err);
  process.exitCode = 1;
} finally {
  await browser.close();
  await prisma.$disconnect();
}
