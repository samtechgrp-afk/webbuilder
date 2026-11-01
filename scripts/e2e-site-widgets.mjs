// End-to-end: site, navigation, social and media widgets.
// A designer adds a navigation menu, breadcrumbs, a search bar, share
// buttons, an audio player and an embed, then publishes. On the live site the
// menu turns into a drawer on a phone (opens, closes with Esc and on a link),
// search finds a published post, share links carry the page address and the
// embed runs in a sandboxed frame.
//
//   npm run e2e:site-widgets   (against a seeded dev server)

import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SHOTS = process.env.SCREENSHOT_DIR ?? "e2e-screenshots";

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

  for (const key of ["nav", "breadcrumbs", "search", "social", "audio", "embed", "preset:site-logo", "preset:site-title", "preset:post-grid"]) await page.locator(`[data-palette="${key}"]`).waitFor();
  step("Palette offers menu, breadcrumbs, search, social links, audio, embed and the site / post building blocks");

  await page.locator("body").press("Escape");
  await add("preset:boxed");
  const nav = await add("nav");
  await tab("settings");
  await inspector.getByLabel("Hamburger menu").selectOption("mobile");
  const crumbs = await add("breadcrumbs");
  const search = await add("search");
  const social = await add("social");
  await tab("settings");
  await inspector.getByLabel("Buttons").selectOption("share");
  await inspector.getByLabel("Share on").selectOption("minimal");
  const audio = await add("audio");
  const embed = await add("embed");
  await tab("settings");
  const code = inspector.getByLabel("Code");
  await code.fill('<p id="hello">Hello from the embed</p><script>document.getElementById("hello").textContent = "Script ran: " + (function(){ try { return document.cookie === "" && !window.parent.document ? "no" : "leak"; } catch (e) { return "sealed"; } })();</script>');
  await code.press("Tab");
  await page.waitForFunction((id) => document.querySelector(`[data-node-id="${id}"] iframe[sandbox]`), embed);

  for (const [sel, what] of [
    [`[data-node-id="${nav}"] [data-nav-list] [data-nav-sub] a`, "menu dropdown"],
    [`[data-node-id="${crumbs}"] [aria-current="page"]`, "sample breadcrumbs"],
    [`[data-node-id="${search}"] input[name="q"]`, "search box"],
    [`[data-node-id="${social}"] a[data-network="x"]`, "share buttons"],
    [`[data-node-id="${audio}"][data-empty]`, "audio placeholder"],
  ]) if (!(await page.locator(sel).count())) throw new Error(`Canvas is missing the ${what}`);
  await page.locator(`[data-node-id="${nav}"]`).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/site-widgets-designer.png` });
  step("Designer adds and configures the menu, breadcrumbs, search, share buttons, audio player and embed");

  await page.getByRole("button", { name: "Publish" }).click();
  await page.waitForSelector("text=Published. Your changes are live.");

  // Desktop: links in a row, no hamburger.
  const live = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await live.goto(`${BASE}/sites/aurelia`);
  const menu = live.locator(`.n-${nav}`);
  if (!(await menu.locator('[data-nav-list] > li > a:text-is("About")').isVisible())) throw new Error("Desktop menu links aren't visible");
  if (await menu.locator("[data-nav-button]").isVisible()) throw new Error("Desktop shows the hamburger");
  const home = await menu.locator('a:text-is("Home")').getAttribute("aria-current");
  if (home !== "page") throw new Error("Home isn't marked as the current page");
  step("Desktop menu shows its links in a row with the current page marked");

  // Share links carry this page's address.
  const shareHref = await live.locator(`.n-${social} a[data-network="x"]`).getAttribute("href");
  if (!/^https:\/\/x\.com\/intent\/post\?url=http%3A%2F%2F[^&]+%2Fsites%2Faurelia%2F&text=/.test(shareHref ?? "")) throw new Error(`Share link is ${shareHref}`);
  if (await live.locator(`.n-${audio}`).count()) throw new Error("An audio player without a file is shown live");
  step("Share buttons link to this page; an audio player without a file stays hidden");

  // The embed runs, sealed off from the site.
  const frame = live.frameLocator(`.n-${embed} iframe`);
  const said = await frame.locator("#hello").textContent();
  if (said !== "Script ran: sealed") throw new Error(`Embed says "${said}"`);
  step("Embed code runs in a sandboxed frame that can't reach the site");

  // Phone: the menu becomes a drawer.
  await live.setViewportSize({ width: 390, height: 844 });
  const button = menu.locator("[data-nav-button]");
  // The (invisible) checkbox sits on top of the icon and takes the tap.
  const tap = menu.locator("[data-nav-toggle]");
  await menu.scrollIntoViewIfNeeded();
  await live.waitForTimeout(400);
  if (!(await button.isVisible())) throw new Error("No hamburger on a phone");
  const list = menu.locator("[data-nav-list]");
  const onScreen = () => list.evaluate((el) => { const r = el.getBoundingClientRect(); return r.right > 0 && r.left < innerWidth && getComputedStyle(el).visibility !== "hidden"; });
  if (await onScreen()) throw new Error("Drawer is open before tapping the button");
  await tap.click();
  await live.waitForFunction(() => document.documentElement.style.overflow === "hidden" || document.body.style.overflow === "hidden");
  await live.waitForTimeout(400);
  if (!(await onScreen())) throw new Error("Drawer didn't open");
  if ((await menu.locator("[data-nav-toggle]").getAttribute("aria-expanded")) !== "true") throw new Error("Toggle doesn't report aria-expanded");
  await live.screenshot({ path: `${SHOTS}/site-widgets-drawer.png` });
  await live.keyboard.press("Escape");
  await live.waitForTimeout(400);
  if (await onScreen()) throw new Error("Esc didn't close the drawer");
  await tap.click();
  await live.waitForTimeout(400);
  await list.locator('a:text-is("About")').click();
  await live.waitForURL(/\/sites\/aurelia\/about$/);
  step("On a phone the menu is a drawer: opens from the button, closes with Esc, follows links");

  // Search.
  await live.setViewportSize({ width: 1440, height: 1000 });
  await live.goto(`${BASE}/sites/aurelia`);
  await live.locator(`.n-${search} input[name="q"]`).fill("white paint");
  await live.locator(`.n-${search} input[name="q"]`).press("Enter");
  await live.waitForURL(/\/sites\/aurelia\/search\?q=white\+paint/);
  const result = live.locator('[data-results] a:has-text("How we choose a white paint")');
  await result.waitFor();
  const robots = await live.locator('meta[name="robots"]').getAttribute("content");
  if (!/noindex/.test(robots ?? "")) throw new Error(`Search page robots: ${robots}`);
  await live.screenshot({ path: `${SHOTS}/site-widgets-search.png` });
  await live.goto(`${BASE}/sites/aurelia/search?q=zzzz-nothing`);
  await live.waitForSelector("text=Nothing matched");
  const status = (await live.goto(`${BASE}/sites/aurelia/search`))?.status();
  if (status !== 200) throw new Error(`Empty search page answered ${status}`);
  step("Site search finds a published post, says when nothing matches and isn't indexed");

  console.log(`\nSite widgets passed. Screenshots in ${SHOTS}/`);
} catch (err) {
  await page.screenshot({ path: `${SHOTS}/site-widgets-failure.png` }).catch(() => {});
  console.error(err);
  process.exitCode = 1;
} finally {
  await browser.close();
}
