import "./helpers/allow-server-only";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { prisma } from "../src/lib/db";
import { checkEnv, EnvError, resetEnvCache } from "../src/lib/env.mjs";
import { esc, safeHref } from "../src/lib/email/layout";
import { orderReceiptEmail, storeAlertEmail, type OrderEmailData } from "../src/lib/email/templates/orders";
import { siteWelcomeEmail } from "../src/lib/email/templates/welcome";
import { objectPath, s3ConfigFrom, signRequest } from "../src/lib/storage/s3.mjs";
import { orderStatusToken, verifyOrderStatusToken } from "../src/lib/order-status-token";
import { sendEmail } from "../src/lib/email/dispatcher";
import { startResendMock } from "../scripts/resend-mock.mjs";

const VALID = {
  DATABASE_URL: "postgresql://builder:builder@localhost:5432/builder?schema=public",
  SESSION_SECRET: "a-session-secret-that-is-long-enough-123",
  ROOT_DOMAIN: "builder.example.com",
};

describe("environment validator", () => {
  it("accepts a minimal configuration and fills defaults", () => {
    const { env, problems, warnings } = checkEnv(VALID);
    assert.deepEqual(problems, []);
    assert.equal(env?.STORAGE_DRIVER, "local");
    assert.equal(env?.SIGNUPS, "open");
    assert.equal(env?.PORT, 3000);
    assert.ok(warnings.some((w) => w.startsWith("RESEND_API_KEY is not set")));
  });

  it("names every missing required variable with what it's for", () => {
    const { env, problems } = checkEnv({});
    assert.equal(env, null);
    assert.equal(problems.length, 3);
    assert.match(problems[0], /^DATABASE_URL is missing; it should be the Postgres connection string/);
    assert.match(problems[1], /^SESSION_SECRET is missing; .*openssl rand -base64 32/);
    assert.match(problems[2], /^ROOT_DOMAIN \(or NEXT_PUBLIC_PLATFORM_DOMAIN\) is missing/);
  });

  it("treats blank values as missing", () => {
    const { problems } = checkEnv({ ...VALID, DATABASE_URL: "  " });
    assert.match(problems[0], /^DATABASE_URL is missing/);
  });

  it("accepts NEXT_PUBLIC_PLATFORM_DOMAIN as the platform domain", () => {
    const { DATABASE_URL, SESSION_SECRET } = VALID;
    assert.equal(checkEnv({ DATABASE_URL, SESSION_SECRET, NEXT_PUBLIC_PLATFORM_DOMAIN: "Sites.Example.com" }).env?.ROOT_DOMAIN, "sites.example.com");
  });

  it("rejects malformed values without echoing secrets", () => {
    const { problems } = checkEnv({ ...VALID, DATABASE_URL: "mysql://x", SESSION_SECRET: "hunter2", RESEND_API_KEY: "sk_live_123", STRIPE_SECRET_KEY: "pk_live_123", ROOT_DOMAIN: "https://builder.example.com/" });
    const text = problems.join("\n");
    assert.match(text, /DATABASE_URL .*postgres/i);
    assert.match(text, /SESSION_SECRET must be at least 32 characters/);
    assert.match(text, /RESEND_API_KEY must start with re_/);
    assert.match(text, /STRIPE_SECRET_KEY/);
    assert.match(text, /ROOT_DOMAIN/);
    for (const secret of ["hunter2", "sk_live_123", "pk_live_123"]) assert.ok(!text.includes(secret), `echoed ${secret}`);
  });

  it("requires the S3 settings with STORAGE_DRIVER=s3, alongside other problems", () => {
    const { problems } = checkEnv({ ...VALID, SESSION_SECRET: "short", STORAGE_DRIVER: "s3", S3_BUCKET: "uploads" });
    assert.ok(problems.some((p) => p.startsWith("SESSION_SECRET")));
    assert.deepEqual(problems.filter((p) => p.includes("STORAGE_DRIVER=s3")), [
      "S3_ENDPOINT is required when STORAGE_DRIVER=s3.",
      "S3_ACCESS_KEY_ID is required when STORAGE_DRIVER=s3.",
      "S3_SECRET_ACCESS_KEY is required when STORAGE_DRIVER=s3.",
    ]);
    const ok = checkEnv({ ...VALID, STORAGE_DRIVER: "s3", S3_ENDPOINT: "https://r2.example.com", S3_BUCKET: "uploads", S3_ACCESS_KEY_ID: "id", S3_SECRET_ACCESS_KEY: "secret" });
    assert.equal(ok.env?.S3_REGION, "us-east-1");
  });

  it("warns (not fails) about CRON_SECRET only in production", () => {
    assert.ok(!checkEnv(VALID).warnings.some((w) => w.includes("CRON_SECRET")));
    const prod = checkEnv({ ...VALID, NODE_ENV: "production" });
    assert.ok(prod.env);
    assert.ok(prod.warnings.some((w) => w.includes("CRON_SECRET")));
  });

  it("formats EnvError as a bullet list with next steps", () => {
    const err = new EnvError(["A is missing.", "B is wrong."]);
    assert.equal(err.message.split("\n")[0], "Configuration error:");
    assert.ok(err.message.includes("  • A is missing.\n  • B is wrong."));
    assert.match(err.message, /Copy \.env\.example to \.env/);
  });
});

describe("S3 request signing", () => {
  const cfg = { endpoint: "https://s3.example.com", region: "eu-west-1", bucket: "media", accessKeyId: "AKIDEXAMPLE", secretAccessKey: "secret" };
  const now = new Date("2026-10-27T12:00:00Z");

  it("encodes object keys like SigV4 expects, keeping slashes", () => {
    assert.equal(objectPath("site 1/a(b)!*'.webp"), "site%201/a%28b%29%21%2A%27.webp");
  });

  it("signs path-style requests deterministically and leaves Host to fetch", () => {
    const a = signRequest(cfg, { method: "PUT", key: "s/x.webp", body: new Uint8Array([1, 2, 3]), contentType: "image/webp", now });
    const b = signRequest(cfg, { method: "PUT", key: "s/x.webp", body: new Uint8Array([1, 2, 3]), contentType: "image/webp", now });
    assert.deepEqual(a, b);
    assert.equal(a.url, "https://s3.example.com/media/s/x.webp");
    assert.equal(a.headers["x-amz-date"], "20261027T120000Z");
    assert.ok(!("host" in a.headers));
    assert.match(a.headers.authorization, /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/20261027\/eu-west-1\/s3\/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/);
    const other = signRequest({ ...cfg, secretAccessKey: "other" }, { method: "PUT", key: "s/x.webp", body: new Uint8Array([1, 2, 3]), contentType: "image/webp", now });
    assert.notEqual(other.headers.authorization, a.headers.authorization);
  });

  it("hashes an empty body for reads", () => {
    assert.equal(signRequest(cfg, { key: "k", now }).headers["x-amz-content-sha256"], "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("reads its settings only when the driver is s3", () => {
    assert.equal(s3ConfigFrom({ STORAGE_DRIVER: "local" }), null);
    assert.throws(() => s3ConfigFrom({ STORAGE_DRIVER: "s3" }), /S3_ENDPOINT/);
  });
});

const order = (over: Partial<OrderEmailData> = {}): OrderEmailData => ({
  brand: { name: "Aurelia <Interiors>", accent: "#8a5a2b" },
  number: 1042,
  currency: "USD",
  locale: "",
  customerName: "<b>Ada</b> Lovelace",
  customerEmail: "ada@example.com",
  items: [
    { title: "Vase & Bowl", variantTitle: "Sage", sku: "AUR-1", quantity: 2, price: 6500, digital: false },
    { title: "Care guide", variantTitle: null, sku: null, quantity: 1, price: 0, digital: true },
  ],
  taxAmount: 1240,
  shippingAmount: 0,
  totalAmount: 14240,
  shippingAddr: { name: "Ada", address: { line1: "12 Garden Row", line2: null, postal_code: "02108", city: "Boston", state: "MA", country: "US" } },
  paidAt: new Date("2026-10-27T10:00:00Z"),
  ...over,
});

describe("email templates", () => {
  it("escapes HTML and refuses non-http links", () => {
    assert.equal(esc(`<a href="x">'&'</a>`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
    assert.equal(safeHref("javascript:alert(1)"), "#");
    assert.equal(safeHref("https://a.test/?a=1&b=2"), "https://a.test/?a=1&amp;b=2");
  });

  it("renders the receipt with items, totals, address and status link", () => {
    const r = orderReceiptEmail(order(), "https://builder.example.com/order-status/o1?t=abc");
    assert.equal(r.subject, "Your Aurelia <Interiors> order #1042");
    assert.ok(!r.html.includes("<b>Ada</b>"));
    assert.ok(r.html.includes("Thanks, &lt;b&gt;Ada&lt;/b&gt;!"));
    assert.ok(r.html.includes("Aurelia &lt;Interiors&gt;"));
    assert.ok(r.html.includes("Vase &amp; Bowl"));
    for (const s of ["$130.00", "$12.40", "$142.40", "12 Garden Row", "02108 Boston", "https://builder.example.com/order-status/o1?t=abc"]) assert.ok(r.html.includes(s), s);
    assert.ok(!r.html.includes(">Shipping<"), "zero shipping is hidden");
    assert.ok(r.text.includes("Total: $142.40"));
    assert.ok(r.text.includes("12 Garden Row"));
  });

  it("formats money in the order's currency and language", () => {
    const r = orderReceiptEmail(order({ currency: "EUR", locale: "fr", totalAmount: 14240 }), "https://x.test/");
    assert.match(r.html, /142,40\s€/);
  });

  it("marks store alerts by what needs to happen", () => {
    const physical = storeAlertEmail(order(), "https://builder.example.com/admin/sites/s/orders/o1");
    assert.match(physical.subject, /^\[Ship\] /);
    assert.ok(physical.html.includes("Ship within 2 business days"));
    assert.ok(physical.html.includes("AUR-1"));
    const digital = storeAlertEmail(order({ items: [order().items[1]], shippingAddr: null }), "https://x.test/");
    assert.ok(!digital.subject.startsWith("[Ship]"));
    assert.ok(digital.html.includes("nothing to ship"));
  });

  it("welcomes a new site owner with editor and live links", () => {
    const w = siteWelcomeEmail({ recipientName: "Lena", siteName: "Lumen", templateName: "Coffee Roasters", accent: null, editorUrl: "https://b.test/edit", siteUrl: "https://b.test/sites/lumen", designUrl: "https://b.test/design" });
    assert.equal(w.subject, "Lumen is ready to edit");
    for (const s of ["https://b.test/edit", "https://b.test/sites/lumen", "Coffee Roasters"]) assert.ok(w.html.includes(s), s);
    assert.ok(w.text.includes("https://b.test/edit"));
  });
});

describe("order status tokens", () => {
  it("verifies only the token for that order", () => {
    const t = orderStatusToken("order_1");
    assert.equal(t.length, 32);
    assert.ok(verifyOrderStatusToken("order_1", t));
    assert.ok(!verifyOrderStatusToken("order_2", t));
    assert.ok(!verifyOrderStatusToken("order_1", t.slice(0, -1) + (t.endsWith("A") ? "B" : "A")));
    assert.ok(!verifyOrderStatusToken("order_1", null));
  });
});

describe("email dispatcher", () => {
  const run = `unit-${Date.now().toString(36)}`;
  const msg = (n: string) => ({ to: "ada@example.com", subject: `Test ${n}`, html: "<p>hi</p>", text: "hi", tag: "test.unit", idempotencyKey: `${run}:${n}` });
  let resend: { emails: { idempotencyKey: string; to: string[]; from: string }[]; close: () => Promise<void>; url: string };
  const saved = { key: process.env.RESEND_API_KEY, base: process.env.RESEND_API_BASE };

  before(async () => {
    resend = await startResendMock({ port: 4253 });
  });
  after(async () => {
    process.env.RESEND_API_KEY = saved.key;
    process.env.RESEND_API_BASE = saved.base;
    resetEnvCache();
    await prisma.emailLog.deleteMany({ where: { idempotencyKey: { startsWith: run } } });
    await resend.close();
    await prisma.$disconnect();
  });

  it("logs instead of sending without a Resend key", async () => {
    delete process.env.RESEND_API_KEY;
    resetEnvCache();
    const out = await sendEmail(msg("logged"));
    assert.equal(out.status, "LOGGED");
    assert.equal((await prisma.emailLog.findUniqueOrThrow({ where: { idempotencyKey: `${run}:logged` } })).status, "LOGGED");
    assert.equal(resend.emails.length, 0);
  });

  it("sends through Resend once per idempotency key", async () => {
    process.env.RESEND_API_KEY = "re_e2e_test_key";
    process.env.RESEND_API_BASE = resend.url;
    resetEnvCache();
    const first = await sendEmail(msg("sent"));
    assert.equal(first.status, "SENT");
    assert.equal((await sendEmail(msg("sent"))).status, "DUPLICATE");
    assert.equal(resend.emails.filter((e) => e.idempotencyKey === `${run}:sent`).length, 1);
    const row = await prisma.emailLog.findUniqueOrThrow({ where: { idempotencyKey: `${run}:sent` } });
    assert.equal(row.status, "SENT");
    assert.equal(row.providerId, (first as { id: string }).id);
  });

  it("records a failure without throwing, and retries it next time", async () => {
    process.env.RESEND_API_KEY = "re_wrong_key";
    resetEnvCache();
    const failed = await sendEmail(msg("retry"));
    assert.equal(failed.status, "FAILED");
    const row = await prisma.emailLog.findUniqueOrThrow({ where: { idempotencyKey: `${run}:retry` } });
    assert.equal(row.status, "FAILED");
    assert.match(row.error ?? "", /Resend 401/);

    process.env.RESEND_API_KEY = "re_e2e_test_key";
    resetEnvCache();
    assert.equal((await sendEmail(msg("retry"))).status, "SENT");
    assert.equal((await prisma.emailLog.findUniqueOrThrow({ where: { idempotencyKey: `${run}:retry` } })).status, "SENT");
    assert.equal((await sendEmail(msg("retry"))).status, "DUPLICATE");
  });

  it("refuses a message with no recipient", async () => {
    assert.deepEqual(await sendEmail({ ...msg("none"), to: " " }), { status: "FAILED", error: "No recipient" });
  });
});
