// End-to-end: the master catalog widgets.
// A designer finds every catalog category in the palette, drops each of the
// 26 catalog additions onto the home page, configures a few, and publishes.
// On the live site every widget renders, and the no-JavaScript behaviours
// work: Read more expands, the project grid filters by category, an alert
// closes, the hero carousel gets its controls and the code snippet copies.
//
//   npm run e2e:catalog   (against a seeded production server)

import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SHOTS = process.env.SCREENSHOT_DIR ?? "e2e-screenshots";

const NEW = [
  "anchor", "linkinbio", "rectangle", "ellipse", "polygon", "star", "line",
  "textpath", "readmore", "detaillist", "tags", "buttongroup",
  "soundcloud", "herocarousel", "herobanner", "imagebanner",
  "projectgrid", "imagebox", "iconlist", "profilecard", "alert", "shortcode", "codesnippet",
];
const CONTAINERS = ["frame", "sidebar", "grid"];
const GROUPS = ["layout", "shapes", "basic", "media", "cards", "interactive", "code"];

const browser = await chromium.launch();
const step = (msg) => console.log(`✓ ${msg}`);

const page = await browser.newPage({ viewport: { width: 1680, height: 1050 } });
const inspector = page.getByRole("complementary", { name: "Inspector" });
const selected = () => page.evaluate(() => document.querySelector('[data-selected="true"]')?.getAttribute("data-node-id"));
const ids = {};
const add = async (key) => {
  await page.locator(`[data-palette="${key}"]`).click();
  const id = await selected();
  if (!id) throw new Error(`${key} wasn't inserted`);
  ids[key] = id;
  return id;
};
const tab = (name) => inspector.getByRole("tab", { name }).click();

try {
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', "designer@studio.test");
  await page.fill('input[name="password"]', "demo-password-2026");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin/);
  await page.getByRole("link", { name: /Aurelia Interiors/ }).click();
  await page.getByRole("link", { name: "Edit visually" }).first().click();
  await page.waitForSelector("text=Design mode");

  for (const g of GROUPS) await page.locator(`[data-palette-group="${g}"]`).waitFor();
  for (const key of [...NEW, ...CONTAINERS]) await page.locator(`[data-palette="${key}"]`).waitFor();
  step("Palette shows the 7 catalog categories and all 26 new widgets");

  await add("preset:boxed");
  for (const key of NEW) await add(key);
  // Containers go after the code snippet, not inside one another.
  for (const key of CONTAINERS) {
    await page.locator(`[data-node-id="${ids.codesnippet}"]`).click({ position: { x: 4, y: 4 } });
    await add(key);
  }
  if ((await page.locator(`[data-node-id="${ids.grid}"] > [data-w="container"]`).count()) !== 3) throw new Error("Grid didn't arrive with three cells");
  for (const key of [...NEW, ...CONTAINERS]) if (!(await page.locator(`[data-node-id="${ids[key]}"][data-w="${key}"]`).count())) throw new Error(`${key} isn't on the canvas`);
  step("Designer drops every catalog widget on the canvas");

  // Configure a few through the inspector's Settings tab.
  await page.locator(`[data-node-id="${ids.alert}"]`).click({ position: { x: 4, y: 4 } });
  await tab("settings");
  await inspector.getByLabel("Type").selectOption("success");
  await inspector.getByLabel("Can be closed").check();
  await page.locator(`[data-node-id="${ids.polygon}"]`).click({ position: { x: 10, y: 10 } });
  await tab("settings");
  await inspector.getByLabel("Sides").fill("3");
  await inspector.getByLabel("Sides").press("Tab");
  await page.locator(`[data-node-id="${ids.anchor}"]`).evaluate((el) => el.click());
  await tab("settings");
  await inspector.getByLabel("Anchor name").fill("Our Work");
  await inspector.getByLabel("Anchor name").press("Tab");
  await page.waitForSelector(`[data-node-id="${ids.anchor}"] [data-anchor-badge]:text("#our-work")`);
  const points = await page.locator(`[data-node-id="${ids.polygon}"] polygon`).getAttribute("points");
  if (points?.split(" ").length !== 3) throw new Error(`Polygon has points ${points}`);
  await page.locator(`[data-node-id="${ids.herobanner}"]`).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/catalog-designer.png` });
  step("Settings change the alert tone, polygon sides and anchor name live on the canvas");

  await page.getByRole("button", { name: "Publish" }).click();
  await page.waitForSelector("text=Published. Your changes are live.");

  const live = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await live.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
  await live.goto(`${BASE}/sites/aurelia`);
  for (const key of [...NEW, ...CONTAINERS]) if (!(await live.locator(`.n-${ids[key]}[data-w="${key}"]`).count())) throw new Error(`${key} isn't on the live page`);
  if (!(await live.locator("#our-work").count())) throw new Error("Anchor id missing on the live page");
  step("Every catalog widget renders on the live site");

  const rm = live.locator(`.n-${ids.readmore}`);
  const before = await rm.locator("[data-rm-text]").evaluate((el) => el.clientHeight);
  await rm.locator("[data-rm-more]").click();
  const after = await rm.locator("[data-rm-text]").evaluate((el) => el.clientHeight);
  if (!(after > before)) throw new Error(`Read more didn't expand (${before} → ${after})`);
  if (!(await rm.locator("[data-rm-less]").isVisible())) throw new Error("Show less isn't offered");
  step("Read more expands and offers Show less");

  const pg = live.locator(`.n-${ids.projectgrid}`);
  await pg.locator('label:has-text("Print")').click();
  const shown = await pg.locator("[data-pg-item]:visible").count();
  if (shown !== 1) throw new Error(`Print filter shows ${shown} projects`);
  await pg.locator('label:has-text("All")').click();
  if ((await pg.locator("[data-pg-item]:visible").count()) !== 6) throw new Error("All doesn't bring the projects back");
  step("Project grid filters by category");

  const alert = live.locator(`.n-${ids.alert}`);
  if ((await alert.getAttribute("data-tone")) !== "success") throw new Error("Alert tone wasn't saved");
  await alert.locator("[data-alert-close]").click();
  if (await alert.isVisible()) throw new Error("Alert didn't close");
  step("Alert closes");

  const hc = live.locator(`.n-${ids.herocarousel}`);
  await hc.locator("[data-next]").waitFor({ state: "visible" });
  await hc.locator("[data-next]").click();
  await live.waitForFunction((cls) => document.querySelector(`.${cls} [data-dot][aria-current="true"]`) === document.querySelectorAll(`.${cls} [data-dot]`)[1], `n-${ids.herocarousel}`);
  step("Hero carousel gets arrows and dots from the enhancer and moves on");

  const cs = live.locator(`.n-${ids.codesnippet}`);
  await cs.locator("[data-copy]").click();
  await cs.locator('[data-copy-label]:text("Copied")').waitFor();
  const copied = await live.evaluate(() => navigator.clipboard.readText());
  if (!copied.startsWith("const greet")) throw new Error(`Clipboard holds ${copied}`);
  step("Code snippet copies its code");

  await live.locator(`.n-${ids.herobanner}`).scrollIntoViewIfNeeded();
  await live.screenshot({ path: `${SHOTS}/catalog-live.png` });
  await live.locator(`.n-${ids.linkinbio}`).scrollIntoViewIfNeeded();
  await live.screenshot({ path: `${SHOTS}/catalog-live-2.png` });
  await live.locator(`.n-${ids.projectgrid}`).scrollIntoViewIfNeeded();
  await live.screenshot({ path: `${SHOTS}/catalog-live-3.png` });
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await phone.goto(`${BASE}/sites/aurelia`);
  await phone.locator(`.n-${ids.herobanner}`).scrollIntoViewIfNeeded();
  await phone.screenshot({ path: `${SHOTS}/catalog-mobile.png` });
  step("Screenshots saved");
} catch (e) {
  await page.screenshot({ path: `${SHOTS}/catalog-failure.png` }).catch(() => {});
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser.close();
}
