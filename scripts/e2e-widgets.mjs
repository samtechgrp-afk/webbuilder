// End-to-end widget library: a Designer finds widgets in the categorised,
// searchable palette, drops a boxed container with a gradient heading, rich
// text, a wave divider, a YouTube video, an icon box, a map, a spacer and an
// outline button with an icon, configures them in the Settings tab, publishes,
// and the live site renders each one. Then a Client edits the rich text but
// gets no Settings tab.
//
// Usage: npm run db:seed && npm run build && npm start   (in another shell)
//        npm run e2e:widgets
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SHOTS = process.env.SCREENSHOT_DIR ?? "e2e-screenshots";
await mkdir(SHOTS, { recursive: true });

const browser = await chromium.launch();
const step = (msg) => console.log(`✓ ${msg}`);

async function login(page, email) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "demo-password-2026");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin/);
}

const page = await browser.newPage({ viewport: { width: 1680, height: 1050 } });
const inspector = page.getByRole("complementary", { name: "Inspector" });
const selected = () => page.evaluate(() => document.querySelector('[data-selected="true"]')?.getAttribute("data-node-id"));
const add = async (key) => {
  await page.locator(`[data-palette="${key}"]`).click();
  const id = await selected();
  if (!id) throw new Error(`${key} wasn't inserted`);
  return id;
};
const tab = (name) => inspector.getByRole("tab", { name }).click();

try {
  await login(page, "designer@studio.test");
  await page.getByRole("link", { name: /Aurelia Interiors/ }).click();
  await page.getByRole("link", { name: "Edit visually" }).first().click();
  await page.waitForSelector("text=Design mode");

  // Palette: grouped by category, searchable.
  for (const group of ["layout", "basic", "interactive", "dynamic", "commerce"]) await page.locator(`[data-palette-group="${group}"]`).waitFor();
  const search = page.getByLabel("Search widgets");
  await search.fill("wave");
  if ((await page.locator("[data-palette]").count()) !== 1 || !(await page.locator('[data-palette="divider"]').count())) throw new Error("Search for 'wave' should find only the divider");
  await search.fill("zzz");
  await page.waitForSelector("text=No widget matches");
  await search.fill("");
  step("Palette is grouped into categories and search finds widgets by keyword");

  // A boxed container at the end of the page holds the new widgets.
  await page.locator("body").press("Escape");
  const box = await add("preset:boxed");
  const heading = await add("heading");
  await tab("settings");
  await inspector.getByLabel("Gradient text").check();
  const prose = await add("prose");
  const divider = await add("divider");
  await tab("settings");
  await inspector.getByLabel("Shape").selectOption("wave");
  await inspector.getByLabel("Flip horizontally").check();
  const video = await add("video");
  await tab("content");
  await inspector.getByLabel("Video address").fill("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  await inspector.getByLabel("Video address").press("Tab");
  const iconbox = await add("iconbox");
  await tab("content");
  await inspector.getByLabel("Choose Icon").click();
  await inspector.getByLabel("Search icons").fill("gem");
  await inspector.locator('[data-icon-option="gem"]').click();
  const map = await add("map");
  await add("spacer");
  const button = await add("button");
  await tab("settings");
  await inspector.getByLabel("Variant").selectOption("outline");
  await inspector.getByLabel("Choose Icon").click();
  await inspector.locator('[data-icon-option="arrow-right"]').click();
  await page.waitForFunction((id) => document.querySelector(`[data-node-id="${id}"] svg[data-icon="arrow-right"]`), button);
  const row = await add("preset:row-2");
  const rowKids = await page.evaluate((id) => document.querySelectorAll(`[data-node-id="${id}"] > [data-node-id]`).length, row);
  if (rowKids !== 2) throw new Error(`Row preset has ${rowKids} columns`);
  step("Designer adds and configures heading, rich text, divider, video, icon box, map, spacer, button and a two-column row");

  // The canvas renders them with the live renderer.
  const canvasChecks = [
    [`[data-node-id="${heading}"][data-gradient]`, "gradient heading"],
    [`[data-node-id="${divider}"] svg path`, "wave divider"],
    [`[data-node-id="${video}"] iframe[src^="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"]`, "YouTube embed"],
    [`[data-node-id="${iconbox}"] svg[data-icon="gem"]`, "icon box icon"],
    [`[data-node-id="${map}"] iframe[src*="maps.google.com"]`, "map"],
  ];
  for (const [sel, what] of canvasChecks) if (!(await page.locator(sel).count())) throw new Error(`Canvas is missing the ${what}`);
  await page.locator(`[data-node-id="${box}"]`).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/widgets-designer.png` });
  step("Canvas previews every widget");

  await page.getByRole("button", { name: "Publish" }).click();
  await page.waitForSelector("text=Published. Your changes are live.");
  const live = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await live.goto(`${BASE}/sites/aurelia`);
  const html = await live.content();
  const liveChecks = [
    [/data-gradient=""/, "gradient heading"],
    [/<strong>memorable<\/strong>/, "rich text"],
    [/role="separator" data-shape="wave"/, "wave divider"],
    [/youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/, "video"],
    [/data-icon="gem"/, "icon box"],
    [/maps\.google\.com\/maps\?q=Eiffel/, "map"],
    [/data-w="spacer"/, "spacer"],
    [/Learn more<svg[^>]*data-icon="arrow-right"/, "button icon"],
  ];
  for (const [re, what] of liveChecks) if (!re.test(html)) throw new Error(`Live page is missing the ${what}`);
  const border = await live.locator(`.n-${button}`).evaluate((el) => getComputedStyle(el).borderTopStyle);
  if (border !== "solid") throw new Error(`Outline button border is ${border}`);
  if (/WidgetEnhancer|data-lightbox/.test(html)) throw new Error("The enhancer shipped without a lightbox on the page");
  await live.locator(`.n-${box}`).scrollIntoViewIfNeeded();
  await live.screenshot({ path: `${SHOTS}/widgets-live.png` });
  await live.setViewportSize({ width: 390, height: 844 });
  await live.locator(`.n-${box}`).scrollIntoViewIfNeeded();
  await live.screenshot({ path: `${SHOTS}/widgets-live-mobile.png` });
  step("Live site renders every widget, with the outline variant applied");

  // A client edits the rich text but never sees designer settings. The designer
  // leaves through the toolbar first, which releases the page's edit lock.
  await page.locator("header").getByRole("link", { name: "← Aurelia Interiors" }).click();
  await page.waitForURL((u) => !u.pathname.endsWith("/edit"));
  await page.waitForTimeout(1500);
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const client = await ctx.newPage();
  await login(client, "client@aurelia.test");
  await client.getByRole("link", { name: "Edit visually" }).first().click();
  await client.locator(`[data-node-id="${prose}"]`).click();
  await client.locator("[data-html-editor] [contenteditable]").waitFor();
  if (await client.getByRole("tab", { name: "settings" }).count()) throw new Error("Client sees the Settings tab");
  await client.locator(`[data-node-id="${video}"]`).click();
  if (!(await client.getByLabel("Video address").count())) throw new Error("Client can't change the video");
  step("Client edits rich text and video content, with no Settings tab");

  console.log(`\nWidget library passed. Screenshots in ${SHOTS}/`);
} catch (err) {
  await page.screenshot({ path: `${SHOTS}/widgets-failure.png` }).catch(() => {});
  console.error(err);
  process.exitCode = 1;
} finally {
  await browser.close();
}
