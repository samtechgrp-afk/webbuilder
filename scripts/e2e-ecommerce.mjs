// End-to-end shop and Stripe checkout, against a local Stripe mock (no real
// keys needed; the mock speaks Stripe's form encoding and signs webhooks with
// Stripe's real HMAC scheme):
//   1. Payments settings are Designer-only: keys show masked, a Client Admin
//      gets no screen and a replayed save is refused.
//   2. A Client Admin manages the catalog: creates a product with a photo,
//      price and stock, and restocks one variant.
//   3. Storefront: the product grid (drafts hidden, visitor sorting), the
//      product page's variant selector with live price and stock, the cart
//      drawer's quantities and subtotal, and the cart surviving a reload.
//   4. Checkout: the Stripe session gets the right line items, prices from
//      the database, currency, metadata and return links; a PENDING order
//      freezes the prices.
//   5. Webhook: paying sends a signed checkout.session.completed; the order
//      turns PAID with the customer's details and stock goes down, once.
//      Duplicates, tampered, unsigned and cross-site events change nothing;
//      an expired session cancels its order.
//   6. Guardrails: oversold carts, drafts, price fields, cross-origin calls
//      and shops without Stripe are refused.
//   7. Orders dashboard: filter, review and fulfil. The builder offers the
//      shop widgets and renders real products on the canvas.
//
// Usage: npm run db:seed && npm run build
//        STRIPE_API_BASE=http://127.0.0.1:4242 npm start   (in another shell)
//        npm run e2e:ecommerce
import { mkdir } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { chromium } from "playwright";
import { sign, startStripeMock } from "./stripe-mock.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SHOTS = process.env.SCREENSHOT_DIR ?? "e2e-screenshots";
const WEBHOOK_SECRET = "whsec_aureliaDemoSigningSecret2026"; // the seed's demo secret
await mkdir(SHOTS, { recursive: true });

const prisma = new PrismaClient();
const browser = await chromium.launch();
const stripe = await startStripeMock({ port: Number(process.env.STRIPE_MOCK_PORT ?? 4242), appBase: BASE, webhookSecret: WEBHOOK_SECRET });
const step = (msg) => console.log(`✓ ${msg}`);
const fail = (msg) => {
  throw new Error(msg);
};

async function login(email) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.on("dialog", (d) => d.accept());
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "demo-password-2026");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin/);
  return page;
}

function get(pathname) {
  const url = new URL(pathname, BASE);
  return new Promise((resolve, reject) => {
    const req = http.request({ host: url.hostname, port: url.port, path: url.pathname + url.search, method: "GET" }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode, body }));
    });
    req.on("error", reject);
    req.end();
  });
}

async function checkoutApi(site, body, headers = {}) {
  const res = await fetch(`${BASE}/api/v1/sites/${site}/checkout`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  return { status: res.status, json: await res.json().catch(() => null) };
}

async function webhook(payload, signature) {
  const res = await fetch(`${BASE}/api/webhooks/stripe`, { method: "POST", headers: { "content-type": "application/json", ...(signature ? { "stripe-signature": signature } : {}) }, body: payload });
  return { status: res.status, json: await res.json().catch(() => null) };
}

async function replay(page, req, transform = (args) => args) {
  const args = JSON.parse(req.postData());
  const res = await page.request.post(req.url(), {
    headers: { "next-action": req.headers()["next-action"], "content-type": req.headers()["content-type"], accept: "text/x-component", origin: new URL(BASE).origin },
    data: JSON.stringify(transform(args)),
  });
  return res.text();
}

const stockOf = async (slug) => (await prisma.product.findFirstOrThrow({ where: { siteId: aurelia.id, slug } })).inventory;
const variantStock = async (title) => (await prisma.productVariant.findFirstOrThrow({ where: { siteId: aurelia.id, title } })).inventory;

const S = `${BASE}/sites/aurelia`;
const aurelia = await prisma.site.findUniqueOrThrow({ where: { subdomain: "aurelia" } });
let designer;
let client;
let visitor;
try {
  // ── 1. Payments settings: Designer only ────────────────────────────────
  designer = await login("designer@studio.test");
  await designer.goto(`${BASE}/admin/sites/${aurelia.id}/settings`);
  await designer.locator("[data-payments-link]").click();
  await designer.waitForURL(/\/settings\/payments$/);
  const saved = (await designer.locator("[data-saved-key]").textContent()) ?? "";
  if (saved !== "sk_test_…2026") fail(`Saved key shows as ${saved}`);
  if ((await designer.content()).includes("aureliaDemoKeyNotReal")) fail("The full Stripe key reached the browser");
  if (!(await designer.locator("[data-webhook-url]").textContent())?.endsWith("/api/webhooks/stripe")) fail("Webhook URL missing");
  const saveReq = designer.waitForRequest((r) => r.method() === "POST" && !!r.headers()["next-action"]);
  await designer.locator('input[name="shippingCountries"]').fill("US, CA, GB, FR, ES, DE");
  await designer.locator("[data-save-payments]").click();
  const paymentsReq = await saveReq;
  await designer.getByText("Payment settings saved.").waitFor();
  const stored = await prisma.store.findUniqueOrThrow({ where: { siteId: aurelia.id } });
  if (!stored.stripeSecretKey?.startsWith("v1.") || stored.stripeSecretKey.includes("sk_test")) fail("The Stripe key isn't encrypted at rest");
  if (!stored.shippingCountries.includes("DE")) fail("Shipping countries weren't saved");
  await designer.screenshot({ path: path.join(SHOTS, "shop-01-payments.png") });

  client = await login("client@aurelia.test");
  const settingsRes = await client.goto(`${BASE}/admin/sites/${aurelia.id}/settings/payments`);
  if ((await client.locator("[data-payments-form]").count()) || settingsRes.status() === 200 && (await client.content()).includes("Webhook signing secret")) fail("A Client Admin can open Payments");
  const replayed = await replay(client, paymentsReq, ([input]) => [{ ...input, settings: { ...input.settings, stripeSecretKey: "sk_test_attackerKey12345678" } }]);
  if (!replayed.includes("permission")) fail(`Client replay of payment settings wasn't refused: ${replayed.slice(0, 200)}`);
  if ((await prisma.store.findUniqueOrThrow({ where: { siteId: aurelia.id } })).stripeSecretKey !== stored.stripeSecretKey) fail("The client's replay changed the Stripe key");
  step("Payments are Designer-only: the key shows masked (sk_test_…2026) and is encrypted at rest; a Client Admin has no screen and a replayed save is refused");

  // ── 2. Catalog: a Client Admin adds a product and restocks a variant ─────
  await client.goto(`${BASE}/admin/sites/${aurelia.id}/products`);
  await client.locator('[data-product-row="linen-cushion-cover"]').waitFor();
  if (await client.locator('[data-product-row="walnut-serving-tray"]').count() !== 1) fail("Draft products missing from the admin list");
  await client.locator("[data-new-product]").click();
  await client.getByLabel("Product name").fill("Oak Bookends");
  await client.getByRole("button", { name: "Create and edit" }).click();
  await client.waitForURL(/\/products\/c[a-z0-9]+$/);
  const form = client.locator("[data-product-form]");
  await form.locator('textarea[name="description"]').fill("A pair of solid white-oak bookends, oiled by hand.");
  await form.locator('input[name="price"]').fill("38");
  await form.locator('input[name="sku"]').fill("AUR-BK-02");
  await form.locator('input[name="inventory"]').fill("4");
  await form.locator("[data-pick-images]").click();
  await client.locator("[data-pick]").first().click();
  await client.locator("[data-media-done]").click();
  await form.locator('[data-product-images] li').first().waitFor();
  await form.locator('input[name="status"][value="ACTIVE"]').check();
  await form.locator("[data-save-product]").click();
  await client.getByText("Saved. It's live in the shop.").waitFor();
  const bookends = await prisma.product.findFirstOrThrow({ where: { siteId: aurelia.id, slug: "oak-bookends" } });
  if (bookends.price !== 3800 || bookends.inventory !== 4 || bookends.status !== "ACTIVE" || bookends.images.length !== 1) fail(`Bookends saved wrong: ${JSON.stringify(bookends)}`);
  await client.screenshot({ path: path.join(SHOTS, "shop-02-product-form.png"), fullPage: true });

  const cushion = await prisma.product.findFirstOrThrow({ where: { siteId: aurelia.id, slug: "linen-cushion-cover" } });
  await client.goto(`${BASE}/admin/sites/${aurelia.id}/products/${cushion.id}`);
  await client.locator('[data-variant-row="Sage / 60 cm"] [data-variant-stock]').fill("2");
  await client.locator("[data-save-product]").click();
  await client.getByText("Saved. It's live in the shop.").waitFor();
  if ((await variantStock("Sage / 60 cm")) !== 2) fail("Variant restock wasn't saved");
  if ((await prisma.productVariant.count({ where: { productId: cushion.id } })) !== 4) fail("Saving changed the variant set");
  step("A Client Admin adds “Oak Bookends” ($38.00, 4 in stock, photo from the media library) and restocks the Sage / 60 cm cushion variant");

  // ── 3. Storefront ────────────────────────────────────────────────────────
  const vctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  visitor = await vctx.newPage();
  await visitor.goto(`${S}/store`);
  const grid = visitor.locator('[data-w="productgrid"]');
  await grid.locator("[data-product-card]").first().waitFor();
  const slugs = await grid.locator("[data-product-card]").evaluateAll((els) => els.map((e) => e.getAttribute("data-product-card")));
  if (slugs.join() !== "oak-bookends,linen-cushion-cover,stoneware-bud-vase,beeswax-candle-set,studio-gift-card") fail(`Grid shows ${slugs.join()}`);
  await grid.locator("[data-grid-sort] select").selectOption("price-asc");
  const sorted = await grid.locator("[data-product-card]").evaluateAll((els) => els.map((e) => e.getAttribute("data-product-card")));
  if (sorted[0] !== "beeswax-candle-set" || sorted.at(-1) !== "studio-gift-card") fail(`Price sort gave ${sorted.join()}`);
  if (!(await grid.locator('[data-product-card="linen-cushion-cover"]').textContent())?.includes("From $48.00")) fail("Variant product card doesn't say From $48.00");
  await visitor.screenshot({ path: path.join(SHOTS, "shop-03-grid.png"), fullPage: true });
  step("The product grid lists the five active products newest first (the draft tray stays hidden) and visitors can re-sort by price");

  await grid.locator('[data-add-to-cart="stoneware-bud-vase"]').click();
  const drawer = visitor.locator("[data-cart-drawer]");
  await drawer.waitFor();
  if ((await drawer.locator("[data-cart-subtotal]").textContent()) !== "$65.00") fail("Subtotal after one vase isn't $65.00");
  await drawer.locator("[data-qty-inc]").click();
  if ((await drawer.locator("[data-cart-subtotal]").textContent()) !== "$130.00") fail("Subtotal after two vases isn't $130.00");
  await drawer.locator("[data-qty-inc]").click();
  if ((await drawer.locator('input[type="number"]').inputValue()) !== "3" || !(await drawer.locator("[data-qty-inc]").isDisabled())) fail("Quantity can go past the 3 in stock");
  await drawer.locator("[data-qty-dec]").click();
  await drawer.locator("[data-cart-close]").click();
  if ((await visitor.locator("[data-cart-count]").textContent()) !== "2") fail("Cart count isn't 2");
  step("Add to cart opens the slide-out drawer; quantity controls update the subtotal ($65.00 → $130.00) and stop at the stock level");

  await visitor.goto(`${S}/products/linen-cushion-cover`);
  const pdp = visitor.locator('[data-w="product"]');
  await pdp.locator("h1").getByText("Linen Cushion Cover").waitFor();
  if ((await pdp.locator("[data-product-price]").textContent()) !== "$48.00") fail("Default variant price isn't $48.00");
  await pdp.locator('[data-option="Color"]').selectOption("Sage");
  await pdp.locator('[data-option="Size"]').selectOption("60 cm");
  if ((await pdp.locator("[data-product-price]").textContent()) !== "$58.00") fail("Sage / 60 cm price isn't $58.00");
  if ((await pdp.locator("[data-stock]").textContent()) !== "Only 2 left") fail("Stock message for Sage / 60 cm is wrong");
  const ld = await visitor.locator('script[type="application/ld+json"]').first().textContent();
  if (!ld.includes('"@type":"Product"') || !ld.includes('"price":48') || !ld.includes("InStock")) fail(`Product JSON-LD: ${ld}`);
  await pdp.locator('[data-add-to-cart="linen-cushion-cover"]').click();
  await drawer.waitFor();
  if ((await drawer.locator("[data-cart-subtotal]").textContent()) !== "$188.00") fail("Subtotal isn't $188.00");
  if (!(await drawer.locator('[data-cart-line]').nth(1).textContent())?.includes("Sage / 60 cm")) fail("Variant title missing from the cart line");
  await visitor.waitForTimeout(400); // let the drawer finish sliding in
  await visitor.screenshot({ path: path.join(SHOTS, "shop-04-cart-drawer.png") });
  await visitor.reload();
  await visitor.waitForFunction(() => document.querySelector("[data-cart-count]")?.textContent === "3");
  const storedCart = await visitor.evaluate(() => JSON.parse(localStorage.getItem("wb_cart_aurelia") ?? "null"));
  if (storedCart?.lines?.length !== 2 || storedCart.currency !== "USD") fail(`localStorage cart: ${JSON.stringify(storedCart)}`);
  if ((await get("/sites/aurelia/products/walnut-serving-tray")).status !== 404) fail("A draft product page isn't a 404");
  step("The product page's variant selectors update price ($58.00) and stock (Only 2 left), add the variant to the cart ($188.00), and the cart survives a reload from localStorage; draft products are 404s");

  // ── 4. Checkout → Stripe session ─────────────────────────────────────────
  const ordersBefore = await prisma.order.count({ where: { siteId: aurelia.id } });
  await visitor.locator("[data-cart-toggle]").click();
  await drawer.locator("[data-checkout]").click();
  await visitor.waitForURL(/127\.0\.0\.1:\d+\/pay\/cs_test_mock_/);
  const sreq = stripe.requests.at(-1);
  if (sreq.auth !== "Bearer sk_test_aureliaDemoKeyNotReal2026") fail("Checkout didn't use the site's decrypted Stripe key");
  const items = sreq.params.line_items.map((l) => `${l.price_data.product_data.name}|${l.quantity}|${l.price_data.unit_amount}|${l.price_data.currency}`);
  if (items.join() !== "Stoneware Bud Vase|2|6500|usd,Linen Cushion Cover (Sage / 60 cm)|1|5800|usd") fail(`Stripe line items: ${items.join()}`);
  if (!sreq.params.line_items[0].price_data.product_data.images?.[0]?.startsWith("http://localhost:3000/uploads/")) fail("Line item images aren't absolute URLs");
  if (sreq.params.metadata.siteId !== aurelia.id || !sreq.params.client_reference_id) fail("Session metadata doesn't name the site and order");
  if (!sreq.params.success_url.startsWith(`${S}/products/linen-cushion-cover?checkout=success&order=`) || sreq.params.cancel_url !== `${S}/products/linen-cushion-cover?checkout=cancelled`) fail(`Return URLs: ${sreq.params.success_url} ${sreq.params.cancel_url}`);
  if (!sreq.params.shipping_address_collection?.allowed_countries?.includes("DE")) fail("Shipping countries didn't reach Stripe");
  if (sreq.params.locale !== "en" || sreq.params.mode !== "payment") fail(`Locale/mode: ${sreq.params.locale} ${sreq.params.mode}`);
  const order = await prisma.order.findFirstOrThrow({ where: { id: sreq.params.client_reference_id, siteId: aurelia.id }, include: { items: true } });
  if (order.status !== "PENDING" || order.totalAmount !== 18800 || order.items.length !== 2 || order.currency !== "USD" || (await prisma.order.count({ where: { siteId: aurelia.id } })) !== ordersBefore + 1) fail(`Pending order: ${JSON.stringify(order)}`);
  if (!order.stripeSessionId?.startsWith("cs_test_mock_")) fail("Order isn't linked to the Stripe session");
  await visitor.locator("[data-mock-total]").getByText("18800 usd").waitFor();
  await visitor.screenshot({ path: path.join(SHOTS, "shop-05-mock-stripe.png") });
  step(`Checkout builds a Stripe session with the database's prices (2 × $65.00, 1 × $58.00 in USD), absolute images, site metadata, return links and shipping countries; order #${order.number} waits as PENDING`);

  // ── 5. Pay → webhook → order paid, stock down, once ──────────────────────
  const vaseBefore = await stockOf("stoneware-bud-vase");
  await visitor.locator("[data-mock-pay]").click();
  await visitor.waitForURL((u) => u.pathname === "/sites/aurelia/products/linen-cushion-cover");
  const thanks = visitor.locator('[data-cart-notice="success"]');
  await thanks.waitFor();
  if (!(await thanks.textContent()).includes(`#${order.number}`)) fail("The thank-you message doesn't name the order");
  if ((await visitor.locator("[data-cart-count]").textContent()) !== "0" || (await drawer.locator("[data-cart-empty]").count()) !== 1) fail("The cart wasn't emptied after paying");
  if (visitor.url().includes("checkout=")) fail("Return parameters stayed in the address bar");
  await visitor.waitForTimeout(400); // let the drawer finish sliding in
  await visitor.screenshot({ path: path.join(SHOTS, "shop-06-thank-you.png") });
  const hook = stripe.webhooks.at(-1);
  if (hook.status !== 200 || hook.body?.status !== "PAID") fail(`Webhook answered ${hook.status} ${JSON.stringify(hook.body)}`);
  const paid = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  if (paid.status !== "PAID" || paid.customerEmail !== "ada@example.com" || paid.customerName !== "Ada Lovelace" || paid.stripePaymentIntentId !== `pi_mock_${order.stripeSessionId.split("_").pop()}` || !paid.paidAt || paid.shippingAddr?.address?.city !== "Boston") fail(`Paid order: ${JSON.stringify(paid)}`);
  if ((await stockOf("stoneware-bud-vase")) !== vaseBefore - 2 || (await variantStock("Sage / 60 cm")) !== 1) fail("Stock didn't go down by what was bought");
  // The live pages show the new stock straight away (the webhook expires the site's cache).
  await visitor.reload();
  await pdp.locator('[data-option="Color"]').selectOption("Sage");
  await pdp.locator('[data-option="Size"]').selectOption("60 cm");
  if ((await pdp.locator("[data-stock]").textContent()) !== "Only 1 left") fail("The product page still shows the old stock");
  step(`Paying sends a signed checkout.session.completed: order #${order.number} is PAID with Ada's email and shipping address, the vase drops ${vaseBefore} → ${vaseBefore - 2} and Sage / 60 cm 2 → 1, and the shopper sees a thank-you with an empty cart`);

  const again = await webhook(hook.payload, sign(hook.payload, WEBHOOK_SECRET));
  if (again.status !== 200 || (await stockOf("stoneware-bud-vase")) !== vaseBefore - 2) fail("A duplicate delivery took stock again");
  const tampered = hook.payload.replace('"amount_total":18800', '"amount_total":1');
  if ((await webhook(tampered, sign(hook.payload, WEBHOOK_SECRET))).status !== 400) fail("A tampered payload was accepted");
  if ((await webhook(hook.payload, null)).status !== 400) fail("An unsigned event was accepted");
  if ((await webhook(hook.payload, sign(hook.payload, "whsec_someoneElsesSecret123"))).status !== 400) fail("An event signed with another secret was accepted");
  if ((await webhook(hook.payload, sign(hook.payload, WEBHOOK_SECRET, Math.floor(Date.now() / 1000) - 3600))).status !== 400) fail("A replayed hour-old event was accepted");
  const northwind = await prisma.site.findUniqueOrThrow({ where: { subdomain: "northwind" } });
  const crossSite = JSON.parse(hook.payload);
  crossSite.data.object.metadata.siteId = northwind.id;
  const crossPayload = JSON.stringify(crossSite);
  if ((await webhook(crossPayload, sign(crossPayload, WEBHOOK_SECRET))).status !== 400) fail("An event naming another site was accepted");
  if ((await webhook(JSON.stringify({ id: "evt_x", type: "customer.created", data: { object: {} } }), null)).json?.ignored !== "customer.created") fail("Unrelated event types aren't acknowledged");
  step("Webhook guardrails: a duplicate delivery is a no-op; tampered, unsigned, wrongly signed, stale and cross-site events get 400 and change nothing");

  // ── 6. Checkout guardrails ───────────────────────────────────────────────
  const vase = await prisma.product.findFirstOrThrow({ where: { siteId: aurelia.id, slug: "stoneware-bud-vase" } });
  const tray = await prisma.product.findFirstOrThrow({ where: { siteId: aurelia.id, slug: "walnut-serving-tray" } });
  const oversold = await checkoutApi("aurelia", { items: [{ productId: vase.id, variantId: null, quantity: 5 }], path: "/sites/aurelia/store" });
  if (oversold.status !== 409 || oversold.json.problems?.[0]?.available !== 1 || !/Only 1 left/.test(oversold.json.error)) fail(`Oversold cart: ${JSON.stringify(oversold)}`);
  const draft = await checkoutApi("aurelia", { items: [{ productId: tray.id, variantId: null, quantity: 1 }], path: "/sites/aurelia/store" });
  if (draft.status !== 409 || draft.json.problems?.[0]?.available !== 0) fail(`Draft product checkout: ${JSON.stringify(draft)}`);
  const noVariant = await checkoutApi("aurelia", { items: [{ productId: cushion.id, variantId: null, quantity: 1 }], path: "/" });
  if (noVariant.status !== 409) fail("A variant product went through without a variant");
  const priced = await checkoutApi("aurelia", { items: [{ productId: vase.id, variantId: null, quantity: 1, price: 1 }], path: "/" });
  if (priced.status !== 400) fail("A client-sent price was accepted");
  const evil = await checkoutApi("aurelia", { items: [{ productId: vase.id, variantId: null, quantity: 1 }], path: "/" }, { origin: "https://evil.example" });
  if (evil.status !== 403) fail("A cross-origin checkout was accepted");
  const openRedirect = await checkoutApi("aurelia", { items: [{ productId: vase.id, variantId: null, quantity: 1 }], path: "//evil.example/x" });
  if (openRedirect.status !== 400) fail("A protocol-relative return path was accepted");
  const nwCheckout = await checkoutApi("northwind", { items: [{ productId: vase.id, variantId: null, quantity: 1 }], path: "/" });
  if (nwCheckout.status !== 409 || !/isn't taking orders/.test(nwCheckout.json.error)) fail(`Northwind checkout: ${JSON.stringify(nwCheckout)}`);
  if ((await prisma.order.count({ where: { siteId: northwind.id } })) !== 0) fail("Northwind got an order");
  step("Checkout guardrails: oversold (only 1 left), draft, variant-less, client-priced, cross-origin and open-redirect carts are refused, and Northwind (no Stripe) can't sell Aurelia's products");

  const candles = await prisma.product.findFirstOrThrow({ where: { siteId: aurelia.id, slug: "beeswax-candle-set" } });
  const started = await checkoutApi("aurelia", { items: [{ productId: candles.id, variantId: null, quantity: 1 }], path: "/sites/aurelia/store", locale: "fr-FR" });
  if (started.status !== 200 || stripe.requests.at(-1).params.locale !== "fr") fail(`Second checkout: ${JSON.stringify(started)}`);
  const second = await prisma.order.findFirstOrThrow({ where: { siteId: aurelia.id, status: "PENDING" }, orderBy: { createdAt: "desc" } });
  const expired = await stripe.sendEvent("checkout.session.expired", stripe.sessions.get(second.stripeSessionId), { payment_status: "unpaid" });
  if (expired.status !== 200 || (await prisma.order.findUniqueOrThrow({ where: { id: second.id } })).status !== "CANCELLED") fail("An expired session didn't cancel its order");
  if ((await stockOf("beeswax-candle-set")) !== candles.inventory) fail("An unpaid order took stock");
  step(`An abandoned checkout (Stripe UI in French) expires: order #${second.number} is CANCELLED and its stock was never taken`);

  // ── 7. Orders dashboard and builder ──────────────────────────────────────
  await client.goto(`${BASE}/admin/sites/${aurelia.id}/orders`);
  await client.locator(`[data-order-row="${order.number}"]`).getByText("$188.00").waitFor();
  await client.getByRole("link", { name: /To fulfil/ }).click();
  await client.waitForURL(/status=unfulfilled/);
  await client.locator('nav[aria-label="Filter by status"] [aria-current="true"]').getByText("To fulfil").waitFor();
  await client.locator(`[data-order-row="${order.number}"]`).waitFor();
  if (await client.locator(`[data-order-row="${second.number}"]`).count()) fail("The cancelled order shows under To fulfil");
  await client.locator(`[data-order-row="${order.number}"] a`).click();
  await client.locator("[data-order-items]").getByText("Sage / 60 cm").waitFor();
  await client.locator("[data-order-address]").getByText("12 Garden Row").waitFor();
  await client.screenshot({ path: path.join(SHOTS, "shop-07-order.png"), fullPage: true });
  await client.locator('[data-order-action="FULFILLED"]').click();
  await client.locator('[data-order-status="FULFILLED"]').waitFor();
  const fulfilled = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  if (fulfilled.status !== "FULFILLED" || !fulfilled.fulfilledAt) fail("Order wasn't fulfilled");
  if (!(await prisma.auditLog.findFirst({ where: { siteId: aurelia.id, action: "order.status", targetId: order.id } }))) fail("Fulfilment wasn't audited");
  step(`The orders dashboard filters to “To fulfil”, shows order #${order.number} with its items and shipping address, and the Client Admin marks it fulfilled`);

  const store = await prisma.post.findFirstOrThrow({ where: { siteId: aurelia.id, slug: "store", locale: "" } });
  await designer.goto(`${BASE}/admin/sites/${aurelia.id}/pages/${store.id}/edit`);
  for (const w of ["productgrid", "product", "cart"]) await designer.locator(`[data-palette="${w}"]`).waitFor();
  await designer.locator('[data-node-id="store-grid"] [data-product-card="oak-bookends"]').waitFor();
  await designer.locator('[data-node-id="store-grid"]').click({ position: { x: 5, y: 5 } });
  await designer.locator("[data-grid-order]").selectOption("price-desc");
  await designer.waitForFunction(() => document.querySelector('[data-node-id="store-grid"] [data-product-card]')?.getAttribute("data-product-card") === "studio-gift-card");
  await designer.screenshot({ path: path.join(SHOTS, "shop-08-canvas.png") });
  step("The Visual Builder offers Product grid, Product details and Cart widgets; the canvas renders real products and re-sorts as the designer changes the grid's order");

  console.log("\nE-commerce engine passed.");
} catch (err) {
  for (const [name, p] of [["designer", designer], ["client", client], ["visitor", visitor]]) {
    if (p) await p.screenshot({ path: path.join(SHOTS, `shop-failure-${name}.png`), fullPage: true }).catch(() => {});
  }
  console.error(err);
  process.exitCode = 1;
} finally {
  await browser.close();
  await stripe.close();
  await prisma.$disconnect();
}
