// End-to-end SEO:
//   1. sitemap.xml and robots.txt per site, on the platform path and on the
//      site's own host: live pages, entries and archives only (no drafts or
//      entries awaiting review), absolute URLs.
//   2. Live pages carry the title, description, canonical, Open Graph,
//      Twitter card and JSON-LD.
//   3. A Designer sets site defaults (title template, description, X handle,
//      Google verification, sitemap post types) and live pages follow.
//   4. A Client Admin edits an entry's search title and hides it from search
//      engines; after publishing it gets noindex and leaves the sitemap. The
//      audit reflects it. The client can't save site defaults.
//   5. "Discourage search engines" closes robots.txt and empties the sitemap.
//
// Usage: npm run db:seed && npm run build && npm start   (in another shell)
//        npm run e2e:seo
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

async function get(p, host) {
  if (!host) {
    const res = await fetch(`${BASE}${p}`, { redirect: "manual" });
    return { status: res.status, body: await res.text(), type: res.headers.get("content-type") ?? "" };
  }
  // fetch() won't override Host, so requests on a site's own domain use node:http.
  const { hostname, port } = new URL(BASE);
  return new Promise((resolve, reject) => {
    http
      .get({ hostname, port, path: p, headers: { host } }, (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve({ status: res.statusCode, body, type: res.headers["content-type"] ?? "" }));
      })
      .on("error", reject);
  });
}

const has = (body, needle, what) => body.includes(needle) || fail(`${what}: missing ${needle}`);
const lacks = (body, needle, what) => !body.includes(needle) || fail(`${what}: unexpectedly contains ${needle}`);
const meta = (html, attr, name) => html.match(new RegExp(`<meta ${attr}="${name.replace(/[.:]/g, "\\$&")}" content="([^"]*)"`))?.[1];
const titleOf = (html) => html.match(/<title>([^<]*)<\/title>/)?.[1];

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

const site = await prisma.site.findUniqueOrThrow({ where: { subdomain: "aurelia" } });
const siteBase = `/admin/sites/${site.id}`;
const paint = await prisma.post.findFirstOrThrow({ where: { siteId: site.id, slug: "choosing-a-white-paint" } });

let designer;
let client;
try {
  // ── 1. sitemap.xml and robots.txt ────────────────────────────────────────
  const sm = await get("/sites/aurelia/sitemap.xml");
  if (sm.status !== 200 || !sm.type.includes("xml")) fail(`sitemap answered ${sm.status} ${sm.type}`);
  has(sm.body, "<loc>http://localhost:3000/sites/aurelia/</loc>", "sitemap");
  has(sm.body, "/sites/aurelia/shop/alabaster-table-lamp</loc>", "sitemap");
  has(sm.body, "/sites/aurelia/journal/choosing-a-white-paint</loc>", "sitemap");
  has(sm.body, "/sites/aurelia/shop</loc>", "sitemap (archive)");
  lacks(sm.body, "warm-up-a-north-facing-room", "sitemap (entry awaiting review)");
  lacks(sm.body, "northwind", "sitemap (other tenant)");
  const own = await get("/sitemap.xml", "aurelia.localhost:3000");
  has(own.body, "<loc>http://aurelia.localhost:3000/shop/alabaster-table-lamp</loc>", "sitemap on own host");
  const robots = await get("/robots.txt", "aurelia.localhost:3000");
  if (robots.status !== 200) fail(`robots.txt answered ${robots.status}`);
  has(robots.body, "Sitemap: http://aurelia.localhost:3000/sitemap.xml", "robots.txt");
  has(robots.body, "Disallow: /admin", "robots.txt");
  if ((await get("/sites/no-such-site/sitemap.xml")).status !== 404) fail("Unknown site's sitemap isn't a 404");
  step("Each site serves sitemap.xml (live content only, absolute URLs) and robots.txt, on its own host too");

  // ── 2. Live metadata ─────────────────────────────────────────────────────
  const lamp = (await get("/sites/aurelia/shop/alabaster-table-lamp")).body;
  if (titleOf(lamp) !== "Alabaster Table Lamp · Aurelia Interiors") fail(`Lamp title is ${titleOf(lamp)}`);
  has(lamp, '<link rel="canonical" href="http://localhost:3000/sites/aurelia/shop/alabaster-table-lamp"/>', "canonical");
  if (!/^http:\/\/localhost:3000\/uploads\/.+\.webp$/.test(meta(lamp, "property", "og:image") ?? "")) fail(`og:image is ${meta(lamp, "property", "og:image")}`);
  if (meta(lamp, "property", "og:type") !== "article") fail("Entry og:type isn't article");
  if (meta(lamp, "name", "twitter:card") !== "summary_large_image") fail("No large Twitter card");
  has(lamp, '"@type":"Article","headline":"Alabaster Table Lamp"', "JSON-LD");
  const home = (await get("/sites/aurelia")).body;
  has(home, '"@type":"WebSite","name":"Aurelia Interiors"', "home JSON-LD");
  step("Live pages carry title, description, canonical, Open Graph image, Twitter card and JSON-LD");

  // ── 3. Designer sets site defaults ───────────────────────────────────────
  designer = await login("designer@studio.test");
  await designer.goto(`${BASE}${siteBase}`);
  await designer.getByRole("link", { name: "SEO", exact: true }).click();
  await designer.waitForURL(/\/seo$/);
  await designer.locator("[data-seo-audit]").waitFor();
  await designer.locator('[data-seo-row="/"] [data-issue="description-missing"]').waitFor();
  await designer.getByLabel("Title template").fill("%s | Aurelia Interiors, Boston");
  await designer.getByLabel("Default description").fill("Interior architecture for calm, considered homes across New England, from first sketch to last cushion.");
  await designer.getByLabel("X (Twitter) handle").fill("aurelia_studio");
  await designer.getByLabel("Google verification code").fill("aurelia-gsc-123");
  await designer.locator("fieldset", { hasText: "In the sitemap" }).getByLabel("Shop", { exact: true }).uncheck();
  await designer.locator("[data-save-seo]").click();
  await designer.getByText("Saved. Live pages, the sitemap and robots.txt use the new defaults.").waitFor();
  await designer.screenshot({ path: path.join(SHOTS, "seo-settings.png"), fullPage: true });

  const paintHtml = (await get("/sites/aurelia/journal/choosing-a-white-paint")).body;
  if (titleOf(paintHtml) !== "How we choose a white paint | Aurelia Interiors, Boston") fail(`Template not applied: ${titleOf(paintHtml)}`);
  if (meta(paintHtml, "name", "twitter:site") !== "@aurelia_studio") fail("twitter:site missing");
  const homeAfter = (await get("/sites/aurelia")).body;
  if (meta(homeAfter, "name", "google-site-verification") !== "aurelia-gsc-123") fail("Google verification missing on home");
  const plain = (await get("/sites/aurelia/page-not-found")).body;
  if (!meta(plain, "name", "description")?.startsWith("Interior architecture for calm")) fail("Default description not used on a page without one");
  const lampAfter = (await get("/sites/aurelia/shop/alabaster-table-lamp")).body;
  if (!/<meta name="robots" content="noindex/.test(lampAfter)) fail("Excluded post type isn't noindex");
  const smAfter = (await get("/sites/aurelia/sitemap.xml")).body;
  lacks(smAfter, "/shop", "sitemap after excluding Shop");
  has(smAfter, "choosing-a-white-paint", "sitemap after excluding Shop");
  step("Designer's defaults (title template, description, X handle, verification, excluded post type) reach the live site");

  // ── 4. Client edits an entry's SEO ───────────────────────────────────────
  client = await login("client@aurelia.test");
  await client.goto(`${BASE}${siteBase}/seo`);
  await client.locator("[data-seo-audit]").waitFor();
  if (await client.locator("[data-save-seo]").count()) fail("Client Admin can edit site SEO defaults");
  await client.goto(`${BASE}${siteBase}/content/${paint.id}`, { waitUntil: "networkidle" });
  await client.getByLabel("SEO title").fill("How to choose a white paint that stays warm");
  await client.locator("[data-preview-title]").getByText("How to choose a white paint that stays warm").waitFor();
  await client.getByLabel("Meta description").fill("North light, south light and the undertones that matter: our studio's short guide to whites that never feel cold.");
  await client.getByRole("switch", { name: "Hide from search engines" }).click();
  await client.locator("[data-seo-preview]").getByText("Hidden from search engines").waitFor();
  await client.screenshot({ path: path.join(SHOTS, "seo-entry-preview.png"), fullPage: true });
  await client.locator('[data-save="publish"]').click();
  await client.getByText(/^Published\. Version \d+\./).waitFor();

  const paintLive = (await get("/sites/aurelia/journal/choosing-a-white-paint")).body;
  if (titleOf(paintLive) !== "How to choose a white paint that stays warm") fail(`Client's SEO title not live: ${titleOf(paintLive)}`);
  if (!/<meta name="robots" content="noindex/.test(paintLive)) fail("Hidden entry isn't noindex");
  lacks((await get("/sites/aurelia/sitemap.xml")).body, "choosing-a-white-paint", "sitemap after hiding the entry");
  await client.goto(`${BASE}${siteBase}/seo`);
  await client.locator('[data-seo-row="/journal/choosing-a-white-paint"] [data-issue="noindex"]').waitFor();
  step("Client's SEO title goes live; hiding the entry adds noindex, drops it from the sitemap and shows in the audit");

  // The server refuses a client's save of site defaults, even replayed by hand.
  const actionReq = designer.waitForRequest((r) => r.method() === "POST" && !!r.headers()["next-action"]);
  await designer.goto(`${BASE}${siteBase}/seo`);
  await designer.getByRole("switch", { name: "Discourage search engines" }).click();
  await designer.locator("[data-save-seo]").click();
  const req = await actionReq;
  await designer.getByText("Saved. Live pages, the sitemap and robots.txt use the new defaults.").waitFor();
  const [args] = JSON.parse(req.postData());
  const replay = await client.request.post(req.url(), {
    headers: { "next-action": req.headers()["next-action"], "content-type": req.headers()["content-type"], accept: "text/x-component", origin: new URL(BASE).origin },
    data: JSON.stringify([{ ...args, discourageIndexing: false, titleTemplate: "%s | hacked" }]),
  });
  if (!/permission/i.test(await replay.text())) fail("Client's replayed SEO save wasn't refused");
  step("A Client Admin's replayed save of site defaults is refused on the server");

  // ── 5. Discourage indexing ───────────────────────────────────────────────
  const closed = await get("/robots.txt", "aurelia.localhost:3000");
  if (closed.body !== "User-agent: *\nDisallow: /\n") fail(`robots.txt isn't closed: ${closed.body}`);
  if ((await get("/sites/aurelia/sitemap.xml")).body.includes("<url>")) fail("Sitemap isn't empty while discouraged");
  if (!/<meta name="robots" content="noindex/.test((await get("/sites/aurelia")).body)) fail("Home isn't noindex while discouraged");
  const nw = await get("/robots.txt", "northwind.localhost:3000");
  has(nw.body, "Sitemap:", "other tenant's robots.txt");
  step("Discouraging search engines closes robots.txt, empties the sitemap and noindexes pages (only for this site)");

  console.log("\nSEO passed.");
} catch (err) {
  for (const [name, p] of [["designer", designer], ["client", client]]) {
    if (p) await p.screenshot({ path: path.join(SHOTS, `seo-failure-${name}.png`), fullPage: true }).catch(() => {});
  }
  console.error(err);
  process.exitCode = 1;
} finally {
  await browser.close();
  await prisma.$disconnect();
}
