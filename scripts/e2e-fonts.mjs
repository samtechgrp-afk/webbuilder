// End-to-end: custom font manager.
// A designer opens the font manager from a heading's Typography panel,
// uploads two .ttf weights of one family (family and weights are read from
// the files) and links a Google Fonts stylesheet. The new family appears in
// the inspector's Font picker; picking it restyles the heading on the canvas
// with the uploaded file. After publishing, the live site embeds the
// @font-face and @import rules, serves the font file with CORS headers and
// renders the heading in the custom font. Finally the family is removed.
//
//   npm run e2e:fonts   (against a seeded server)
//   FONT_DIR=/path/with/ttfs to use other fonts (needs Family-Regular.ttf + Family-Bold.ttf)

import { copyFileSync, existsSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SHOTS = process.env.SCREENSHOT_DIR ?? "e2e-screenshots";
const GOOGLE = "https://fonts.googleapis.com/css2?family=Lobster&display=swap";

// Two weights of one family. Defaults to Playwright's own icon font when no OFL text fonts are around.
const dir = mkdtempSync(join(tmpdir(), "fonts-"));
const fontDir = process.env.FONT_DIR ?? "/mnt/skills/examples/canvas-design/canvas-fonts";
let files;
let family;
if (existsSync(join(fontDir, "BigShoulders-Regular.ttf"))) {
  files = ["BigShoulders-Regular.ttf", "BigShoulders-Bold.ttf"].map((f) => {
    copyFileSync(join(fontDir, f), join(dir, f));
    return join(dir, f);
  });
  family = "Big Shoulders";
} else {
  const base = join(process.cwd(), "node_modules/playwright-core/lib/vite/traceViewer");
  const codicon = readdirSync(base).find((f) => f.endsWith(".ttf"));
  files = ["Codicon-Regular.ttf", "Codicon-Bold.ttf"].map((f) => {
    copyFileSync(join(base, codicon), join(dir, f));
    return join(dir, f);
  });
  family = "codicon";
}

const browser = await chromium.launch();
const step = (msg) => console.log(`✓ ${msg}`);
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

  await page.locator('[data-palette="heading"]').click();
  const id = await page.evaluate(() => document.querySelector('[data-selected="true"]')?.getAttribute("data-node-id"));
  if (!id) throw new Error("Heading wasn't inserted");
  await inspector.getByRole("tab", { name: "style" }).click();
  await inspector.locator("[data-open-font-manager]").click();
  const modal = page.getByRole("dialog", { name: "Fonts" });
  await modal.getByText("No custom fonts yet").waitFor();
  step("Typography panel opens the font manager");

  await modal.locator("[data-font-upload]").setInputFiles(files);
  const row = modal.locator(`[data-font-family="${family}"]`);
  await row.waitFor({ timeout: 60000 });
  await row.getByText("Uploaded · 400 · 700").waitFor();
  step(`Two .ttf files upload to storage and group under "${family}" with weights read from the files`);

  await modal.locator("[data-font-link-url]").fill(GOOGLE);
  await modal.getByText("Adds Lobster.").waitFor();
  await modal.locator("[data-font-link-add]").click();
  await modal.locator('[data-font-family="Lobster"]').getByText("Google Fonts").waitFor();
  step("A Google Fonts link adds the Lobster family it names");
  await page.screenshot({ path: `${SHOTS}/font-manager.png` });
  await modal.getByRole("button", { name: "Close" }).click();

  const select = inspector.locator("[data-font-select]");
  const labels = await select.locator("optgroup[label='Custom fonts'] option").allTextContents();
  if (!labels.includes(family) || !labels.includes("Lobster")) throw new Error(`Font picker lists ${labels.join(", ")}`);
  await select.selectOption({ label: family });
  const heading = page.locator(`[data-node-id="${id}"]`);
  await page.waitForFunction(([nid, fam]) => getComputedStyle(document.querySelector(`[data-node-id="${nid}"]`)).fontFamily.includes(fam), [id, family]);
  const loaded = await page.evaluate(async (fam) => {
    await document.fonts.load(`700 32px "${fam}"`);
    return document.fonts.check(`700 32px "${fam}"`) && [...document.fonts].some((f) => f.family.replace(/"/g, "") === fam && f.status === "loaded");
  }, family);
  if (!loaded) throw new Error("The uploaded font didn't load on the canvas");
  await heading.screenshot({ path: `${SHOTS}/font-canvas-heading.png` });
  step("The inspector's Font picker lists both families; picking one restyles the heading on the canvas from the uploaded file");

  await page.locator('[data-node-id="hero-title"]').click();
  await inspector.getByRole("tab", { name: "style" }).click();
  await inspector.locator("[data-font-select]").selectOption({ label: family });
  await page.getByRole("button", { name: "Publish" }).click();
  await page.waitForSelector("text=Published. Your changes are live.");

  const live = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  live.on("pageerror", (e) => errors.push(e.message));
  await live.goto(`${BASE}/sites/aurelia/`);
  const css = await live.evaluate(() => [...document.querySelectorAll(".site-root > style")].map((s) => s.textContent).join("\n"));
  if (!css.startsWith(`@import url("${GOOGLE}");`)) throw new Error("Live stylesheet doesn't start with the Google Fonts import");
  const src = css.match(new RegExp(`font-family:"${family}";src:url\\("(/uploads/[^"]+)"\\) format\\("truetype"\\);font-weight:700`))?.[1];
  if (!src) throw new Error("Live stylesheet has no @font-face for the bold upload");
  const res = await live.request.get(`${BASE}${src}`);
  if (res.status() !== 200 || res.headers()["content-type"] !== "font/ttf" || res.headers()["access-control-allow-origin"] !== "*") {
    throw new Error(`Font file answered ${res.status()} ${res.headers()["content-type"]} ACAO=${res.headers()["access-control-allow-origin"]}`);
  }
  await live.waitForFunction((fam) => getComputedStyle(document.querySelector('.n-hero-title')).fontFamily.includes(fam), family);
  const liveLoaded = await live.evaluate(async (fam) => (await document.fonts.load(`700 32px "${fam}"`)).length > 0, family);
  if (!liveLoaded) throw new Error("The font didn't load on the live site");
  await live.locator('.n-hero-title').screenshot({ path: `${SHOTS}/font-live-heading.png` });
  await live.close();
  step("Live site embeds @import + @font-face, serves the file as font/ttf with CORS, and renders the headline in it");

  // Publishing reloads the editor, so select the headline again.
  await page.locator('[data-node-id="hero-title"]').click();
  await inspector.getByRole("tab", { name: "style" }).click();
  await inspector.locator("[data-open-font-manager]").click();
  page.once("dialog", (d) => d.accept());
  await modal.getByRole("button", { name: `Remove ${family}` }).click();
  await row.waitFor({ state: "detached" });
  const after = await page.request.get(`${BASE}${src}`);
  if (after.status() !== 404) throw new Error(`Removed font file still answers ${after.status()}`);
  step("Removing the family deletes its files from storage");

  if (errors.length) throw new Error(`Page errors: ${errors.join(" | ")}`);
  console.log("\nCustom font workflow passed.");
} catch (e) {
  console.error(`✗ ${e.message}`);
  await page.screenshot({ path: `${SHOTS}/fonts-failure.png` }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
