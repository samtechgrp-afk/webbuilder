// End-to-end: Tilted grid hero.
// A designer drops the hero (it arrives with a headline and copy over gradient
// placeholders), uploads three images through the gallery manager, reorders
// them, adds alt text, saves and publishes. On the live site the band measures
// itself, fades in and curves the uploaded images round the cylinder on both
// desktop and phone widths.
//
//   npm run e2e:tilted-hero   (against a seeded server)

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import sharp from "sharp";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SHOTS = process.env.SCREENSHOT_DIR ?? "e2e-screenshots";

const browser = await chromium.launch();
const step = (msg) => console.log(`✓ ${msg}`);

// Three distinguishable JPGs to upload.
const dir = mkdtempSync(join(tmpdir(), "tgh-"));
const files = [];
for (const [i, [a, b]] of [["#ff7e5f", "#feb47b"], ["#8e2de2", "#4a00e0"], ["#11998e", "#38ef7d"]].entries()) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="1600" height="900" fill="url(#g)"/><text x="80" y="820" font-size="120" font-family="sans-serif" fill="#fff">Frame ${i + 1}</text></svg>`;
  const file = join(dir, `frame-${i + 1}.jpg`);
  await sharp(Buffer.from(svg)).jpeg().toFile(file);
  files.push(file);
}

const page = await browser.newPage({ viewport: { width: 1680, height: 1050 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const inspector = page.getByRole("complementary", { name: "Inspector" });

try {
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', "designer@studio.test");
  await page.fill('input[name="password"]', "demo-password-2026");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin/);
  await page.getByRole("link", { name: /Aurelia Interiors/ }).click();
  await page.getByRole("link", { name: "Edit visually" }).first().click();
  await page.waitForSelector("text=Design mode");
  await page.locator("body").press("Escape");

  await page.locator('[data-palette="tilted-grid-hero"]').click();
  const id = await page.evaluate(() => document.querySelector('[data-selected="true"]')?.getAttribute("data-node-id"));
  if (!id) throw new Error("Tilted grid hero wasn't inserted");
  const hero = page.locator(`[data-node-id="${id}"]`);
  await hero.locator("h1", { hasText: "Every frame, brought into focus." }).waitFor();
  await page.waitForFunction((nid) => getComputedStyle(document.querySelector(`[data-node-id="${nid}"] [data-tgh] > [aria-hidden]`)).opacity === "1", id);
  if (!(await hero.locator('img[src^="data:image/svg+xml"]').count())) throw new Error("Placeholders missing on an empty hero");
  step("Hero drops in with a headline, copy and a moving band of gradient placeholders");

  await inspector.getByRole("button", { name: "Add images" }).click();
  const modal = page.getByRole("dialog", { name: "Manage gallery" });
  await modal.locator("[data-gallery-upload]").setInputFiles(files);
  await modal.locator("[data-gallery-item='2']").waitFor({ timeout: 60000 });
  await modal.getByLabel("Alt text for image 1").fill("Orange frame");
  await modal.getByRole("button", { name: "Move image 1 later" }).click();
  if ((await modal.getByLabel("Alt text for image 2").inputValue()) !== "Orange frame") throw new Error("Reorder didn't move the image");
  await page.screenshot({ path: `${SHOTS}/tilted-hero-gallery.png` });
  await modal.getByRole("button", { name: "Save gallery" }).click();
  await inspector.getByRole("button", { name: "Manage 3 images" }).waitFor();
  await page.waitForFunction((nid) => [...document.querySelectorAll(`[data-node-id="${nid}"] [data-tgh] img`)].some((i) => !i.src.startsWith("data:")), id);
  step("Gallery manager uploads three images to the media library, reorders them and saves alt text");

  await page.getByRole("button", { name: "Publish" }).click();
  await page.waitForSelector("text=Published. Your changes are live.");

  for (const [name, viewport] of [["desktop", { width: 1440, height: 900 }], ["mobile", { width: 390, height: 844 }]]) {
    const live = await browser.newPage({ viewport });
    live.on("pageerror", (e) => errors.push(e.message));
    await live.goto(`${BASE}/sites/aurelia/`);
    const band = live.locator('[data-w="tilted-grid-hero"] [data-tgh] > [aria-hidden]');
    await band.scrollIntoViewIfNeeded();
    await live.waitForFunction(() => getComputedStyle(document.querySelector('[data-w="tilted-grid-hero"] [data-tgh] > [aria-hidden]')).opacity === "1");
    const srcs = await band.locator("img").evaluateAll((imgs) => [...new Set(imgs.map((i) => new URL(i.src).pathname))]);
    if (!srcs.length || srcs.some((s) => !s.includes("/uploads/"))) throw new Error(`Live band shows unexpected images: ${srcs.join(", ")}`);
    await live.waitForTimeout(1200);
    await live.locator('[data-w="tilted-grid-hero"]').screenshot({ path: `${SHOTS}/tilted-hero-live-${name}.png` });
    await live.close();
  }
  step("Live site measures the band, fades it in and curves the uploaded images on desktop and phone");

  if (errors.length) throw new Error(`Page errors: ${errors.join(" | ")}`);
  console.log("\nTilted grid hero workflow passed.");
} catch (e) {
  console.error(`✗ ${e.message}`);
  await page.screenshot({ path: `${SHOTS}/tilted-hero-failure.png` }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
