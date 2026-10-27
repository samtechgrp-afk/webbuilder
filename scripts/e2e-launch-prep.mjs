// End-to-end launch readiness (Phase 11), against local Stripe and Resend mocks:
//   1. Environment: env:check and `next start` both refuse a broken
//      configuration with a readable list, and accept a good one
//   2. Registration: sign-up lands in the welcome wizard; title, language,
//      currency and theme carry into the template's create form and onto the
//      new site; the welcome email goes out once; skipping works; seeded
//      (already onboarded) accounts never see the wizard
//   3. Orders: a mock Stripe checkout.session.completed sends the customer a
//      receipt (items, subtotal, shipping, tax, total, address, status link)
//      and the store owner an alert, through the dispatcher and Resend's API;
//      a redelivered webhook sends nothing new; the status link works and a
//      forged one is a 404
//   4. Builder: Client Mode shows the structure badge and its tooltip on
//      containers (Designers don't); the help drawer opens with ? and the
//      header button and closes with Esc
//   5. Health: platform admins see all six checks passing (with the Resend
//      mock as the provider); everyone else gets not-found or the login
//      page; /api/health answers
//
// Usage: npm run db:seed && npm run build
//        RESEND_API_KEY=re_e2e_test_key RESEND_API_BASE=http://127.0.0.1:4243 \
//        STRIPE_API_BASE=http://127.0.0.1:4242 npm start      (in another shell)
//        npm run e2e:launch-prep
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { chromium } from "playwright";
import { startResendMock } from "./resend-mock.mjs";
import { startStripeMock } from "./stripe-mock.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SHOTS = process.env.SCREENSHOT_DIR ?? "e2e-screenshots";
const WEBHOOK_SECRET = "whsec_aureliaDemoSigningSecret2026"; // the seed's demo secret
const TIP = "Text, links, and media are editable here. Structural layouts and grid columns are locked by your Designer.";
await mkdir(SHOTS, { recursive: true });

const prisma = new PrismaClient();
const browser = await chromium.launch();
const resend = await startResendMock({ port: Number(process.env.RESEND_MOCK_PORT ?? 4243) });
const stripe = await startStripeMock({ port: Number(process.env.STRIPE_MOCK_PORT ?? 4242), appBase: BASE, webhookSecret: WEBHOOK_SECRET });
const step = (msg) => console.log(`✓ ${msg}`);
const fail = (msg) => {
  throw new Error(msg);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(what, fn, timeout = 15_000) {
  const until = Date.now() + timeout;
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() > until) fail(`Timed out waiting for ${what}`);
    await sleep(250);
  }
}

async function newPage() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.on("dialog", (d) => d.accept());
  return page;
}

async function login(email, password = "demo-password-2026") {
  const page = await newPage();
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin/);
  return page;
}

/** Runs a command with exactly this environment (no .env), returning its exit code and output. */
function run(cmd, args, env, timeoutMs = 60_000) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env }, cwd: process.cwd() });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, out });
    });
  });
}

const GOOD_ENV = {
  DATABASE_URL: "postgresql://builder:builder@localhost:5432/builder?schema=public",
  SESSION_SECRET: "e2e-session-secret-e2e-session-secret-0123",
  ROOT_DOMAIN: "localhost:3000",
};

const pages = {};
try {
  // ── 1. Environment validation ───────────────────────────────────────────────
  const broken = await run("node", ["scripts/env-check.mjs"], { ...GOOD_ENV, DATABASE_URL: "", SESSION_SECRET: "too-short-secret", RESEND_API_KEY: "sk_live_wrongprovider", STORAGE_DRIVER: "s3" });
  if (broken.code !== 1) fail(`env:check exited ${broken.code} on a broken environment:\n${broken.out}`);
  for (const expected of [
    "DATABASE_URL is missing; it should be the Postgres connection string",
    "SESSION_SECRET must be at least 32 characters",
    "RESEND_API_KEY",
    "S3_BUCKET is required when STORAGE_DRIVER=s3",
    "Copy .env.example to .env",
  ]) {
    if (!broken.out.includes(expected)) fail(`env:check output lacks "${expected}":\n${broken.out}`);
  }
  if (broken.out.includes("too-short-secret") || broken.out.includes("sk_live_wrongprovider")) fail("env:check echoed a secret value");
  const good = await run("node", ["scripts/env-check.mjs"], GOOD_ENV);
  if (good.code !== 0 || !good.out.includes("✓ Environment OK")) fail(`env:check rejected a good environment:\n${good.out}`);
  step("env:check lists every problem in plain words (missing DATABASE_URL, short SESSION_SECRET, wrong-provider Resend key, incomplete S3 settings) without echoing secrets, exits 1, and passes a good environment");

  // Next loads .env itself and never overrides variables that are already set, so empty values stand.
  const boot = await run("npx", ["next", "start", "-p", "3999"], { ...GOOD_ENV, DATABASE_URL: "", NODE_ENV: "production" }, 45_000);
  if (boot.code === 0 || boot.code === null) fail(`next start didn't stop on a missing DATABASE_URL (exit ${boot.code}):\n${boot.out.slice(-800)}`);
  if (!boot.out.includes("Configuration error") || !boot.out.includes("DATABASE_URL is missing")) fail(`next start's error isn't readable:\n${boot.out.slice(-800)}`);
  step(`next start refuses to boot without DATABASE_URL (exit ${boot.code}) and prints the same readable list`);

  // ── 2. Registration and the welcome wizard ──────────────────────────────────
  const stamp = Date.now().toString(36);
  const email = `founder-${stamp}@example.com`;
  const signup = await newPage();
  pages.signup = signup;
  await signup.goto(`${BASE}/login`);
  await signup.locator('a[href="/signup"]').click();
  await signup.waitForURL(/\/signup$/);
  await signup.fill('input[name="name"]', "Lena Marsh");
  await signup.fill('input[name="email"]', email);
  await signup.fill('input[name="password"]', "short");
  await signup.click('button[type="submit"]');
  // The browser's minlength check stops a short password before the server sees it.
  if (signup.url().includes("onboarding")) fail("A 5-character password was accepted");
  await signup.fill('input[name="password"]', "bakery-password-2026");
  await signup.click('button[type="submit"]');
  await signup.waitForURL(/\/admin\/onboarding$/);
  const wizard = signup.locator("[data-onboarding-wizard]");
  await wizard.waitFor();
  if ((await wizard.getAttribute("data-onboarding-step")) !== "1") fail("The wizard didn't start at step 1");
  if (!(await wizard.evaluate((d) => d.open && d.matches(":modal")))) fail("The wizard isn't a modal dialog");
  if (!(await signup.locator("[data-onboarding-wizard] h1").textContent())?.includes("Welcome, Lena")) fail("The wizard doesn't greet the new user");
  await signup.screenshot({ path: path.join(SHOTS, "launch-01-wizard.png") });
  step("Registering at /signup (linked from login; short passwords refused) opens the welcome wizard as a modal, greeting Lena by name");

  const dup = await newPage();
  await dup.goto(`${BASE}/signup`);
  await dup.fill('input[name="name"]', "Someone Else");
  await dup.fill('input[name="email"]', email.toUpperCase());
  await dup.fill('input[name="password"]', "another-password-2026");
  await dup.click('button[type="submit"]');
  await dup.locator("[data-signup-error]").waitFor();
  if (!(await dup.locator("[data-signup-error]").textContent())?.includes("already")) fail("A duplicate email (different case) wasn't refused");
  await dup.context().close();
  step("Signing up again with the same email in capitals is refused with a clear message");

  if (!(await signup.locator("[data-onboarding-next]").isDisabled())) fail("Continue is enabled without a site title");
  await signup.fill("[data-onboarding-name]", "Lumen Bakery");
  await signup.click("[data-onboarding-next]");
  await signup.locator('[data-onboarding-step="2"]').waitFor();
  await signup.selectOption("[data-onboarding-locale]", "fr-FR");
  if ((await signup.locator("[data-onboarding-currency]").inputValue()) !== "EUR") fail("French didn't suggest EUR");
  await signup.click("[data-onboarding-next]");
  await signup.locator('[data-onboarding-step="3"]').waitFor();
  await signup.click('[data-onboarding-theme="stripe-clean"]');
  if ((await signup.locator('[data-onboarding-theme="stripe-clean"]').getAttribute("aria-checked")) !== "true") fail("The theme radio didn't select");
  await signup.click("[data-onboarding-next]");
  await signup.locator('[data-onboarding-step="4"]').waitFor();
  if ((await signup.locator("[data-template-card]").count()) !== 30) fail("Step 4 doesn't show the 30-template gallery");
  await signup.locator('[data-preview="coffee-roasters"]').first().click();
  const modal = signup.locator("[data-preview-modal]");
  await modal.waitFor();
  const templateKey = await modal.getAttribute("data-preview-modal");
  if ((await modal.locator('input[name="name"]').inputValue()) !== "Lumen Bakery") fail("The site title didn't carry into the create form");
  if ((await modal.locator('input[name="subdomain"]').inputValue()) !== "lumen-bakery") fail("The address wasn't suggested from the title");
  await signup.screenshot({ path: path.join(SHOTS, "launch-02-wizard-create.png") });
  await modal.locator("[data-create-site]").click();
  await signup.waitForURL(/\/admin\/sites\/[^/]+\/pages\/[^/]+\/edit$/, { timeout: 60_000 });
  const [, newSiteId] = signup.url().match(/\/admin\/sites\/([^/]+)\//);
  const newSite = await prisma.site.findUniqueOrThrow({ where: { id: newSiteId }, include: { locales: true } });
  const founder = await prisma.user.findUniqueOrThrow({ where: { email }, include: { memberships: { include: { role: true } } } });
  if (newSite.name !== "Lumen Bakery" || newSite.subdomain !== "lumen-bakery") fail(`Site: ${newSite.name} ${newSite.subdomain}`);
  const fr = newSite.locales.find((l) => l.code === "fr-FR");
  if (!fr?.isDefault || fr.currency !== "EUR" || newSite.locales.length !== 1) fail(`Locales: ${JSON.stringify(newSite.locales.map((l) => [l.code, l.isDefault, l.currency]))}`);
  if (newSite.designTokens?.colors?.primary !== "#635BFF") fail(`The Stripe Clean theme wasn't applied (primary ${newSite.designTokens?.colors?.primary})`);
  if (!founder.onboardedAt) fail("onboardedAt wasn't set");
  if (founder.memberships.length !== 1 || founder.memberships[0].role.key !== "designer") fail("The founder isn't the new site's Designer");
  step(`The wizard's choices land on the new site: “Lumen Bakery” at lumen-bakery from the ${templateKey} template, French (EUR) as the only and default language, the Stripe Clean theme, Lena as its Designer`);

  const welcome = await waitFor("the welcome email", () => resend.emails.find((e) => e.idempotencyKey === `site.welcome:${newSiteId}`));
  if (welcome.to[0] !== email || welcome.subject !== "Lumen Bakery is ready to edit") fail(`Welcome: ${welcome.to} / ${welcome.subject}`);
  if (!welcome.html.includes(`/admin/sites/${newSiteId}/pages/`) || !welcome.text.includes("Lumen Bakery")) fail("The welcome email lacks the editor link or text version");
  if (!/^Website Builder <noreply@localhost>$/.test(welcome.from)) fail(`From: ${welcome.from}`);
  const welcomeLog = await waitFor("SENT welcome log", () => prisma.emailLog.findFirst({ where: { idempotencyKey: `site.welcome:${newSiteId}`, status: "SENT" } }));
  if (welcomeLog.providerId !== welcome.id) fail("EmailLog doesn't record Resend's id");
  step(`Lena gets one welcome email through Resend's API (“${welcome.subject}”, editor link, plain-text part), logged as SENT with Resend's id`);

  await signup.goto(`${BASE}/admin/onboarding`);
  await signup.waitForURL(/\/admin$/);
  await signup.goto(`${BASE}/admin`);
  if (await signup.locator("[data-system-health-link]").count()) fail("A site owner sees the System health link");
  step("Once onboarded, /admin/onboarding sends Lena to her sites");

  const skipper = await newPage();
  await skipper.goto(`${BASE}/signup`);
  await skipper.fill('input[name="name"]', "Theo Quinn");
  await skipper.fill('input[name="email"]', `skip-${stamp}@example.com`);
  await skipper.fill('input[name="password"]', "skipping-password-2026");
  await skipper.click('button[type="submit"]');
  await skipper.waitForURL(/\/admin\/onboarding$/);
  await skipper.locator("[data-onboarding-wizard] [data-onboarding-skip]").click();
  await skipper.waitForURL(/\/admin$/);
  if (!(await skipper.locator("[data-new-site]").count())) fail("A skipped account can't start a site later");
  if (!(await prisma.user.findUniqueOrThrow({ where: { email: `skip-${stamp}@example.com` } })).onboardedAt) fail("Skipping didn't record onboarding");
  await skipper.context().close();
  step("“Skip for now” goes to an empty dashboard that still offers New site, and the wizard doesn't come back");

  const designer = await login("designer@studio.test");
  pages.designer = designer;
  if (designer.url().includes("onboarding")) fail("A seeded Designer was sent to onboarding");
  step("Seeded accounts sign in straight to their sites (they count as onboarded)");

  // ── 3. Order emails through a mock Stripe webhook ───────────────────────────
  const aurelia = await prisma.site.findUniqueOrThrow({ where: { subdomain: "aurelia" } });
  const vase = await prisma.product.findFirstOrThrow({ where: { siteId: aurelia.id, slug: "stoneware-bud-vase" } });
  const checkout = await fetch(`${BASE}/api/v1/sites/aurelia/checkout`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ items: [{ productId: vase.id, variantId: null, quantity: 2 }], path: "/sites/aurelia/store" }),
  });
  if (checkout.status !== 200) fail(`Checkout: ${checkout.status} ${await checkout.text()}`);
  const session = [...stripe.sessions.values()].at(-1);
  const orderId = session.object.client_reference_id;
  const items = session.object.amount_total;
  const [tax, shipping] = [1240, 900];
  const extra = {
    payment_status: "paid",
    payment_intent: "pi_mock_launch",
    amount_total: items + tax + shipping,
    total_details: { amount_tax: tax, amount_shipping: shipping, amount_discount: 0 },
    customer_details: { email: "ada@example.com", name: "Ada <Lovelace>" },
    collected_information: { shipping_details: { name: "Ada <Lovelace>", address: { line1: "12 Garden Row", line2: "Flat 3", postal_code: "02108", city: "Boston", state: "MA", country: "US" } } },
  };
  const hook = await stripe.sendEvent("checkout.session.completed", session, extra);
  if (hook.status !== 200 || hook.body?.status !== "PAID") fail(`Webhook: ${hook.status} ${JSON.stringify(hook.body)}`);
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  if (order.taxAmount !== tax || order.shippingAmount !== shipping || order.totalAmount !== items + tax + shipping) fail(`Order totals: ${order.taxAmount} ${order.shippingAmount} ${order.totalAmount}`);

  const money = (n) => new Intl.NumberFormat("en-US", { style: "currency", currency: order.currency.toUpperCase() }).format(n / 100);
  const receipt = await waitFor("the receipt", () => resend.emails.find((e) => e.idempotencyKey === `order.receipt:${orderId}`));
  if (receipt.to.join() !== "ada@example.com") fail(`Receipt to ${receipt.to}`);
  if (!receipt.subject.includes(`order #${order.number}`)) fail(`Receipt subject: ${receipt.subject}`);
  for (const [label, needle] of [
    ["item", vase.title],
    ["quantity", "× 2"],
    ["subtotal", money(items)],
    ["shipping", money(shipping)],
    ["tax", money(tax)],
    ["total", money(items + tax + shipping)],
    ["street", "12 Garden Row"],
    ["city", "Boston"],
    ["status link", `/order-status/${orderId}?t=`],
  ]) {
    if (!receipt.html.includes(needle)) fail(`The receipt lacks the ${label} (${needle})`);
  }
  if (receipt.html.includes("<Lovelace>") || !receipt.html.includes("Ada &lt;Lovelace&gt;")) fail("The customer's name wasn't HTML-escaped in the receipt");
  if (!receipt.text.includes(money(items + tax + shipping)) || !receipt.text.includes("12 Garden Row")) fail("The receipt's text part lacks the total or address");

  const alert = await waitFor("the store alert", () => resend.emails.find((e) => e.idempotencyKey === `order.alert:${orderId}`));
  if (!alert.to.includes("designer@studio.test") || alert.to.includes("author@aurelia.test")) fail(`Alert recipients: ${alert.to}`);
  if (!alert.subject.startsWith("[Ship] ") || !alert.html.includes("Ship within 2 business days")) fail(`The alert isn't marked as needing shipping: ${alert.subject}`);
  if (alert.reply_to !== "ada@example.com") fail(`Alert reply-to: ${alert.reply_to}`);
  if (!alert.html.includes("12 Garden Row") || !alert.html.includes("Flat 3") || !alert.html.includes(`/admin/sites/${aurelia.id}/`)) fail("The alert lacks the shipping address or admin link");
  step(`A paid mock Stripe session (#${order.number}) sends Ada a receipt (2 × ${vase.title}, subtotal ${money(items)}, shipping ${money(shipping)}, tax ${money(tax)}, total ${money(items + tax + shipping)}, address, status link, escaped name) and the shop's managers an urgent “[Ship]” alert that replies to Ada`);

  const before = resend.emails.length;
  const replay = await stripe.sendEvent("checkout.session.completed", session, extra);
  if (replay.status !== 200) fail(`Replay: ${replay.status}`);
  await sleep(2500);
  if (resend.emails.length !== before) fail(`A redelivered webhook sent ${resend.emails.length - before} more emails`);
  const logs = await prisma.emailLog.findMany({ where: { idempotencyKey: { in: [`order.receipt:${orderId}`, `order.alert:${orderId}`] } } });
  if (logs.length !== 2 || logs.some((l) => l.status !== "SENT" || l.siteId !== aurelia.id)) fail(`Email logs: ${JSON.stringify(logs.map((l) => [l.tag, l.status]))}`);
  step("Stripe redelivering the same event sends nothing new; EmailLog holds exactly one SENT row per email");

  const statusUrl = receipt.html.match(/href="([^"]*\/order-status\/[^"]+)"/)[1].replace(/&amp;/g, "&");
  const visitor = await newPage();
  pages.visitor = visitor;
  await visitor.goto(statusUrl);
  await visitor.locator('[data-order-status-page="PAID"]').waitFor();
  if ((await visitor.locator("[data-order-total]").textContent()) !== money(items + tax + shipping)) fail("The status page total doesn't match");
  await visitor.screenshot({ path: path.join(SHOTS, "launch-03-order-status.png"), fullPage: true });
  const forged = await fetch(statusUrl.replace(/t=[^&]+/, "t=0000000000000000000000000000beef"));
  if (forged.status !== 404) fail(`A forged status link answered ${forged.status}`);
  step("The receipt's status link shows the paid order with the same total; a forged token is a 404");

  // ── 4. Client Mode badges and the help drawer ───────────────────────────────
  await designer.goto(`${BASE}/admin/sites/${aurelia.id}`);
  await designer.getByRole("link", { name: /Edit visually|Open builder|Edit page/ }).first().click();
  await designer.waitForSelector('[data-node-id="hero-title"]');
  await designer.hover('[data-node-id="hero-grid"]', { position: { x: 5, y: 5 } });
  await sleep(300);
  if (await designer.locator("[data-structure-badge]").count()) fail("A Designer sees the client lock badge");
  await designer.locator("[data-open-help]").click();
  if (!(await designer.locator("[data-shortcuts]").innerText()).includes("Duplicate")) fail("Designers don't see the duplicate shortcut");
  await designer.goto(`${BASE}/admin`); // leaves the editor, releasing the page for Olivia
  step("Designers see no lock badges, and their help lists Duplicate and Delete too");

  const client = await login("client@aurelia.test");
  pages.client = client;
  await client.getByRole("link", { name: "Edit visually" }).first().click();
  await client.waitForSelector('[data-node-id="hero-title"]');
  await client.hover('[data-node-id="hero-grid"]', { position: { x: 5, y: 5 } });
  const badge = client.locator('[data-structure-badge="hero-grid"]');
  await badge.waitFor();
  await badge.locator("button").focus();
  const tip = badge.locator("[data-structure-tip]");
  await tip.waitFor({ state: "visible" });
  if ((await tip.textContent())?.trim() !== TIP) fail(`Tooltip text: ${await tip.textContent()}`);
  await client.screenshot({ path: path.join(SHOTS, "launch-04-structure-badge.png") });
  await client.hover('[data-node-id="hero-title"]');
  const titleBadge = await client.locator('[data-structure-badge="hero-title"]').count();
  if (titleBadge) fail("A text widget got a structure badge");
  step("Client Mode: hovering a layout container shows the lock badge; its tooltip reads the exact guardrail text; text widgets get none");

  await client.keyboard.press("Escape");
  await client.locator("body").click({ position: { x: 2, y: 2 } }).catch(() => {});
  await client.keyboard.press("?");
  const drawer = client.locator("[data-help-drawer]");
  await drawer.waitFor();
  const shortcuts = await drawer.locator("[data-shortcuts]").innerText();
  for (const s of ["Undo", "Redo", "Esc"]) if (!shortcuts.includes(s)) fail(`Help lacks the ${s} shortcut`);
  if (shortcuts.includes("Duplicate")) fail("Clients are shown the Designer-only duplicate shortcut");
  if (!(await drawer.innerText()).includes("custom field")) fail("Help lacks the custom-field guidance");
  await client.screenshot({ path: path.join(SHOTS, "launch-05-help.png") });
  await client.keyboard.press("Escape");
  await drawer.waitFor({ state: "detached" });
  await client.locator("[data-open-help]").click();
  await drawer.waitFor();
  await client.locator("[data-close-help]").click();
  await drawer.waitFor({ state: "detached" });
  step("The help drawer opens with ? or the header button (Undo, Redo, Esc and custom-field tips; no Designer-only shortcuts) and closes with Esc or Close");

  // ── 5. System health ────────────────────────────────────────────────────────
  const admin = await login("admin@platform.test");
  pages.admin = admin;
  await admin.locator("[data-system-health-link]").click();
  await admin.waitForURL(/\/admin\/system\/health$/);
  const checks = await admin.locator("[data-health-check]").evaluateAll((els) => els.map((e) => [e.getAttribute("data-health-check"), e.getAttribute("data-status"), e.querySelector("[data-health-summary]")?.textContent]));
  if (checks.length !== 6) fail(`Expected 6 checks, got ${checks.length}`);
  const byKey = Object.fromEntries(checks.map(([k, s, t]) => [k, { s, t }]));
  for (const key of ["database", "migrations", "storage", "email", "dns", "config"]) {
    if (byKey[key]?.s !== "ok") fail(`Health check ${key} is ${byKey[key]?.s}: ${byKey[key]?.t}`);
  }
  if (!byKey.migrations.t.startsWith("Up to date")) fail(`Migrations: ${byKey.migrations.t}`);
  if (!byKey.email.t.includes("localhost is verified")) fail(`Email: ${byKey.email.t}`);
  if (!resend.requests.some((r) => r.method === "GET" && r.path === "/domains")) fail("The email check didn't verify the key with Resend");
  const firstChecked = await admin.locator("[data-health-checked-at]").getAttribute("data-health-checked-at");
  await admin.locator("[data-health-check-now]").click();
  await waitFor("a fresh check", async () => (await admin.locator("[data-health-checked-at]").getAttribute("data-health-checked-at")) !== firstChecked);
  await admin.screenshot({ path: path.join(SHOTS, "launch-06-health.png"), fullPage: true });
  step(`System health (platform admin): ${checks.map(([k]) => k).join(", ")} all pass, the Resend key is verified against the API, and Check now re-runs them`);

  // Admin notFound() streams with HTTP 200 under partial prerendering, so check what renders.
  await designer.goto(`${BASE}/admin/system/health`);
  await designer.getByText(/could not be found|not found/i).first().waitFor();
  if (await designer.locator("[data-health-check], [data-system-health]").count()) fail("A Designer can see the health checks");
  const anon = await fetch(`${BASE}/admin/system/health`, { redirect: "manual" });
  if (anon.status !== 307 || !anon.headers.get("location")?.includes("/login")) fail(`Anonymous health page: ${anon.status}`);
  const live = await fetch(`${BASE}/api/health`);
  if (live.status !== 200 || (await live.json()).ok !== true) fail("/api/health isn't healthy");
  step("Designers get the not-found page and visitors the login page; /api/health answers {ok:true} for load balancers");

  console.log("\nLaunch prep passed.");
} catch (err) {
  for (const [name, p] of Object.entries(pages)) {
    if (p) await p.screenshot({ path: path.join(SHOTS, `launch-failure-${name}.png`), fullPage: true }).catch(() => {});
  }
  console.error(`\n✗ ${err.message}`);
  process.exitCode = 1;
} finally {
  await browser.close();
  await stripe.close();
  await resend.close();
  await prisma.$disconnect();
}
