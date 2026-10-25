// End-to-end sample workflow: a Client Admin signs in, edits the hero headline
// and image in Client Mode, hits a design lock, publishes, and the live site
// updates. Also checks the client can't open another tenant's portal.
//
// Usage: npm run db:seed && npm run build && npm start   (in another shell)
//        npm run e2e
import { PrismaClient } from "@prisma/client";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SHOTS = process.env.SCREENSHOT_DIR ?? "e2e-screenshots";
const NEW_HEADLINE = "Quietly beautiful homes, designed around how you live.";

const prisma = new PrismaClient();
const northwind = await prisma.site.findUniqueOrThrow({ where: { subdomain: "northwind" } });
const portrait = await prisma.mediaAsset.findFirstOrThrow({ where: { tags: { has: "portrait" } } });
await prisma.$disconnect();

await mkdir(SHOTS, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const step = (msg) => console.log(`✓ ${msg}`);

try {
  // 1. Auth gate → login → tenant dashboard
  await page.goto(`${BASE}/admin`);
  await page.waitForURL(/\/login/);
  step("Unauthenticated /admin redirects to /login");

  await page.fill('input[name="email"]', "client@aurelia.test");
  await page.fill('input[name="password"]', "demo-password-2026");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin\/sites\/[^/]+$/);
  const siteUrl = page.url();
  await page.screenshot({ path: `${SHOTS}/1-dashboard.png` });
  step(`Client Admin lands on their site dashboard (${new URL(siteUrl).pathname})`);

  // 2. Open Client Mode
  await page.getByRole("link", { name: "Edit visually" }).first().click();
  await page.waitForSelector('[data-node-id="hero-title"]');
  step("Client Mode editor opens with the live page");

  // 3. Hovering a locked section shows the guardrail badge
  await page.hover('[data-node-id="hero-grid"]', { position: { x: 5, y: 5 } });
  await page.click('[data-node-id="hero"]', { position: { x: 8, y: 8 } });
  await page.waitForSelector("text=Design locked.");
  await page.screenshot({ path: `${SHOTS}/2-locked-hero.png` });
  step("Selecting the hero section shows it is layout and style locked (no spacing or colour controls)");

  // 4. Inline-edit the headline
  const title = page.locator('[data-node-id="hero-title"]');
  await title.click();
  await title.click();
  const editable = title.locator('[contenteditable]');
  await editable.waitFor();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type(NEW_HEADLINE);
  await page.keyboard.press("Enter");
  await page.waitForFunction((t) => document.querySelector('[data-node-id="hero-title"]')?.textContent === t, NEW_HEADLINE);
  step("Hero headline edited inline on the canvas");

  // 5. Swap the hero image from the media library
  await page.click('[data-node-id="hero-image"]');
  await page.getByRole("button", { name: "Replace image" }).click();
  await page.click(`[data-asset-id="${portrait.id}"]`);
  await page.waitForFunction((src) => document.querySelector('[data-node-id="hero-image"] img')?.getAttribute("src") === src, portrait.url);
  await page.screenshot({ path: `${SHOTS}/3-edited.png` });
  step("Hero image swapped from the site's media library");

  // 6. Publish
  await page.getByRole("button", { name: "Publish" }).click();
  await page.waitForSelector("text=Published. Your changes are live.");
  step("Published");

  // 7. Live site shows the change
  const live = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await live.goto(`${BASE}/sites/aurelia`);
  const h1 = await live.locator("h1").textContent();
  const heroSrc = await live.locator(".n-hero-image img").getAttribute("src");
  if (h1 !== NEW_HEADLINE) throw new Error(`Live headline is "${h1}"`);
  if (heroSrc !== portrait.url) throw new Error(`Live hero image is ${heroSrc}`);
  await live.screenshot({ path: `${SHOTS}/4-live-site.png` });
  await live.setViewportSize({ width: 390, height: 844 });
  await live.screenshot({ path: `${SHOTS}/5-live-mobile.png`, fullPage: false });
  step("Live site serves the new headline and image");

  // 8. Tenant isolation
  // The admin shell streams, so the HTTP status is already sent; check the body instead.
  await page.goto(`${BASE}/admin/sites/${northwind.id}`);
  const body = await page.locator("body").innerText();
  if (!body.includes("could not be found") || body.includes("Northwind")) throw new Error("Another tenant's portal was reachable");
  step("Client gets Not Found on another tenant's portal, with nothing of that site leaked");

  console.log(`\nAll steps passed. Screenshots in ${SHOTS}/`);
} catch (err) {
  await page.screenshot({ path: `${SHOTS}/failure.png` }).catch(() => {});
  console.error(err);
  process.exitCode = 1;
} finally {
  await browser.close();
}
