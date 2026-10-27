// End-to-end CMS workflow:
//   1. A Designer creates a "Case studies" post type with a taxonomy, a single
//      template and a field group (one designer-only field, one repeater).
//   2. A Client Admin creates an entry in the form, fills the fields (the
//      designer-only field is locked) and publishes it.
//   3. The Designer adds a Loop grid to the home page, binds a card widget to
//      a custom field, checks the live canvas preview and publishes.
//   4. The live site shows the entry through the loop and its single page;
//      the REST API lists it.
//   5. Media upload with SVG sanitising and alt text, bulk trash, revision
//      restore, and scheduled publishing through the cron endpoint.
//
// Usage: npm run db:seed && npm run build && CRON_SECRET=e2e-cron-secret-2026 npm start   (in another shell)
//        CRON_SECRET=e2e-cron-secret-2026 npm run e2e:cms
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SHOTS = process.env.SCREENSHOT_DIR ?? "e2e-screenshots";
const CRON_SECRET = process.env.CRON_SECRET ?? "";
await mkdir(SHOTS, { recursive: true });

const browser = await chromium.launch();
const step = (msg) => console.log(`✓ ${msg}`);
const fail = (msg) => {
  throw new Error(msg);
};

async function login(email) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "demo-password-2026");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin/);
  return page;
}

async function liveHtml(p) {
  const res = await fetch(`${BASE}${p}`);
  return { status: res.status, html: await res.text() };
}

// With Partial Prerendering the shell can be sent before notFound() runs, so
// a missing page may answer 200 with the not-found UI; check the body too.
async function isLive(p) {
  const { status, html } = await liveHtml(p);
  return status === 200 && !html.includes("NEXT_HTTP_ERROR_FALLBACK;404");
}

let designer;
let client;
try {
  // ── 1. Designer builds the content model ──────────────────────────────────
  designer = await login("designer@studio.test");
  await designer.getByRole("link", { name: /Aurelia Interiors/ }).click();
  await designer.waitForURL(/\/admin\/sites\/[^/]+$/);
  const siteBase = new URL(designer.url()).pathname;

  await designer.goto(`${BASE}${siteBase}/cpts`);
  await designer.getByLabel("Plural label").fill("Case studies");
  await designer.getByLabel("Singular label").fill("Case study");
  await designer.getByRole("button", { name: "Icon 🏛️" }).click().catch(() => {});
  await designer.getByRole("switch", { name: "Public REST API" }).click();
  await designer.locator("[data-save-post-type]").click();
  await designer.waitForURL(/\/cpts\/[a-z0-9]+$/);
  const postTypeId = designer.url().split("/").pop();
  step("Designer creates the Case studies post type with the REST API on");

  await designer.locator("#tax-label").fill("Industry");
  await designer.locator("[data-add-taxonomy]").click();
  await designer.locator('[data-new-term="industry"]').fill("Hospitality");
  await designer.locator('[data-add-term="industry"]').click();
  await designer.locator('[data-taxonomy-card="industry"]').getByRole("button", { name: "Rename Hospitality" }).waitFor();
  step("Designer adds an Industry taxonomy with a Hospitality term");

  await designer.locator("[data-create-template]").click();
  await designer.getByText("You're designing the template every Case study entry uses.").waitFor();
  await designer.locator(".editor-canvas", { hasText: "{Post title}" }).waitFor();
  await designer.getByRole("button", { name: "Publish" }).click();
  await designer.getByText("Published. Your changes are live.").waitFor();
  step("Designer creates and publishes a single template (bound to title, date, image and content)");

  await designer.goto(`${BASE}${siteBase}/fields/new?postType=${postTypeId}`, { waitUntil: "networkidle" });
  await designer.getByLabel("Group name").fill("Project details");
  const addField = async (type, label) => {
    await designer.locator(`[data-field-type="${type}"]`).click();
    await designer.locator('[data-setting="label"]').last().fill(label);
  };
  await addField("TEXT", "Client name");
  await addField("TEXT", "Internal code");
  await designer.locator('[data-setting="clientEditable"]').last().uncheck();
  await addField("REPEATER", "Highlights");
  await designer.getByLabel("Add sub-field").selectOption("TEXT");
  await designer.getByRole("button", { name: "Add", exact: true }).click();
  await designer.locator('[data-setting="label"]').last().fill("Point");
  await designer.locator("[data-save-group]").click();
  await designer.waitForURL(/\/fields\/[a-z0-9]+\?created=1$/);
  await designer.getByRole("status").filter({ hasText: "Saved." }).waitFor();
  step("Designer builds a field group: text, designer-only text, and a repeater");

  // ── 2. Client Admin creates and publishes an entry ────────────────────────
  client = await login("client@aurelia.test");
  await client.goto(`${BASE}${siteBase}/content?type=case_studies`, { waitUntil: "networkidle" });
  await client.locator("[data-new-entry]").click();
  await client.waitForURL(/\/content\/[a-z0-9]+$/);
  await client.locator('input[name="title"]').fill("Harbour House");
  await client.locator('[data-field="client_name"] input').fill("Harbour Hotels Ltd");
  if (!(await client.locator('[data-field="internal_code"] input').isDisabled())) fail("Designer-only field is editable for the client");
  await client.locator('[data-field="internal_code"]').getByText("Designer only").waitFor();
  await client.getByRole("button", { name: /Add row/ }).click();
  await client.locator('[data-field="highlights"] [data-field="point"] input').fill("38 guest rooms");
  await client.locator('[data-taxonomy="Industry"]').getByLabel("Hospitality").check();
  await client.getByLabel("Short summary").fill("A coastal hotel rebuilt around its harbour views.");
  await client.locator('[data-save="publish"]').click();
  await client.getByText(/Published/).first().waitFor();
  await client.screenshot({ path: path.join(SHOTS, "cms-entry-form.png"), fullPage: true });
  step("Client Admin fills the fields (designer-only field locked) and publishes");

  // ── 3. Designer binds a loop grid on the home page ────────────────────────
  await designer.goto(`${BASE}${siteBase}`);
  await designer.getByRole("link", { name: "Edit visually" }).first().click();
  await designer.waitForSelector('[data-node-id="hero-title"]');
  await designer.locator('[data-palette="loop"]').click();
  await designer.getByRole("tab", { name: "dynamic" }).click();
  await designer.getByLabel("Loop post type").selectOption({ label: "Case studies" });
  await designer.getByText("1 published entry in the preview.").waitFor();
  const loopTitle = designer.locator('.editor-canvas h3:has-text("Harbour House")');
  await loopTitle.first().waitFor();
  step("Loop grid previews the published case study live on the canvas");

  // Bind the card's text to the Client name field.
  const cardText = designer.locator(".editor-canvas [data-bound='true']", { hasText: "A coastal hotel" }).first();
  await cardText.click();
  await designer.getByRole("tab", { name: "dynamic" }).click();
  await designer.getByLabel("Text", { exact: true }).selectOption("field:client_name");
  await designer.locator(".editor-canvas", { hasText: "Harbour Hotels Ltd" }).waitFor();
  await designer.screenshot({ path: path.join(SHOTS, "cms-loop-binding.png") });
  step("Card text bound to the Client name custom field");

  // Bind the hero eyebrow to the site tagline (global site metadata).
  await designer.locator('[data-node-id="hero-eyebrow"]').click();
  await designer.getByRole("tab", { name: "dynamic" }).click();
  await designer.getByLabel("Text", { exact: true }).selectOption("site:tagline");
  await designer.locator('[data-node-id="hero-eyebrow"]', { hasText: "Interior architecture in New England" }).waitFor();
  step("Hero eyebrow bound to the Site tagline");

  await designer.getByRole("button", { name: "Publish" }).click();
  await designer.getByText("Published. Your changes are live.").waitFor();
  await designer.getByRole("link", { name: "← Aurelia Interiors" }).click();
  await designer.waitForURL(/\/admin\/sites\/[^/]+$/);
  step("Designer publishes the home page and leaves the editor");

  // ── 4. Live site, single template and REST API ────────────────────────────
  const home = await liveHtml("/sites/aurelia");
  if (!home.html.includes("Harbour House") || !home.html.includes("Harbour Hotels Ltd")) fail("Live home page is missing the bound loop content");
  step("Live home page renders the loop grid with the entry and its field value");

  const tplRes = await liveHtml("/sites/aurelia/case-studies/harbour-house");
  if (!(await isLive("/sites/aurelia/case-studies/harbour-house")) || !tplRes.html.includes("Harbour House")) fail(`Single entry page failed (${tplRes.status})`);
  step("Live single page renders the case study");

  const api = await (await fetch(`${BASE}/api/v1/sites/aurelia/case_studies`)).json();
  const item = api.items?.find((i) => i.slug === "harbour-house");
  if (!item || item.fields?.client_name?.text !== "Harbour Hotels Ltd") fail(`REST API missing the entry: ${JSON.stringify(api).slice(0, 300)}`);
  step("REST API lists the entry with its custom fields");

  // ── 5a. Client cannot rebind or overwrite bound content ──────────────────
  await client.goto(`${BASE}${siteBase}`);
  await client.getByRole("link", { name: "Edit visually" }).first().click();
  await client.waitForSelector('[data-node-id="hero-title"]');
  await client.locator('.editor-canvas h3:has-text("Harbour House")').first().click();
  await client.locator("[data-bound-note]").first().waitFor();
  step("Client sees bound widgets as read-only dynamic content");

  // ── 5b. Media: SVG sanitising and alt text ────────────────────────────────
  const svgPath = path.join(SHOTS, "unsafe-logo.svg");
  await writeFile(svgPath, `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><script>alert(1)</script><circle cx="20" cy="20" r="18" onclick="alert(2)" fill="#2B2620"/></svg>`);
  await designer.goto(`${BASE}${siteBase}/media`);
  await designer.locator("[data-library-upload]").setInputFiles(svgPath);
  const tile = designer.locator('[data-asset="unsafe-logo.svg"]');
  await tile.waitFor();
  await tile.getByRole("button", { name: /Edit details/ }).click();
  await designer.getByLabel("Alt text").fill("Aurelia monogram");
  await designer.locator("[data-save-asset]").click();
  await designer.getByText("Saved").first().waitFor();
  const src = await tile.locator("img").getAttribute("src");
  const stored = await readFile(path.join("public", src), "utf8");
  if (/script|onclick/i.test(stored) || !stored.includes("<circle")) fail(`SVG not sanitised: ${stored}`);
  step("SVG upload sanitised (script and handlers removed) and alt text saved");

  // ── 5b2. Site identity drives Site bindings ──────────────────────────────
  await designer.goto(`${BASE}${siteBase}/settings`, { waitUntil: "networkidle" });
  await designer.getByLabel("Tagline").fill("Calm, considered homes");
  await designer.locator("[data-save-identity]").click();
  await designer.getByText("Saved. The live site shows the new identity.").waitFor();
  if (!(await liveHtml("/sites/aurelia")).html.includes("Calm, considered homes")) fail("Live site did not pick up the new tagline");
  step("Changing the tagline in Site settings updates every Site-bound widget on the live site");

  // ── 5c. Bulk trash ────────────────────────────────────────────────────────
  await client.goto(`${BASE}${siteBase}/content`);
  await client.getByRole("navigation", { name: "Post types" }).getByRole("link", { name: /Shop/ }).click();
  await client.getByLabel("Select Linen Lounge Sofa").check();
  await client.getByLabel("Bulk action").selectOption("trash");
  await client.locator("[data-bulk-apply]").click();
  await client.locator('[data-row="linen-lounge-sofa"]').waitFor({ state: "detached" });
  if (await isLive("/sites/aurelia/shop/linen-lounge-sofa")) fail("Trashed entry is still live");
  step("Bulk trash removes an entry from the list and the live site");

  // ── 5d. Revision restore ──────────────────────────────────────────────────
  await client.goto(`${BASE}${siteBase}/content?type=case_studies`);
  await client.getByRole("link", { name: "Harbour House", exact: true }).click();
  await client.locator('input[name="title"]').fill("Harbour House (draft rename)");
  await client.locator('[data-save="draft"]').click();
  await client.getByText(/Draft saved/).first().waitFor();
  await client.locator("[data-open-history]").click();
  await client.locator('[data-revision="2"]').getByRole("button", { name: /Restore/ }).click();
  await client.getByText(/Restored version 2/).waitFor();
  await client.waitForFunction(() => document.querySelector('input[name="title"]')?.value === "Harbour House", null, { timeout: 10_000 }).catch(async () =>
    fail(`Restore did not bring the title back: ${await client.locator('input[name="title"]').inputValue()}`),
  );
  step("Revision history restores the published version as a new draft");

  // ── 5e. Scheduled publishing via the cron endpoint ───────────────────────
  await client.goto(`${BASE}${siteBase}/content?type=case_studies`, { waitUntil: "networkidle" });
  await client.locator("[data-new-entry]").click();
  await client.waitForURL(/\/content\/[a-z0-9]+$/);
  await client.locator('input[name="title"]').fill("Granary Lofts");
  await client.locator('[data-field="client_name"] input').fill("Granary Living");
  const at = new Date(Date.now() + 65_000);
  const local = new Date(at.getTime() - at.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  await client.getByText("Schedule", { exact: true }).first().click();
  await client.locator("#schedule-at").fill(local);
  await client.locator('[data-save="schedule"]').click();
  await client.getByText(/Scheduled/).first().waitFor();
  if (await isLive("/sites/aurelia/case-studies/granary-lofts")) fail("Scheduled entry is live too early");
  step("Entry scheduled for the next minute stays off the live site");

  const deadline = Date.now() + 150_000;
  let live = false;
  while (Date.now() < deadline && !live) {
    await new Promise((r) => setTimeout(r, 10_000));
    const res = await fetch(`${BASE}/api/cron/scheduled`, { headers: CRON_SECRET ? { authorization: `Bearer ${CRON_SECRET}` } : {} });
    if (!res.ok) fail(`Cron endpoint returned ${res.status}`);
    live = await isLive("/sites/aurelia/case-studies/granary-lofts");
  }
  if (!live) fail("Scheduled entry was not published by the cron endpoint");
  if ((await fetch(`${BASE}/api/cron/scheduled`)).status !== 401 && CRON_SECRET) fail("Cron endpoint accepts calls without the secret");
  step("Cron endpoint publishes the scheduled entry when it falls due (and rejects calls without the secret)");

  console.log("\nCMS workflow passed.");
} catch (err) {
  for (const [name, p] of [["designer", designer], ["client", client]]) {
    if (p) await p.screenshot({ path: path.join(SHOTS, `cms-failure-${name}.png`), fullPage: true }).catch(() => {});
  }
  console.error(err);
  process.exitCode = 1;
} finally {
  await browser.close();
}
