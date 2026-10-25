// End-to-end global design tokens:
//   1. A Designer applies a preset and edits a colour on the Design system
//      page; the preview restyles live (no reload), and saving puts the new
//      CSS variables (fluid clamp() type scale, 8pt spacing) on the live site.
//   2. In the editor, the Designer Mode drawer restyles the canvas as tokens
//      change, Discard reverts, and the Style inspector switches a field
//      between a raw value and a global token.
//   3. Client Mode is locked out: no nav link, no drawer, a not-found page,
//      and the save action replayed with a Client Admin's session is refused
//      on the server. Unsafe token values are refused for Designers too.
//   4. Restoring v0 from history puts the original tokens back live.
//
// Usage: npm run db:seed && npm run build && npm start   (in another shell)
//        npm run e2e:tokens
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SHOTS = process.env.SCREENSHOT_DIR ?? "e2e-screenshots";
await mkdir(SHOTS, { recursive: true });

const prisma = new PrismaClient();
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

/** Polls a computed style until it matches, since React applies token changes on the next frame. */
async function expectStyle(page, selector, prop, expected, what) {
  try {
    await page.waitForFunction(
      ([sel, p, want]) => {
        const el = document.querySelector(sel);
        if (!el) return false;
        const cs = getComputedStyle(el);
        const v = p.startsWith("--") ? cs.getPropertyValue(p).trim() : cs[p];
        return want instanceof RegExp ? false : v === want;
      },
      [selector, prop, expected],
      { timeout: 5000 },
    );
  } catch {
    const actual = await page.evaluate(([sel, p]) => {
      const el = document.querySelector(sel);
      if (!el) return "(missing)";
      const cs = getComputedStyle(el);
      return p.startsWith("--") ? cs.getPropertyValue(p).trim() : cs[p];
    }, [selector, prop]);
    fail(`${what}: ${prop} is "${actual}", expected "${expected}"`);
  }
}

const site = await prisma.site.findUniqueOrThrow({ where: { subdomain: "aurelia" } });
const publicHtml = async () => (await fetch(`${BASE}/sites/aurelia`)).text();

let designer;
let client;
try {
  // ── 1. Design system page ────────────────────────────────────────────────
  designer = await login("designer@studio.test");
  await designer.getByRole("link", { name: /Aurelia Interiors/ }).click();
  await designer.waitForURL(/\/admin\/sites\/[^/]+$/);
  await designer.getByRole("link", { name: "Design system" }).click();
  await designer.waitForURL(/\/design-system$/);
  await designer.locator("[data-specimen]").waitFor();
  await designer.evaluate(() => (window.__sameDocument = true));
  await expectStyle(designer, "[data-specimen]", "backgroundColor", "rgb(251, 248, 243)", "Specimen starts on Aurelia's canvas colour");

  await designer.locator('[data-preset="linear-dark"]').click();
  await expectStyle(designer, "[data-specimen]", "backgroundColor", "rgb(0, 0, 0)", "Linear Dark preset");
  await expectStyle(designer, "[data-specimen-primary]", "backgroundColor", "rgb(94, 106, 210)", "Linear Dark primary");
  const h1Var = await designer.evaluate(() => getComputedStyle(document.querySelector("[data-specimen]")).getPropertyValue("--text-h1"));
  if (!/^clamp\([\d.]+rem, [\d.]+rem \+ [\d.]+cqi, [\d.]+rem\)$/.test(h1Var.trim())) fail(`--text-h1 is not a fluid clamp(): ${h1Var}`);
  step(`Linear Dark preset restyles the preview live; --text-h1 is ${h1Var.trim()}`);

  await designer.getByLabel("Primary colour", { exact: true }).fill("#FF0066");
  await expectStyle(designer, "[data-specimen-primary]", "backgroundColor", "rgb(255, 0, 102)", "Edited primary colour");
  if (!(await designer.evaluate(() => window.__sameDocument))) fail("The page reloaded while editing tokens");
  step("Editing a colour restyles the preview as you type, without a reload");

  const actionRequest = designer.waitForRequest((r) => r.method() === "POST" && !!r.headers()["next-action"]);
  await designer.locator("[data-save-tokens]").click();
  const saveReq = await actionRequest;
  await designer.getByText("Saved. Every page on the live site uses the new tokens.").waitFor();
  await designer.screenshot({ path: path.join(SHOTS, "tokens-design-system.png"), fullPage: true });

  const live = await publicHtml();
  for (const v of ["--color-primary:#FF0066", "--color-background:#000000", "--text-h1:clamp(", "--space-32:16rem", "--ambient-primary:radial-gradient(", "--color-gold:#C9A66B"]) {
    if (!live.includes(v)) fail(`Live site is missing ${v}`);
  }
  const saved = await prisma.site.findUniqueOrThrow({ where: { id: site.id }, select: { designTokensVersion: true } });
  if (saved.designTokensVersion !== 1) fail(`Expected token version 1, got ${saved.designTokensVersion}`);
  step("Saving puts the new variables on the live site, keeping the site's own tokens (gold)");

  // ── 2. Editor drawer and Style inspector ─────────────────────────────────
  await designer.goto(`${BASE}/admin/sites/${site.id}`);
  await designer.getByRole("link", { name: "Edit visually" }).first().click();
  await designer.waitForSelector('[data-node-id="hero-title"]');
  const canvas = ".editor-canvas > .site-root";
  await expectStyle(designer, canvas, "backgroundColor", "rgb(0, 0, 0)", "Canvas uses the saved tokens");

  await designer.getByRole("button", { name: "Design system" }).click();
  const drawer = designer.getByRole("dialog", { name: "Design system" });
  await drawer.locator('[data-preset="stripe-clean"]').click();
  await expectStyle(designer, canvas, "backgroundColor", "rgb(255, 255, 255)", "Stripe Clean on the canvas");
  await expectStyle(designer, canvas, "--color-primary", "#635BFF", "Stripe Clean primary on the canvas");
  await drawer.getByLabel("Canvas colour", { exact: true }).fill("#101010");
  await expectStyle(designer, canvas, "backgroundColor", "rgb(16, 16, 16)", "Canvas colour edited in the drawer");
  await designer.screenshot({ path: path.join(SHOTS, "tokens-editor-drawer.png") });
  await drawer.getByRole("button", { name: "Discard" }).click();
  await expectStyle(designer, canvas, "backgroundColor", "rgb(0, 0, 0)", "Discard reverts the canvas");
  step("The drawer restyles the canvas live (preset, colour), and Discard reverts it");

  await drawer.getByRole("button", { name: "Close" }).click();
  await designer.locator('[data-layer="hero-title"]').click().catch(async () => {
    await designer.getByRole("tab", { name: "Layers" }).click();
    await designer.locator('[data-layer="hero-title"]').click();
  });
  await designer.getByRole("tab", { name: "style" }).click();
  const sizeSource = designer.getByRole("radiogroup", { name: "Size value source" });
  await sizeSource.getByRole("radio", { name: "Token" }).click();
  await designer.locator('select[data-style="fontSize"]').selectOption("var(--text-h3)");
  const h3 = await designer.evaluate(() => getComputedStyle(document.querySelector(".editor-canvas .site-root")).getPropertyValue("--text-h3").trim());
  const titleSize = await designer.evaluate(() => getComputedStyle(document.querySelector('[data-node-id="hero-title"]')).fontSize);
  const expectedPx = await designer.evaluate((v) => {
    const probe = document.createElement("div");
    probe.style.fontSize = v;
    document.querySelector(".editor-canvas .site-root").appendChild(probe);
    const px = getComputedStyle(probe).fontSize;
    probe.remove();
    return px;
  }, h3);
  if (titleSize !== expectedPx) fail(`Headline is ${titleSize}, expected the h3 token's ${expectedPx}`);
  await sizeSource.getByRole("radio", { name: "Raw" }).click();
  const raw = await designer.locator('input[data-style="fontSize"]').inputValue();
  if (raw !== "var(--text-h3)") fail(`Raw view shows "${raw}"`);
  await designer.locator('input[data-style="fontSize"]').fill("3rem");
  await designer.locator('input[data-style="fontSize"]').press("Enter");
  await expectStyle(designer, '[data-node-id="hero-title"]', "fontSize", "48px", "Raw font size");
  step("The Style inspector switches a field between a global token and a raw value");

  // ── 3. Client Mode lockout ───────────────────────────────────────────────
  client = await login("client@aurelia.test");
  await client.getByRole("link", { name: /Aurelia Interiors/ }).click();
  await client.waitForURL(/\/admin\/sites\/[^/]+$/);
  if (await client.getByRole("link", { name: "Design system" }).count()) fail("Client Admin sees the Design system link");
  // Admin pages stream (PPR), so the status line is sent before notFound() runs; check the rendered result.
  await client.goto(`${BASE}/admin/sites/${site.id}/design-system`);
  await client.getByText("This page could not be found.").waitFor();
  if (await client.locator("[data-specimen], [data-save-tokens]").count()) fail("Client Admin sees the design system editor");
  await client.goto(`${BASE}/admin/sites/${site.id}`);
  await client.getByRole("link", { name: "Edit visually" }).first().click();
  await client.waitForSelector("text=Client mode");
  if (await client.getByRole("button", { name: "Design system" }).count()) fail("Client mode shows the Design system drawer button");
  step("Client Mode has no design-system link, page (not found) or drawer");

  const replay = async (page, args) => {
    const r = await page.request.post(saveReq.url(), {
      headers: {
        "next-action": saveReq.headers()["next-action"],
        "content-type": saveReq.headers()["content-type"],
        accept: "text/x-component",
        origin: new URL(BASE).origin,
      },
      data: JSON.stringify([args]),
    });
    return r.text();
  };
  const [original] = JSON.parse(saveReq.postData());
  const before = await prisma.site.findUniqueOrThrow({ where: { id: site.id }, select: { designTokens: true, designTokensVersion: true } });
  const clientRes = await replay(client, { ...original, tokens: { colors: { background: "#FF0000" } }, baseVersion: before.designTokensVersion });
  if (!/permission/i.test(clientRes)) fail(`Client replay wasn't refused: ${clientRes.slice(0, 300)}`);
  const evil = await replay(designer, { ...original, tokens: { colors: { background: "red;}</style><script>alert(1)</script>" } }, baseVersion: before.designTokensVersion });
  if (!/aren't allowed|Colours are/i.test(evil)) fail(`Unsafe tokens weren't refused: ${evil.slice(0, 300)}`);
  const stale = await replay(designer, { ...original, baseVersion: 0 });
  if (!/Someone else changed/i.test(stale)) fail(`A stale save wasn't refused: ${stale.slice(0, 300)}`);
  const after = await prisma.site.findUniqueOrThrow({ where: { id: site.id }, select: { designTokens: true, designTokensVersion: true } });
  if (after.designTokensVersion !== before.designTokensVersion || JSON.stringify(after.designTokens) !== JSON.stringify(before.designTokens)) {
    fail("Tokens changed after refused saves");
  }
  step("The server refuses a Client Admin's replayed save, unsafe values and a stale version; nothing is written");

  // ── 4. Restore ───────────────────────────────────────────────────────────
  await designer.goto(`${BASE}/admin/sites/${site.id}/design-system`);
  await designer.locator('[data-token-revision="0"]').getByRole("button", { name: "Restore" }).click();
  await designer.getByText("Restored v0. It's live now.").waitFor();
  await expectStyle(designer, "[data-specimen]", "backgroundColor", "rgb(251, 248, 243)", "Restored preview");
  const restored = await publicHtml();
  if (!restored.includes("--color-background:#FBF8F3") || restored.includes("--color-primary:#FF0066")) fail("Live site didn't return to the original tokens");
  step("Restoring v0 from history puts the original tokens back on the live site");

  console.log("\nDesign tokens passed.");
} catch (err) {
  for (const [name, p] of [["designer", designer], ["client", client]]) {
    if (p) await p.screenshot({ path: path.join(SHOTS, `tokens-failure-${name}.png`), fullPage: true }).catch(() => {});
  }
  console.error(err);
  process.exitCode = 1;
} finally {
  await browser.close();
  await prisma.$disconnect();
}
