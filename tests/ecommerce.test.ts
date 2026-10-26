import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { prisma } from "../src/lib/db";
import { tenantDb } from "../src/lib/tenant-db";
import { structuralProblem as validateDocument } from "../src/lib/builder/tree";
import type { BuilderDocument } from "../src/lib/builder/types";
import { addLine, cartCount, cartSubtotal, emptyCart, lineKey, readCart, removeLine, setQuantity, type CartLine } from "../src/lib/commerce/cart";
import { formatMoney, moneyInput, parseMoney } from "../src/lib/commerce/money";
import { formEncode } from "../src/lib/commerce/stripe-form";
import { signPayload, verifySignature } from "../src/lib/commerce/stripe-signature";
import { fromPrice, gridProducts } from "../src/lib/commerce/storefront";
import type { PublicProduct } from "../src/lib/commerce/types";
import { attributesKey, matchVariant, optionsSchema, variantCombos } from "../src/lib/commerce/variants";
import { compileHtml } from "../src/lib/export/compile";
import { decryptSecret, encryptSecret } from "../src/server/crypto";

const line = (over: Partial<CartLine> = {}): CartLine => ({ productId: "p1", variantId: null, title: "Vase", variantTitle: null, price: 6500, image: null, quantity: 1, max: 3, href: "/products/vase", ...over });

describe("money", () => {
  it("parses what people type into minor units", () => {
    assert.equal(parseMoney("12.5", "USD"), 1250);
    assert.equal(parseMoney("12,50", "EUR"), 1250);
    assert.equal(parseMoney("1,299.00", "USD"), 129900);
    assert.equal(parseMoney("1 299", "USD"), 129900);
    assert.equal(parseMoney("500", "JPY"), 500);
    assert.equal(parseMoney("-3", "USD"), null);
    assert.equal(parseMoney("abc", "USD"), null);
    assert.equal(parseMoney("", "USD"), null);
    assert.equal(moneyInput(129900, "USD"), "1299.00");
    assert.equal(moneyInput(null, "USD"), "");
  });

  it("formats per language", () => {
    assert.equal(formatMoney(4800, "USD", "en-US"), "$48.00");
    assert.equal(formatMoney(4800, "EUR", "fr-FR").replace(/\s/g, " "), "48,00 €");
    assert.equal(formatMoney(500, "JPY", "en-US"), "¥500");
  });
});

describe("cart", () => {
  it("adds, tops up and caps quantities at stock", () => {
    let cart = addLine(emptyCart("USD"), line(), "USD");
    cart = addLine(cart, line({ quantity: 5 }), "USD");
    assert.equal(cart.lines.length, 1);
    assert.equal(cart.lines[0].quantity, 3, "capped at the 3 in stock");
    cart = addLine(cart, line({ productId: "p2", price: 2400, max: null, quantity: 2 }), "USD");
    assert.equal(cartCount(cart), 5);
    assert.equal(cartSubtotal(cart), 3 * 6500 + 2 * 2400);
  });

  it("keeps variants of one product apart", () => {
    let cart = addLine(emptyCart("USD"), line({ variantId: "v1" }), "USD");
    cart = addLine(cart, line({ variantId: "v2" }), "USD");
    assert.equal(cart.lines.length, 2);
    assert.notEqual(lineKey(cart.lines[0]), lineKey(cart.lines[1]));
  });

  it("updates and removes lines; zero removes", () => {
    let cart = addLine(emptyCart("USD"), line(), "USD");
    cart = setQuantity(cart, "p1:", 2);
    assert.equal(cart.lines[0].quantity, 2);
    cart = setQuantity(cart, "p1:", 99);
    assert.equal(cart.lines[0].quantity, 3);
    assert.equal(setQuantity(cart, "p1:", 0).lines.length, 0);
    assert.equal(removeLine(cart, "p1:").lines.length, 0);
  });

  it("starts over when the shop's currency changes", () => {
    const cart = addLine(emptyCart("USD"), line(), "USD");
    assert.deepEqual(addLine(cart, line({ productId: "p9" }), "EUR").lines.map((l) => l.productId), ["p9"]);
  });

  it("only trusts well-formed stored carts", () => {
    assert.deepEqual(readCart(null, "USD"), emptyCart("USD"));
    assert.deepEqual(readCart({ currency: "EUR", lines: [line()] }, "USD"), emptyCart("USD"));
    const stored = readCart({ currency: "USD", lines: [line({ quantity: 7 }), { productId: 3 }, line({ productId: "x", price: -1 }), line({ productId: "y", quantity: 0 })] }, "USD");
    assert.equal(stored.lines.length, 1);
    assert.equal(stored.lines[0].quantity, 3);
  });
});

describe("variants", () => {
  const options = [
    { name: "Color", values: ["Sand", "Sage"] },
    { name: "Size", values: ["45 cm", "60 cm"] },
  ];

  it("builds every combination in option order", () => {
    assert.deepEqual(
      variantCombos(options).map((c) => c.title),
      ["Sand / 45 cm", "Sand / 60 cm", "Sage / 45 cm", "Sage / 60 cm"],
    );
    assert.deepEqual(variantCombos([]), []);
  });

  it("matches a full selection regardless of key order", () => {
    const variants = variantCombos(options).map((c, i) => ({ id: `v${i}`, attributes: c.attributes }));
    assert.equal(matchVariant(variants, options, { Size: "60 cm", Color: "Sage" })?.id, "v3");
    assert.equal(matchVariant(variants, options, { Color: "Sage" }), undefined);
    assert.equal(attributesKey(options, { Size: "S", Color: "C" }), attributesKey(options, { Color: "C", Size: "S" }));
  });

  it("rejects duplicate options, duplicate values and huge matrices", () => {
    assert.ok(optionsSchema.safeParse(options).success);
    assert.ok(!optionsSchema.safeParse([{ name: "Size", values: ["S"] }, { name: "size", values: ["M"] }]).success);
    assert.ok(!optionsSchema.safeParse([{ name: "Size", values: ["S", "s"] }]).success);
    const many = Array.from({ length: 11 }, (_, i) => `v${i}`);
    assert.ok(!optionsSchema.safeParse([{ name: "A", values: many }, { name: "B", values: many }]).success);
  });
});

describe("storefront grid", () => {
  const product = (id: string, price: number, createdAt: string, available = true): PublicProduct => ({
    id, slug: id, title: id.toUpperCase(), description: "", price, compareAtPrice: null, images: [], options: [], variants: [], stock: available ? 1 : 0, available, path: `/products/${id}`, createdAt,
  });
  const all = [product("a", 3000, "2026-01-01"), product("b", 1000, "2026-03-01", false), product("c", 2000, "2026-02-01")];

  it("sorts, filters and limits the same way on server and client", () => {
    assert.deepEqual(gridProducts(all, { limit: 6, sort: "newest", inStockOnly: false }).map((p) => p.id), ["b", "c", "a"]);
    assert.deepEqual(gridProducts(all, { limit: 6, sort: "price-asc", inStockOnly: true }).map((p) => p.id), ["c", "a"]);
    assert.deepEqual(gridProducts(all, { limit: 1, sort: "price-desc", inStockOnly: false }).map((p) => p.id), ["a"]);
    assert.equal(all[0].id, "a", "the input isn't reordered");
  });

  it("quotes the cheapest variant", () => {
    assert.equal(fromPrice({ ...all[0], variants: [{ id: "x", title: "x", price: 900, attributes: {}, stock: 1, available: true }, { id: "y", title: "y", price: 1200, attributes: {}, stock: 1, available: true }] }), 900);
  });
});

describe("Stripe webhook signatures", () => {
  const secret = "whsec_test_secret_123456";
  const body = JSON.stringify({ id: "evt_1", type: "checkout.session.completed" });

  it("accepts a correctly signed, fresh payload", () => {
    const now = 1_800_000_000;
    assert.deepEqual(verifySignature(body, signPayload(body, secret, now), secret, now + 10), { ok: true });
    // Stripe may send several v1 signatures while a secret rotates.
    const header = `t=${now},v1=${"0".repeat(64)},${signPayload(body, secret, now).split(",")[1]}`;
    assert.deepEqual(verifySignature(body, header, secret, now), { ok: true });
  });

  it("rejects tampering, the wrong secret, replays and junk", () => {
    const now = 1_800_000_000;
    const header = signPayload(body, secret, now);
    assert.deepEqual(verifySignature(body.replace("evt_1", "evt_2"), header, secret, now), { ok: false, reason: "mismatch" });
    assert.deepEqual(verifySignature(body, header, "whsec_other_secret_999", now), { ok: false, reason: "mismatch" });
    assert.deepEqual(verifySignature(body, header, secret, now + 301), { ok: false, reason: "expired" });
    assert.deepEqual(verifySignature(body, "t=abc,v1=xyz", secret, now), { ok: false, reason: "malformed" });
    assert.deepEqual(verifySignature(body, null, secret, now), { ok: false, reason: "missing" });
  });
});

describe("Stripe requests", () => {
  it("form-encodes nested line items the way Stripe expects", () => {
    const body = new URLSearchParams(formEncode({ mode: "payment", line_items: [{ quantity: 2, price_data: { currency: "usd", unit_amount: 4800, product_data: { name: "Cushion", images: ["https://x/a.webp"] } } }], skip: undefined }));
    assert.equal(body.get("line_items[0][quantity]"), "2");
    assert.equal(body.get("line_items[0][price_data][unit_amount]"), "4800");
    assert.equal(body.get("line_items[0][price_data][product_data][images][0]"), "https://x/a.webp");
    assert.equal(body.has("skip"), false);
  });
});

describe("secrets at rest", () => {
  it("round-trips and detects tampering", () => {
    process.env.SESSION_SECRET ??= "x".repeat(40);
    const stored = encryptSecret("sk_test_abc123456789");
    assert.ok(stored.startsWith("v1.") && !stored.includes("sk_test"));
    assert.equal(decryptSecret(stored), "sk_test_abc123456789");
    assert.notEqual(encryptSecret("same"), encryptSecret("same"), "random IV");
    const parts = stored.split(".");
    parts[3] = parts[3].slice(0, -2) + (parts[3].endsWith("A") ? "BB" : "AA");
    assert.equal(decryptSecret(parts.join(".")), null);
    assert.equal(decryptSecret(null), null);
  });
});

describe("commerce widgets in documents", () => {
  const doc = (props: Record<string, unknown>, type: "productgrid" | "product" | "cart" = "productgrid"): BuilderDocument => ({
    version: 1,
    rootId: "root",
    nodes: { root: { id: "root", type: "section", props: {}, style: {}, children: ["w"] }, w: { id: "w", type, props, style: {} } },
  });

  it("validates widget settings", () => {
    assert.equal(validateDocument(doc({ limit: 6, sort: "newest", inStockOnly: false, showSort: true, buttonLabel: "Add" })), null);
    assert.match(validateDocument(doc({ limit: 500, sort: "newest", inStockOnly: false, showSort: true, buttonLabel: "Add" })) ?? "", /Product grid/);
    assert.match(validateDocument(doc({ limit: 6, sort: "random", inStockOnly: false, showSort: true, buttonLabel: "Add" })) ?? "", /Product grid/);
    assert.equal(validateDocument(doc({ productId: null, buttonLabel: "Buy" }, "product")), null);
    assert.match(validateDocument(doc({ productId: 42 }, "product")) ?? "", /Product details/);
    assert.match(validateDocument(doc({ label: "x".repeat(41) }, "cart")) ?? "", /Cart/);
  });

  it("static exports keep the catalog but hide carts and checkout", () => {
    const html = `<html><head></head><body><div data-w="cart"><button data-cart-toggle="">Cart</button></div><div data-w="productgrid"><button data-add-to-cart="vase">Add</button></div></body></html>`;
    const out = compileHtml(html, { origin: "http://127.0.0.1:3000", siteKey: "aurelia", baseUrl: "https://example.com" }).html;
    assert.match(out, /data-static-shop/);
    assert.ok(!compileHtml("<html><head></head><body><p>x</p></body></html>", { origin: "http://127.0.0.1:3000", siteKey: "aurelia", baseUrl: "https://example.com" }).html.includes("data-static-shop"));
  });
});

// Integration: against the seeded database (npm run db:seed).
describe("shop data isolation", () => {
  after(() => prisma.$disconnect());

  it("keeps products, variants and orders inside their site", async () => {
    const [aurelia, northwind] = await Promise.all(["aurelia", "northwind"].map((s) => prisma.site.findUniqueOrThrow({ where: { subdomain: s }, select: { id: true } })));
    const aureliaProduct = await prisma.product.findFirstOrThrow({ where: { siteId: aurelia.id, slug: "linen-cushion-cover" }, include: { variants: true } });
    assert.equal(aureliaProduct.variants.length, 4);
    const nw = tenantDb(northwind.id);
    assert.equal(await nw.product.findUnique({ where: { id: aureliaProduct.id } }), null);
    assert.equal(await nw.productVariant.count({ where: { productId: aureliaProduct.id } }), 0);
    assert.equal((await nw.product.updateMany({ where: { id: aureliaProduct.id }, data: { price: 1 } })).count, 0);
    assert.equal(await nw.store.findUnique({ where: { siteId: aurelia.id } }), null);
    await assert.rejects(() => nw.order.create({ data: { siteId: aurelia.id, number: 1, totalAmount: 1, currency: "USD" } }), /another site/);
  });
});
