import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { tenantDb } from "@/lib/tenant-db";
import { MAX_LINES, MAX_QUANTITY } from "@/lib/commerce/cart";
import { decryptSecret } from "../crypto";
import { readStore } from "./store-service";
import { StripeError, createCheckoutSession } from "./stripe";

/**
 * Turns a visitor's cart into a Stripe Checkout session. The cart only says
 * which products and how many: every title, price and stock level is read
 * here from this site's own catalog, an order is created as PENDING with
 * those prices frozen, and the Stripe session carries the order id. The
 * webhook (./webhook.ts) marks it paid.
 */

export const checkoutSchema = z
  .object({
    items: z
      .array(z.object({ productId: z.string().min(1).max(40), variantId: z.string().min(1).max(40).nullable(), quantity: z.number().int().min(1).max(MAX_QUANTITY) }).strict())
      .min(1, "Your cart is empty")
      .max(MAX_LINES),
    /** The page the visitor is on, for Stripe's return links. Path only: the host is the one they're on. */
    path: z.string().max(2048).regex(/^\/(?!\/)[^\s\\]*$/),
    locale: z.string().max(35).optional(),
  })
  .strict();

export interface CheckoutProblem {
  productId: string;
  variantId: string | null;
  message: string;
  /** Units that can still be bought (0 when gone). */
  available: number;
}

export type CheckoutResult =
  | { ok: true; url: string; orderId: string }
  | { ok: false; status: number; error: string; problems?: CheckoutProblem[] };

/** Stripe Checkout's supported UI languages (subset; anything else is "auto"). */
const STRIPE_LOCALES = new Set(["bg", "cs", "da", "de", "el", "en", "en-GB", "es", "es-419", "et", "fi", "fil", "fr", "fr-CA", "hr", "hu", "id", "it", "ja", "ko", "lt", "lv", "ms", "mt", "nb", "nl", "pl", "pt", "pt-BR", "ro", "ru", "sk", "sl", "sv", "th", "tr", "vi", "zh", "zh-HK", "zh-TW"]);
export function stripeLocale(code: string | undefined) {
  if (!code) return "auto";
  if (STRIPE_LOCALES.has(code)) return code;
  const lang = code.split("-")[0].toLowerCase();
  return STRIPE_LOCALES.has(lang) ? lang : "auto";
}

export async function startCheckout(siteKey: string, raw: unknown, origin: string): Promise<CheckoutResult> {
  const host = decodeURIComponent(siteKey).toLowerCase();
  const site = await prisma.site.findFirst({ where: { OR: [{ subdomain: host }, { customDomain: host }], status: { not: "SUSPENDED" } }, select: { id: true } });
  if (!site) return { ok: false, status: 404, error: "Shop not found" };
  const parsed = checkoutSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, status: 400, error: parsed.error.issues[0]?.message ?? "Invalid cart" };
  const input = parsed.data;

  const { store, currency } = await readStore(site.id);
  const secretKey = decryptSecret(store?.stripeSecretKey);
  if (!store?.enabled || !secretKey) return { ok: false, status: 409, error: "This shop isn't taking orders right now" };

  // Same product and variant twice → one line.
  const merged = new Map<string, { productId: string; variantId: string | null; quantity: number }>();
  for (const item of input.items) {
    const key = `${item.productId}:${item.variantId ?? ""}`;
    const prev = merged.get(key);
    merged.set(key, { ...item, quantity: Math.min(MAX_QUANTITY, (prev?.quantity ?? 0) + item.quantity) });
  }

  // Only this site's active products exist as far as checkout is concerned.
  const db = tenantDb(site.id);
  const products = await db.product.findMany({ where: { id: { in: [...new Set(input.items.map((i) => i.productId))] }, status: "ACTIVE" }, include: { variants: true } });
  const byId = new Map(products.map((p) => [p.id, p]));
  const problems: CheckoutProblem[] = [];
  const lines: { productId: string; variantId: string | null; title: string; variantTitle: string | null; sku: string | null; price: number; quantity: number; imageId: string | undefined; isPhysical: boolean }[] = [];
  for (const item of merged.values()) {
    const product = byId.get(item.productId);
    if (!product) {
      problems.push({ ...item, message: "This product is no longer available", available: 0 });
      continue;
    }
    const variant = item.variantId ? product.variants.find((v) => v.id === item.variantId) : undefined;
    if (product.variants.length ? !variant : item.variantId) {
      problems.push({ ...item, message: `Choose an option for ${product.title} again`, available: 0 });
      continue;
    }
    const stock = product.trackInventory ? Math.max(0, variant ? variant.inventory : product.inventory) : null;
    if (stock !== null && item.quantity > stock) {
      problems.push({ ...item, message: stock ? `Only ${stock} left of ${product.title}${variant ? ` (${variant.title})` : ""}` : `${product.title}${variant ? ` (${variant.title})` : ""} is sold out`, available: stock });
      continue;
    }
    lines.push({
      productId: product.id,
      variantId: variant?.id ?? null,
      title: product.title,
      variantTitle: variant?.title ?? null,
      sku: variant?.sku ?? product.sku,
      price: variant?.price ?? product.price,
      quantity: item.quantity,
      imageId: product.images[0],
      isPhysical: product.isPhysical,
    });
  }
  if (problems.length) return { ok: false, status: 409, error: problems[0].message, problems };
  const total = lines.reduce((sum, l) => sum + l.price * l.quantity, 0);
  if (total <= 0) return { ok: false, status: 400, error: "Free orders can't go through card checkout" };

  const order = await prisma.$transaction(async (tx) => {
    const counter = await tx.store.update({ where: { siteId: site.id }, data: { orderCounter: { increment: 1 } }, select: { orderCounter: true } });
    return tx.order.create({
      data: {
        siteId: site.id,
        number: counter.orderCounter,
        totalAmount: total,
        currency,
        locale: input.locale ?? "",
        items: { create: lines.map((l) => ({ siteId: site.id, productId: l.productId, variantId: l.variantId, title: l.title, variantTitle: l.variantTitle, sku: l.sku, price: l.price, quantity: l.quantity })) },
      },
    });
  });

  const assets = await db.mediaAsset.findMany({ where: { id: { in: lines.map((l) => l.imageId).filter((x): x is string => !!x) } }, select: { id: true, url: true } });
  const imageUrl = new Map(assets.map((a) => [a.id, new URL(a.url, origin).toString()]));
  const back = (status: string) => `${origin}${input.path}${input.path.includes("?") ? "&" : "?"}checkout=${status}`;
  try {
    const session = await createCheckoutSession(secretKey, {
      currency,
      lineItems: lines.map((l) => ({ name: l.variantTitle ? `${l.title} (${l.variantTitle})` : l.title, images: l.imageId && imageUrl.get(l.imageId) ? [imageUrl.get(l.imageId)!] : undefined, unitAmount: l.price, quantity: l.quantity })),
      successUrl: `${back("success")}&order=${order.number}`,
      cancelUrl: back("cancelled"),
      locale: stripeLocale(input.locale),
      shippingCountries: lines.some((l) => l.isPhysical) ? (store.shippingCountries.length ? store.shippingCountries : ["US"]) : undefined,
      clientReferenceId: order.id,
      metadata: { siteId: site.id, orderId: order.id, orderNumber: String(order.number) },
      idempotencyKey: `checkout:${order.id}`,
    });
    await prisma.order.update({ where: { id: order.id }, data: { stripeSessionId: session.id } });
    return { ok: true, url: session.url, orderId: order.id };
  } catch (err) {
    await prisma.order.update({ where: { id: order.id }, data: { status: "CANCELLED" } });
    if (err instanceof StripeError) return { ok: false, status: 502, error: err.message };
    throw err;
  }
}
