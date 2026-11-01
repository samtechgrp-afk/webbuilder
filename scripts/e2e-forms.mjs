// End-to-end forms: a Designer adds a Contact form (with a file upload field),
// a Newsletter sign-up and a Star rating and publishes. A visitor sends a
// message with an attachment (in place, with JavaScript), gets a field error
// back from the server, sends again without JavaScript, and subscribes. The
// team gets a notification email through Resend (mocked here). The Client
// Admin reads the message in Forms, downloads the attachment and the
// subscribers CSV; an Author and another site's client can't.
//
// Usage: npm run db:seed && npm run build && \
//        RESEND_API_KEY=re_e2e_test_key RESEND_API_BASE=http://127.0.0.1:4243 npm start   (in another shell)
//        npm run e2e:forms
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { startResendMock } from "./resend-mock.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SHOTS = process.env.SCREENSHOT_DIR ?? "e2e-screenshots";
await mkdir(SHOTS, { recursive: true });

const resend = await startResendMock({ port: Number(process.env.RESEND_MOCK_PORT ?? 4243) });
const browser = await chromium.launch();
const step = (msg) => console.log(`✓ ${msg}`);
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

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
let siteId = "";

try {
  // ── Designer builds the forms ────────────────────────────────────────────
  await login(page, "designer@studio.test");
  await page.getByRole("link", { name: /Aurelia Interiors/ }).first().click();
  await page.waitForURL(/\/admin\/sites\/[^/]+$/);
  siteId = new URL(page.url()).pathname.split("/")[3];
  await page.getByRole("link", { name: "Edit visually" }).first().click();
  await page.waitForSelector("text=Design mode");
  await page.locator('[data-palette-group="forms"]').waitFor();

  await page.locator("body").press("Escape");
  await add("preset:boxed");
  const form = await add("form");
  await tab("content");
  const fields = inspector.locator("[data-items-editor]");
  await fields.locator("[data-add-item]").click();
  const n = await fields.locator("[data-item-row]").count();
  await inspector.getByLabel(`Field ${n} Type`).selectOption("file");
  await inspector.getByLabel(`Field ${n} Label`).fill("Floor plan");
  await inspector.getByLabel(`Field ${n} Label`).press("Tab");
  await tab("settings");
  await inspector.getByLabel("Form name").fill("Project enquiry");
  await inspector.getByLabel("Form name").press("Tab");
  await page.waitForFunction((id) => document.querySelector(`[data-node-id="${id}"] input[type=file]`), form);
  if (!(await page.locator(`[data-node-id="${form}"] fieldset[disabled]`).count())) throw new Error("The canvas form should be inert");
  const newsletter = await add("newsletter");
  await tab("settings");
  await inspector.getByLabel("Ask for a name").check();
  await add("rating");
  step("Designer adds a Contact form with a file field, a Newsletter sign-up asking for a name, and a Star rating");

  await page.getByRole("button", { name: "Publish" }).click();
  await page.waitForSelector("text=Published. Your changes are live.");
  await page.locator("header").getByRole("link", { name: "← Aurelia Interiors" }).click();
  await page.waitForURL((u) => !u.pathname.endsWith("/edit"));

  // ── Visitor ──────────────────────────────────────────────────────────────
  const visitor = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await visitor.goto(`${BASE}/sites/aurelia`);
  const live = visitor.locator(`.n-${form} form`);
  await live.scrollIntoViewIfNeeded();
  if (!(await visitor.locator(`.n-${form}`).count()) || !(await visitor.locator('.n-' + newsletter).count())) throw new Error("Forms missing on the live page");
  if (!(await visitor.locator('[data-w="rating"] [data-rating-fill]').count())) throw new Error("Star rating missing");
  await live.getByLabel("Name").fill("Ada Lovelace");
  await live.getByLabel("Email").fill("ada@analytical"); // passes the browser's check, not the server's
  await live.getByLabel("Topic").selectOption({ label: "New project" });
  await live.getByLabel("Message").fill("We'd love a calm reading corner.");
  await live.getByLabel("Floor plan").setInputFiles({ name: "plan.pdf", mimeType: "application/pdf", buffer: PDF });
  await live.getByRole("button", { name: "Send message" }).click();
  await live.locator('input[name="f1"][aria-invalid="true"]').waitFor();
  const fieldError = await live.locator('[data-type="email"] [data-field-error]').textContent();
  if (!/email address/i.test(fieldError ?? "")) throw new Error(`Field error was "${fieldError}"`);
  await visitor.screenshot({ path: `${SHOTS}/forms-error.png` });
  await live.getByLabel("Email").fill("ada@example.com");
  await live.getByRole("button", { name: "Send message" }).click();
  await live.locator("[data-form-success]").waitFor({ state: "visible" });
  if (await live.locator("[data-form-body]").isVisible()) throw new Error("The form should give way to the thank-you message");
  await visitor.screenshot({ path: `${SHOTS}/forms-sent.png` });
  step("Visitor gets a server-side field error in place, fixes it and sends the message with a PDF attached");

  const nl = visitor.locator(`.n-${newsletter} form`);
  await nl.getByLabel("Name").fill("Grace");
  await nl.getByLabel("Email address").fill("Grace@Example.com");
  await nl.getByRole("button", { name: "Subscribe" }).click();
  await nl.locator("[data-form-success]").waitFor({ state: "visible" });
  step("Visitor subscribes to the newsletter");

  // Without JavaScript the browser posts the form and gets a small page back.
  const nojs = await browser.newContext({ javaScriptEnabled: false });
  const plain = await nojs.newPage();
  await plain.goto(`${BASE}/sites/aurelia`);
  const pf = plain.locator(`.n-${form} form`);
  await pf.getByLabel("Name").fill("Charles");
  await pf.getByLabel("Email").fill("charles@example.com");
  await pf.getByLabel("Message").fill("No script here.");
  await pf.getByLabel("Floor plan").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("Plain notes") });
  await pf.getByRole("button", { name: "Send message" }).click();
  await plain.waitForLoadState("load");
  if (!(await plain.getByText("Message sent").count())) throw new Error(`No-JS submit answered: ${(await plain.locator("body").innerText()).slice(0, 300)} (${plain.url()})`);
  await plain.getByRole("link", { name: "← Back to the site" }).waitFor();
  await nojs.close();
  // A bot filling the hidden field is told "thanks" and nothing is stored.
  const bot = await visitor.request.post(`${BASE}/api/v1/sites/aurelia/forms`, { headers: { accept: "application/json" }, multipart: { _form: form, _hp: "http://spam", f0: "Bot", f1: "bot@spam.test", f3: "buy now" } });
  if (!bot.ok()) throw new Error(`Honeypot answered ${bot.status()}`);
  const ghost = await visitor.request.post(`${BASE}/api/v1/sites/aurelia/forms`, { headers: { accept: "application/json" }, multipart: { _form: "nope123", f0: "x" } });
  if (ghost.status() !== 404) throw new Error(`Unknown form answered ${ghost.status()}`);
  const cross = await visitor.request.post(`${BASE}/api/v1/sites/northwind/forms`, { headers: { accept: "application/json" }, multipart: { _form: form, f0: "x", f1: "x@y.co", f3: "x" } });
  if (cross.status() !== 404) throw new Error(`Posting Aurelia's form to Northwind answered ${cross.status()}`);
  step("Without JavaScript the form still sends; the spam trap, unknown forms and other sites' forms store nothing");

  // ── Notification emails ──────────────────────────────────────────────────
  const deadline = Date.now() + 10_000;
  while (resend.emails.filter((e) => e.subject.startsWith("Project enquiry")).length < 2 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 200));
  const mails = resend.emails.filter((e) => e.subject.startsWith("Project enquiry"));
  if (mails.length !== 2) throw new Error(`Expected 2 notification emails, got ${mails.length}: ${resend.emails.map((e) => e.subject).join(" | ")}`);
  const first = mails.find((m) => m.reply_to === "ada@example.com");
  if (!first) throw new Error("Notification isn't reply-to the visitor");
  if (!first.to.includes("client@aurelia.test") || first.to.includes("author@aurelia.test")) throw new Error(`Notification went to ${first.to}`);
  if (!/We&#39;d love a calm reading corner|We'd love a calm reading corner/.test(first.html) || !/plan\.pdf/.test(first.html)) throw new Error("Notification is missing the message");
  if (resend.emails.some((e) => /Bot|buy now/.test(e.html ?? ""))) throw new Error("The spam trap sent an email");
  step("The team gets each message by email (reply-to the visitor), the Author and the spam don't");

  // ── Client Admin reads it ────────────────────────────────────────────────
  const cctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const client = await cctx.newPage();
  await login(client, "client@aurelia.test");
  await client.getByRole("navigation", { name: "Site" }).getByRole("link", { name: "Forms" }).click();
  await client.waitForSelector("[data-submissions-table]");
  const rows = client.locator("[data-submission-row]");
  if ((await rows.count()) !== 2) throw new Error(`Inbox has ${await rows.count()} messages`);
  if ((await client.locator("[data-unread]").count()) !== 2) throw new Error("New messages should be unread");
  await client.screenshot({ path: `${SHOTS}/forms-inbox.png` });
  await client.getByRole("link", { name: "ada@example.com" }).click();
  await client.waitForSelector("[data-submission-fields]");
  const body = await client.locator("[data-submission-fields]").innerText();
  for (const want of ["Ada Lovelace", "New project", "calm reading corner"]) if (!body.includes(want)) throw new Error(`Message is missing "${want}"`);
  const [download] = await Promise.all([client.waitForEvent("download"), client.getByRole("link", { name: "Download" }).click()]);
  const bytes = await (await download.createReadStream()).toArray();
  if (Buffer.concat(bytes).toString() !== PDF.toString()) throw new Error("Attachment came back different");
  const fileUrl = await client.getByRole("link", { name: "Download" }).getAttribute("href");
  await client.screenshot({ path: `${SHOTS}/forms-message.png` });
  await client.locator('[data-submission-action="spam"]').click();
  await client.waitForSelector("text=Not spam");
  await client.goto(`${BASE}/admin/sites/${siteId}/forms`);
  if ((await client.locator("[data-submission-row]").count()) !== 1) throw new Error("Spam should leave the inbox");
  step("Client Admin reads the message in Forms, downloads the attachment and moves it to spam");

  await client.getByRole("link", { name: "Subscribers" }).click();
  await client.locator('[data-subscriber-row="grace@example.com"]').waitFor();
  const csv = await client.request.get(`${BASE}/api/sites/${siteId}/forms/subscribers.csv`);
  const text = await csv.text();
  if (!csv.ok() || !/grace@example\.com,Grace,subscribed,Newsletter/.test(text)) throw new Error(`Subscribers CSV: ${text.slice(0, 200)}`);
  const msgs = await client.request.get(`${BASE}/api/sites/${siteId}/forms/export`);
  if (!/charles@example\.com/.test(await msgs.text())) throw new Error("Messages CSV is missing the no-JS message");
  await client.screenshot({ path: `${SHOTS}/forms-subscribers.png` });
  step("Subscribers list and both CSV downloads work");

  // ── Who can't ────────────────────────────────────────────────────────────
  const actx = await browser.newContext();
  const author = await actx.newPage();
  await login(author, "author@aurelia.test");
  if (await author.getByRole("navigation", { name: "Site" }).getByRole("link", { name: "Forms" }).count()) throw new Error("Author sees Forms");
  await author.goto(`${BASE}/admin/sites/${siteId}/forms`);
  if (!(await author.getByText(/not found|could not be found/i).count())) throw new Error("Author can open Forms");
  if ((await author.request.get(`${BASE}${fileUrl}`)).status() !== 404) throw new Error("Author can download the attachment");
  const nctx = await browser.newContext();
  const north = await nctx.newPage();
  await login(north, "client@northwind.test");
  if ((await north.request.get(`${BASE}${fileUrl}`)).status() !== 404) throw new Error("Another site's client can download the attachment");
  if ((await north.request.get(`${BASE}/uploads/private/forms/${siteId}/x.pdf`)).status() !== 404) throw new Error("Private files are reachable through /uploads");
  step("Authors and other sites' members get 404 for Forms and attachments");

  console.log(`\nForms passed. Screenshots in ${SHOTS}/`);
} catch (err) {
  await page.screenshot({ path: `${SHOTS}/forms-failure.png` }).catch(() => {});
  console.error(err);
  process.exitCode = 1;
} finally {
  await browser.close();
  await resend.close();
}
