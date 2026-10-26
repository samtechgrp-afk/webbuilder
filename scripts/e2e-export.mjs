// End-to-end static export:
//   1. A Designer exports the site for a hosting address; the job runs in
//      the background with live progress and produces a zip.
//   2. The zip holds every live page, entry and archive as HTML (no drafts,
//      no runtime scripts, no platform paths), the 404 page, sitemap.xml and
//      robots.txt for the hosting address, content.json, and every CSS,
//      font and media file the pages reference.
//   3. Served by a plain static file server, the bundle renders like the
//      live site (styles, fonts, images, navigation) without ever calling
//      the platform.
//   4. Client Admins can't see the screen, download a bundle, or start an
//      export (the replayed action is refused). Deleting removes the file.
//
// Usage: npm run db:seed && npm run build && npm start   (in another shell)
//        npm run e2e:export
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { unzipSync } from "fflate";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SHOTS = process.env.SCREENSHOT_DIR ?? "e2e-screenshots";
const HOST_URL = "https://www.aurelia-interiors.com";
await mkdir(SHOTS, { recursive: true });

const prisma = new PrismaClient();
const browser = await chromium.launch();
const step = (msg) => console.log(`✓ ${msg}`);
const fail = (msg) => {
  throw new Error(msg);
};

async function login(email) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const page = await context.newPage();
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "demo-password-2026");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin/);
  return page;
}

/** A plain static file server: directory index.html, 404.html for misses. */
function serve(root) {
  const types = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".webp": "image/webp", ".woff2": "font/woff2", ".xml": "application/xml", ".txt": "text/plain", ".json": "application/json", ".ico": "image/x-icon", ".svg": "image/svg+xml" };
  const server = http.createServer(async (req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let file = path.join(root, p);
    if (!file.startsWith(root)) return res.writeHead(400).end();
    if (existsSync(file) && (await stat(file)).isDirectory()) file = path.join(file, "index.html");
    if (!existsSync(file)) {
      res.writeHead(404, { "content-type": types[".html"] });
      return res.end(await readFile(path.join(root, "404.html")));
    }
    res.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream" });
    res.end(await readFile(file));
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

const site = await prisma.site.findUniqueOrThrow({ where: { subdomain: "aurelia" } });
const siteBase = `/admin/sites/${site.id}`;
let designer;
let client;
let server;
const dir = await mkdtemp(path.join(os.tmpdir(), "site-export-"));
try {
  // ── 1. Run an export ─────────────────────────────────────────────────────
  designer = await login("designer@studio.test");
  await designer.goto(`${BASE}${siteBase}`);
  await designer.getByRole("link", { name: "Export", exact: true }).click();
  await designer.waitForURL(/\/export$/);
  await designer.getByLabel("Hosting address").fill(HOST_URL);
  const startReq = designer.waitForRequest((r) => r.method() === "POST" && !!r.headers()["next-action"]);
  await designer.locator("[data-start-export]").click();
  const actionReq = await startReq;
  await designer.locator('[data-export="running"], [data-export="queued"], [data-export="done"]').first().waitFor();
  await designer.locator('[data-export="done"]').waitFor({ timeout: 120_000 });
  await designer.screenshot({ path: path.join(SHOTS, "export-done.png"), fullPage: true });
  const job = await prisma.siteExport.findFirstOrThrow({ where: { siteId: site.id }, orderBy: { createdAt: "desc" } });
  if (job.status !== "DONE" || job.pageCount < 8) fail(`Export finished as ${job.status} with ${job.pageCount} pages`);
  step(`Designer's export ran in the background: ${job.pageCount} pages, ${(job.sizeBytes / 1024).toFixed(0)} KB`);

  const [download] = await Promise.all([designer.waitForEvent("download"), designer.locator("[data-download-export]").first().click()]);
  const zipPath = path.join(dir, "site.zip");
  await download.saveAs(zipPath);
  const files = unzipSync(new Uint8Array(await readFile(zipPath)));
  const text = (name) => (files[name] ? new TextDecoder().decode(files[name]) : fail(`Bundle is missing ${name}`));

  // ── 2. Bundle contents ───────────────────────────────────────────────────
  for (const f of ["index.html", "shop/index.html", "journal/index.html", "shop/alabaster-table-lamp/index.html", "journal/choosing-a-white-paint/index.html", "404.html", "sitemap.xml", "robots.txt", "data/content.json", "README.txt"]) text(f);
  if (Object.keys(files).some((f) => f.includes("warm-up-a-north-facing-room"))) fail("An entry awaiting review was exported");
  const htmlFiles = Object.keys(files).filter((f) => f.endsWith(".html"));
  for (const f of htmlFiles) {
    const html = text(f);
    if (/<script\b(?![^>]*application\/ld\+json)/.test(html)) fail(`${f} still has runtime scripts`);
    if (html.includes("/sites/aurelia") || html.includes("localhost") || html.includes("/_next/")) fail(`${f} still points at the platform`);
    for (const m of html.matchAll(/(?:href|src)="(\/(?:assets|uploads)\/[^"?#]+)"/g)) if (!files[m[1].slice(1)]) fail(`${f} references ${m[1]}, which isn't in the bundle`);
  }
  const home = text("index.html");
  if (!home.includes("Rooms that feel")) fail("Home page content missing");
  if (!home.includes(`<link rel="canonical" href="${HOST_URL}/"/>`)) fail("Canonical doesn't point at the hosting address");
  const css = Object.keys(files).filter((f) => f.endsWith(".css"));
  if (!css.length || !Object.keys(files).some((f) => f.endsWith(".woff2"))) fail("Stylesheets or fonts missing");
  for (const f of css) for (const m of text(f).matchAll(/url\((\/assets\/[^)?#]+)/g)) if (!files[m[1].slice(1)]) fail(`${f} references missing ${m[1]}`);
  if (!text("sitemap.xml").includes(`<loc>${HOST_URL}/shop/alabaster-table-lamp</loc>`)) fail("Sitemap doesn't use the hosting address");
  if (!text("robots.txt").includes(`Sitemap: ${HOST_URL}/sitemap.xml`)) fail("robots.txt doesn't point at the sitemap");
  const content = JSON.parse(text("data/content.json"));
  if (!content.entries.some((e) => e.title === "Alabaster Table Lamp" && e.path === "/shop/alabaster-table-lamp")) fail("content.json is missing entries");
  step(`Bundle has ${htmlFiles.length} HTML files, no scripts or platform paths, every referenced asset, sitemap, robots and content.json`);

  // ── 3. Serve it as a plain static site ───────────────────────────────────
  const out = path.join(dir, "site");
  for (const [name, data] of Object.entries(files)) {
    const target = path.join(out, name);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, data);
  }
  server = await serve(out);
  const staticBase = `http://127.0.0.1:${server.address().port}`;
  const visitor = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const platformCalls = [];
  visitor.on("request", (r) => {
    if (!r.url().startsWith(staticBase) && !r.url().startsWith("data:")) platformCalls.push(r.url());
  });
  await visitor.goto(`${staticBase}/`, { waitUntil: "networkidle" });
  await visitor.getByText("Rooms that feel").first().waitFor();
  const bg = await visitor.evaluate(() => getComputedStyle(document.querySelector(".site-root")).backgroundColor);
  if (bg !== "rgb(251, 248, 243)") fail(`Static home background is ${bg}`);
  const imgs = await visitor.evaluate(() => [...document.images].filter((i) => i.complete && i.naturalWidth > 0).length);
  if (imgs < 2) fail("Images didn't load on the static site");
  const fontOk = await visitor.evaluate(() => document.fonts.check('16px "Fraunces"') || [...document.fonts].some((f) => /Fraunces/i.test(f.family) && f.status === "loaded"));
  if (!fontOk) fail("Display font didn't load from the bundle");
  await visitor.screenshot({ path: path.join(SHOTS, "export-static-home.png") });
  await visitor.goto(`${staticBase}/shop/alabaster-table-lamp/`, { waitUntil: "networkidle" });
  await visitor.getByText("Alabaster Table Lamp").first().waitFor();
  const missing = await visitor.goto(`${staticBase}/no-such-page`);
  if (missing.status() !== 404) fail(`Static miss answered ${missing.status()}`);
  await visitor.getByText(/find that page|This room doesn/).first().waitFor();
  if (platformCalls.length) fail(`The static site called out to: ${[...new Set(platformCalls)].slice(0, 3).join(", ")}`);
  step("Served by a plain static server, the bundle renders with its styles, fonts, images and 404 page, calling nothing else");

  // ── 4. Client lockout and delete ─────────────────────────────────────────
  client = await login("client@aurelia.test");
  await client.goto(`${BASE}${siteBase}`);
  if (await client.getByRole("link", { name: "Export", exact: true }).count()) fail("Client Admin sees the Export link");
  await client.goto(`${BASE}${siteBase}/export`);
  await client.getByText("This page could not be found.").waitFor();
  const dl = await client.request.get(`${BASE}/api/sites/${site.id}/exports/${job.id}`);
  if (dl.status() !== 404) fail(`Client download answered ${dl.status()}`);
  const anon = await fetch(`${BASE}/api/sites/${site.id}/exports/${job.id}`);
  if (anon.status !== 404) fail(`Signed-out download answered ${anon.status}`);
  const replay = await client.request.post(actionReq.url(), {
    headers: { "next-action": actionReq.headers()["next-action"], "content-type": actionReq.headers()["content-type"], accept: "text/x-component", origin: new URL(BASE).origin },
    data: actionReq.postData(),
  });
  if (!/permission/i.test(await replay.text())) fail("Client's replayed export wasn't refused");
  if ((await prisma.siteExport.count({ where: { siteId: site.id } })) !== 1) fail("A client's replay created an export");
  step("Client Admins get no Export link or page, can't download (404) and can't start an export");

  const file = path.join(process.cwd(), "storage", "exports", site.id, job.fileKey);
  if (!existsSync(file)) fail("Export file isn't in private storage");
  await designer.locator('[data-export="done"]').getByRole("button", { name: "Delete" }).click();
  await designer.getByText("No exports yet.").waitFor();
  if (existsSync(file)) fail("Deleting the export left its file behind");
  step("Deleting an export removes its zip from storage");

  console.log("\nStatic export passed.");
} catch (err) {
  for (const [name, p] of [["designer", designer], ["client", client]]) {
    if (p) await p.screenshot({ path: path.join(SHOTS, `export-failure-${name}.png`), fullPage: true }).catch(() => {});
  }
  console.error(err);
  process.exitCode = 1;
} finally {
  server?.close();
  await rm(dir, { recursive: true, force: true });
  await browser.close();
  await prisma.$disconnect();
}
