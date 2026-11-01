// End-to-end widget library: a Designer finds widgets in the categorised,
// searchable palette, drops a boxed container with a gradient heading, rich
// text, a wave divider, a YouTube video, an icon box, a map, a spacer and an
// outline button with an icon, then the interactive widgets (accordion, tabs,
// carousel, pricing, countdown, counter and more), configures them, publishes,
// and the live site renders each one and its interactions work. Then a Client
// edits the rich text but gets no Settings tab.
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

  // Interactive widgets, dropped into a fresh boxed container.
  await page.locator("body").press("Escape");
  await add("preset:boxed");
  const accordion = await add("accordion");
  const tabs = await add("tabs");
  const carousel = await add("carousel");
  const pricing = await add("pricing");
  await tab("content");
  const features = inspector.locator('[data-items-editor]');
  const before = await features.locator("[data-item-row]").count();
  await features.locator("[data-add-item]").click();
  await features.locator("[data-item-row]").last().getByRole("textbox").first().fill("Priority support");
  await features.locator("[data-item-row]").last().getByRole("textbox").first().press("Tab");
  if ((await features.locator("[data-item-row]").count()) !== before + 1) throw new Error("Adding a pricing feature didn't add a row");
  const countdown = await add("countdown");
  await tab("content");
  await inspector.getByLabel("Counts down to").fill("2031-06-01T09:00");
  await inspector.getByLabel("Counts down to").press("Tab");
  const counter = await add("counter");
  await add("testimonial");
  await add("cta");
  await add("flipbox");
  await add("progress");
  for (const [sel, what] of [
    [`[data-node-id="${accordion}"] details[open]`, "accordion panels"],
    [`[data-node-id="${tabs}"] input[type=radio]`, "tabs"],
    [`[data-node-id="${carousel}"] [data-slide]`, "carousel slides"],
    [`[data-node-id="${pricing}"] li:has-text("Priority support")`, "new pricing feature"],
    [`[data-node-id="${countdown}"][data-target="2031-06-01T09:00"]`, "countdown target"],
  ]) if (!(await page.locator(sel).count())) throw new Error(`Canvas is missing the ${what}`);
  step("Designer adds accordion, tabs, carousel, pricing (with a new feature row), countdown, counter, testimonial, CTA, flip box and progress bar");

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
  await live.locator(`.n-${box}`).scrollIntoViewIfNeeded();
  await live.screenshot({ path: `${SHOTS}/widgets-live.png` });
  await live.setViewportSize({ width: 390, height: 844 });
  await live.locator(`.n-${box}`).scrollIntoViewIfNeeded();
  await live.screenshot({ path: `${SHOTS}/widgets-live-mobile.png` });
  step("Live site renders every widget, with the outline variant applied");

  // Interactive behaviour on the live site.
  const acc = live.locator(`.n-${accordion} details`);
  await acc.nth(1).locator("summary").click();
  if (!(await acc.nth(1).evaluate((d) => d.open)) || (await acc.nth(0).evaluate((d) => d.open))) throw new Error("Accordion didn't switch to the second panel exclusively");
  const tabEl = live.locator(`.n-${tabs}`);
  await tabEl.locator("[data-tab] label").nth(1).click();
  const visible = await tabEl.locator("[data-tab-panel]").evaluateAll((ps) => ps.map((p) => getComputedStyle(p).display !== "none"));
  if (JSON.stringify(visible) !== "[false,true,false]") throw new Error(`Tabs show panels ${visible}`);
  await live.locator(`.n-${carousel}[data-ready]`).waitFor();
  const track = live.locator(`.n-${carousel} [data-track]`);
  await live.locator(`.n-${carousel} [data-next]`).click();
  await live.waitForFunction((el) => el.scrollLeft > 0, await track.elementHandle());
  await live.locator(`.n-${countdown}[data-ready]`).waitFor();
  const days = Number(await live.locator(`.n-${countdown} [data-cd-unit="d"] [data-cd-num]`).textContent());
  if (!(days > 365)) throw new Error(`Countdown shows ${days} days`);
  await live.locator(`.n-${counter}`).scrollIntoViewIfNeeded();
  await live.waitForTimeout(2600);
  const count = await live.locator(`.n-${counter} [data-count]`).textContent();
  if (!/\d/.test(count ?? "")) throw new Error(`Counter shows "${count}"`);
  await live.locator(`.n-${pricing}`).scrollIntoViewIfNeeded();
  await live.screenshot({ path: `${SHOTS}/widgets-interactive-live.png` });
  step("Live accordion, tabs, carousel arrows, countdown and counter all work");

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
