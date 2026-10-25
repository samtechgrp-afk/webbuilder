// End-to-end 404 handling:
//   1. Missing pages, entries and sites answer a real HTTP 404 (not 200),
//      on the platform path and on a site's own host, with the default 404
//      template in the site's style. Live pages still answer 200.
//   2. Draft and trashed content is a 404 for visitors, while a signed-in
//      Client Admin can preview it with ?preview=1.
//   3. A Designer picks a designed page as the site's 404 page in Site
//      settings; missing URLs then render it, still with status 404, and the
//      page is not served at its own address.
//
// Usage: npm run db:seed && npm run build && npm start   (in another shell)
//        npm run e2e:404
import { mkdir } from "node:fs/promises";
import http from "node:http";
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

async function get(p, init = {}) {
  if (init.host) return getOnHost(p, init.host);
  const res = await fetch(`${BASE}${p}`, { redirect: "manual", ...init });
  return { status: res.status, html: await res.text() };
}

// fetch() won't override Host, so requests "on a site's own domain" use node:http.
function getOnHost(p, host) {
  const { hostname, port } = new URL(BASE);
  return new Promise((resolve, reject) => {
    http
      .get({ hostname, port, path: p, headers: { host } }, (res) => {
        let html = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (html += c));
        res.on("end", () => resolve({ status: res.statusCode, html }));
      })
      .on("error", reject);
  });
}

async function expectStatus(p, status, opts = {}) {
  const r = await get(p, opts.init);
  if (r.status !== status) fail(`${p} answered ${r.status}, expected ${status}`);
  if (opts.contains && !r.html.includes(opts.contains)) fail(`${p} is missing "${opts.contains}"`);
  if (opts.lacks && r.html.includes(opts.lacks)) fail(`${p} unexpectedly contains "${opts.lacks}"`);
  return r;
}

async function login(email) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "demo-password-2026");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin/);
  return page;
}

let page;
try {
  // ── 1. True 404s ─────────────────────────────────────────────────────────
  await expectStatus("/sites/aurelia", 200, { contains: "Rooms that feel" });
  await expectStatus("/sites/aurelia/shop", 200);
  await expectStatus("/sites/aurelia/shop/alabaster-table-lamp", 200, { contains: "Alabaster Table Lamp" });
  step("Live page, archive and entry answer 200");

  await expectStatus("/sites/aurelia/this-page-does-not-exist", 404, { contains: "find that page", lacks: "Rooms that feel" });
  await expectStatus("/sites/aurelia/shop/no-such-lamp", 404, { contains: "find that page" });
  await expectStatus("/sites/aurelia/a/b/c", 404);
  await expectStatus("/sites/no-such-site", 404, { contains: "There is no site at this address" });
  await expectStatus("/sites/aurelia/%E0%A4%A", 404);
  await expectStatus("/site-404/aurelia", 404);
  step("Missing pages, entries, nested paths, unknown sites and malformed URLs answer 404 with the default template");

  await expectStatus("/missing-on-own-host", 404, { init: { host: "aurelia.localhost:3000" }, contains: "find that page" });
  await expectStatus("/", 200, { init: { host: "aurelia.localhost:3000" }, contains: "Rooms that feel" });
  step("The same holds on the site's own host");

  const res = await fetch(`${BASE}/sites/aurelia/nope`, { headers: { "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" } });
  if (res.status !== 404) fail(`Googlebot got ${res.status}`);
  if (!/noindex/.test(await res.text())) fail("404 page is missing noindex");
  step("Search engine crawlers get a 404 with noindex");

  // ── 2. Drafts and trash ──────────────────────────────────────────────────
  await expectStatus("/sites/aurelia/journal/warm-up-a-north-facing-room", 404, { lacks: "North light is soft" });
  await expectStatus("/sites/aurelia/journal/warm-up-a-north-facing-room?preview=1", 404, { lacks: "North light is soft" });
  step("A post awaiting review is a 404 for visitors, even with ?preview=1");

  const sofa = await prisma.post.findFirstOrThrow({ where: { slug: "linen-lounge-sofa" } });
  await prisma.post.update({ where: { id: sofa.id }, data: { status: "TRASHED", trashedAt: new Date() } });
  await expectStatus("/sites/aurelia/shop/linen-lounge-sofa", 404, { lacks: "Belgian linen" });
  step("Trashed entries answer 404");

  page = await login("client@aurelia.test");
  const preview = await page.goto(`${BASE}/sites/aurelia/journal/warm-up-a-north-facing-room?preview=1`);
  if (preview.status() !== 200) fail(`Preview answered ${preview.status()}`);
  await page.locator("[data-preview-banner]").waitFor();
  await page.getByText("North light is soft").waitFor();
  await page.screenshot({ path: path.join(SHOTS, "404-draft-preview.png") });
  const signedInMiss = await page.goto(`${BASE}/sites/aurelia/journal/warm-up-a-north-facing-room`);
  if (signedInMiss.status() !== 404) fail(`Signed-in visit without ?preview answered ${signedInMiss.status()}`);
  step("A signed-in Client Admin previews the draft with ?preview=1; without it, the public 404 stands");

  // ── 3. Custom 404 page ───────────────────────────────────────────────────
  await expectStatus("/sites/aurelia/page-not-found", 200, { contains: "This room doesn" });
  const designer = await login("designer@studio.test");
  await designer.getByRole("link", { name: /Aurelia Interiors/ }).click();
  await designer.waitForURL(/\/admin\/sites\/[^/]+$/);
  await designer.goto(`${designer.url()}/settings`, { waitUntil: "networkidle" });
  await designer.getByLabel("404 page").selectOption({ label: "Page not found (/page-not-found)" });
  await designer.locator("[data-save-identity]").click();
  await designer.getByText("Saved. The live site shows the new identity.").waitFor();

  await expectStatus("/sites/aurelia/still-missing", 404, { contains: "This room doesn", lacks: "find that page" });
  await expectStatus("/sites/aurelia/shop/still-no-lamp", 404, { contains: "This room doesn" });
  await expectStatus("/sites/aurelia/page-not-found", 404);
  await designer.goto(`${BASE}/sites/aurelia/still-missing`);
  await designer.screenshot({ path: path.join(SHOTS, "404-custom.png") });
  step("The designed 404 page renders for missing URLs with status 404, and is not served at its own address");

  await expectStatus("/sites/northwind/nope", 404, { contains: "find that page", lacks: "This room doesn" });
  step("Other tenants keep their own (default) 404 page");

  console.log("\n404 handling passed.");
} catch (err) {
  if (page) await page.screenshot({ path: path.join(SHOTS, "404-failure.png"), fullPage: true }).catch(() => {});
  console.error(err);
  process.exitCode = 1;
} finally {
  await browser.close();
  await prisma.$disconnect();
}
