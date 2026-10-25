// End-to-end designer workflow: a Designer drags a new widget onto the page,
// reorders sections in Layers, edits spacing and a mobile-only font size,
// duplicates and deletes, publishes, and the live site reflects every change.
// Then checks a Client Admin gets no design tools.
//
// Usage: npm run db:seed && npm run build && npm start   (in another shell)
//        npm run e2e:designer
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SHOTS = process.env.SCREENSHOT_DIR ?? "e2e-screenshots";
await mkdir(SHOTS, { recursive: true });

const browser = await chromium.launch();
const step = (msg) => console.log(`✓ ${msg}`);
const kids = (page, id) =>
  page.evaluate((id) => Array.from(document.querySelectorAll(`[data-node-id="${id}"] > [data-node-id]`)).map((e) => e.dataset.nodeId), id);

async function login(page, email) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "demo-password-2026");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin/);
}

const page = await browser.newPage({ viewport: { width: 1680, height: 1050 } });
try {
  await login(page, "designer@studio.test");
  await page.getByRole("link", { name: /Aurelia Interiors/ }).click();
  await page.getByRole("link", { name: "Edit visually" }).first().click();
  await page.waitForSelector('[data-node-id="hero-title"]');
  await page.waitForSelector("text=Design mode");
  step("Designer opens the page in Design mode with the widget palette");

  // 1. Drag a Heading from the palette to just after the hero intro.
  const before = await kids(page, "hero-text");
  const copy = page.locator('[data-node-id="hero-copy"]');
  const box = await copy.boundingBox();
  await page.locator('[data-palette="heading"]').dragTo(copy, { targetPosition: { x: box.width / 2, y: box.height - 4 } });
  const after = await kids(page, "hero-text");
  if (after.length !== before.length + 1 || after.indexOf("hero-copy") + 1 !== after.findIndex((id) => !before.includes(id))) {
    throw new Error(`Heading not inserted after the intro: ${after.join(",")}`);
  }
  const newId = after.find((id) => !before.includes(id));
  step("Heading dragged from the palette lands right after the hero intro");

  // 2. Edit its text inline.
  const h = page.locator(`[data-node-id="${newId}"]`);
  await h.click();
  await h.click();
  await h.locator("[contenteditable]").waitFor();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("Booked through 2027");
  await page.keyboard.press("Enter");
  step("New heading edited inline");

  // 3. Reorder service cards in Layers: drag the third card above the first.
  await page.getByRole("tab", { name: "Layers" }).click();
  const target = page.locator('[data-layer="svc-1"]');
  const tb = await target.boundingBox();
  await page.locator('[data-layer="svc-3"]').dragTo(target, { targetPosition: { x: 40, y: 2 } });
  const order = await kids(page, "svc-grid");
  if (order.join() !== "svc-3,svc-1,svc-2") throw new Error(`Layers reorder failed: ${order}`);
  void tb;
  step("Service cards reordered by dragging in Layers");

  // 4. Hero spacing on desktop.
  await page.locator('[data-layer="hero"]').click();
  await page.getByRole("tab", { name: "style" }).click();
  await page.getByLabel("Padding top").fill("1.5rem");
  await page.getByLabel("Padding top").press("Enter");
  step("Hero top padding set from the style panel");

  // 5. Mobile-only font size for the headline.
  await page.getByRole("button", { name: "Mobile" }).click();
  await page.locator('[data-layer="hero-title"]').click();
  await page.getByRole("tab", { name: "style" }).click();
  await page.locator('input[data-style="fontSize"]').fill("2.25rem");
  await page.locator('input[data-style="fontSize"]').press("Enter");
  await page.waitForSelector("text=· from Desktop", { state: "attached" });
  await page.screenshot({ path: `${SHOTS}/designer-mobile.png` });
  await page.getByRole("button", { name: "Desktop" }).click();
  step("Headline font size overridden for mobile only");

  // 6. Duplicate then delete a testimonial with the keyboard.
  await page.locator('[data-layer="q-1"]').click();
  const q0 = (await kids(page, "quotes-grid")).length;
  await page.locator("body").press("ControlOrMeta+d");
  if ((await kids(page, "quotes-grid")).length !== q0 + 1) throw new Error("Duplicate failed");
  await page.locator("body").press("Delete");
  if ((await kids(page, "quotes-grid")).length !== q0) throw new Error("Delete failed");
  step("Duplicate (Ctrl/⌘ D) and Delete work on the selection");

  await page.locator(`[data-node-id="${newId}"]`).click();
  await page.screenshot({ path: `${SHOTS}/designer-desktop.png` });

  // 7. Publish and check the live site.
  await page.getByRole("button", { name: "Publish" }).click();
  await page.waitForSelector("text=Published. Your changes are live.");
  const live = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await live.goto(`${BASE}/sites/aurelia`);
  const liveHeadings = await live.locator(".n-hero-text h2").allTextContents();
  if (!liveHeadings.includes("Booked through 2027")) throw new Error(`Live hero headings: ${liveHeadings}`);
  const liveOrder = await live.evaluate(() => Array.from(document.querySelectorAll(".n-svc-grid > article")).map((e) => e.className));
  if (!liveOrder[0].includes("n-svc-3")) throw new Error(`Live service order: ${liveOrder}`);
  const css = await live.evaluate(() => document.querySelector(".site-root style").textContent);
  if (!/@container site \(max-width:767px\)\{[^@]*\.n-hero-title\{font-size:2\.25rem\}/.test(css)) throw new Error("Mobile font rule missing");
  if (!css.includes("padding:1.5rem")) throw new Error("Hero padding missing");
  step("Live site shows the new heading, the new card order, the padding and the mobile font rule");

  // 8. A client gets no design tools.
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const client = await ctx.newPage();
  await login(client, "client@aurelia.test");
  await client.getByRole("link", { name: "Edit visually" }).first().click();
  await client.waitForSelector('[data-node-id="hero-title"]');
  if (await client.locator('[data-palette="heading"]').count()) throw new Error("Client sees the widget palette");
  if (await client.locator('[data-node-id="hero"][draggable="true"]').count()) throw new Error("Client can drag sections");
  step("Client Admin sees Client mode only: no palette, nothing draggable");

  console.log(`\nAll steps passed. Screenshots in ${SHOTS}/`);
} catch (err) {
  await page.screenshot({ path: `${SHOTS}/designer-failure.png` }).catch(() => {});
  console.error(err);
  process.exitCode = 1;
} finally {
  await browser.close();
}
