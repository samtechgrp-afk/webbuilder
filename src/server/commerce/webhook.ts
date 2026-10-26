import "server-only";
import type { Prisma } from "@prisma/client";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/db";
import { verifySignature } from "@/lib/commerce/stripe-signature";
import { decryptSecret } from "../crypto";
import { siteCacheTag } from "../public-site";

/**
 * Stripe webhook processing (POST /api/webhooks/stripe). One endpoint serves
 * every shop: the event names its site in the session metadata, and the
 * signature must verify against *that* site's signing secret before
 * anything in the event is trusted. A site's secret can only vouch for its
 * own orders, so one shop can't touch another's.
 *
 * Idempotent: an order moves PENDING → PAID once (a conditional update), and
 * stock is taken out in the same transaction, so Stripe's retries and
 * duplicate deliveries change nothing.
 */

const HANDLED = new Set(["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed", "checkout.session.expired"]);

export interface WebhookResult {
  status: number;
  body: Record<string, unknown>;
}

interface SessionObject {
  id?: string;
  object?: string;
  client_reference_id?: string | null;
  metadata?: Record<string, string> | null;
  payment_status?: "paid" | "unpaid" | "no_payment_required";
  payment_intent?: string | { id: string } | null;
  amount_total?: number | null;
  currency?: string | null;
  customer_email?: string | null;
  customer_details?: { email?: string | null; name?: string | null } | null;
  shipping_details?: unknown;
  collected_information?: { shipping_details?: unknown } | null;
}

export async function handleStripeWebhook(raw: string, signature: string | null): Promise<WebhookResult> {
  let event: { id?: string; type?: string; data?: { object?: SessionObject } };
  try {
    event = JSON.parse(raw);
  } catch {
    return { status: 400, body: { error: "Invalid payload" } };
  }
  // Nothing happens for other event types, so they're acknowledged unverified.
  if (!event.type || !HANDLED.has(event.type)) return { status: 200, body: { received: true, ignored: event.type ?? null } };

  const session = event.data?.object;
  const siteId = session?.metadata?.siteId;
  const orderId = session?.client_reference_id ?? session?.metadata?.orderId;
  if (!session || session.object !== "checkout.session" || !siteId || !orderId) return { status: 400, body: { error: "Not a shop checkout session" } };

  const store = await prisma.store.findUnique({ where: { siteId }, select: { stripeWebhookSecret: true } });
  const secret = decryptSecret(store?.stripeWebhookSecret);
  if (!secret) return { status: 400, body: { error: "Webhook signing secret not configured for this shop" } };
  const check = verifySignature(raw, signature, secret);
  if (!check.ok) return { status: 400, body: { error: `Signature ${check.reason}` } };

  // Verified: from here the event is the shop's own Stripe account talking.
  const order = await prisma.order.findFirst({ where: { id: orderId, siteId }, include: { items: true } });
  if (!order || (order.stripeSessionId && order.stripeSessionId !== session.id)) return { status: 200, body: { received: true, ignored: "unknown order" } };

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const customer = {
        customerEmail: session.customer_details?.email ?? session.customer_email ?? order.customerEmail,
        customerName: session.customer_details?.name ?? order.customerName,
        shippingAddr: (session.collected_information?.shipping_details ?? session.shipping_details ?? order.shippingAddr ?? undefined) as Prisma.InputJsonValue | undefined,
        stripeSessionId: session.id ?? order.stripeSessionId,
      };
      if (session.payment_status !== "paid" && session.payment_status !== "no_payment_required") {
        // Delayed payment methods (bank debits) complete first and pay later.
        await prisma.order.update({ where: { id: order.id }, data: customer });
        return { status: 200, body: { received: true, order: order.number, status: order.status } };
      }
      const paid = await markPaid(order, {
        ...customer,
        stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? null),
        amount: typeof session.amount_total === "number" ? session.amount_total : null,
      });
      if (paid) revalidateTag(siteCacheTag(siteId), { expire: 0 });
      return { status: 200, body: { received: true, order: order.number, status: paid ? "PAID" : order.status } };
    }
    case "checkout.session.async_payment_failed":
    case "checkout.session.expired": {
      const res = await prisma.order.updateMany({ where: { id: order.id, siteId, status: "PENDING" }, data: { status: "CANCELLED" } });
      return { status: 200, body: { received: true, order: order.number, status: res.count ? "CANCELLED" : order.status } };
    }
  }
  return { status: 200, body: { received: true } };
}

type OrderWithItems = Prisma.OrderGetPayload<{ include: { items: true } }>;

/** PENDING → PAID and stock out, once. Returns false when another delivery already did it. */
async function markPaid(
  order: OrderWithItems,
  data: { customerEmail: string | null; customerName: string | null; shippingAddr: Prisma.InputJsonValue | undefined; stripeSessionId: string | null; stripePaymentIntentId: string | null; amount: number | null },
) {
  const { amount, ...fields } = data;
  if (amount !== null && amount !== order.totalAmount) console.warn(`order ${order.id}: Stripe charged ${amount}, order total ${order.totalAmount}`);
  return prisma.$transaction(async (tx) => {
    // A cancelled (expired) session can still be paid in a race; payment wins.
    const res = await tx.order.updateMany({
      where: { id: order.id, siteId: order.siteId, status: { in: ["PENDING", "CANCELLED"] } },
      data: { ...fields, status: "PAID", paidAt: new Date(), ...(amount !== null ? { totalAmount: amount } : {}) },
    });
    if (!res.count) return false;
    for (const item of order.items) {
      if (item.variantId) {
        await tx.productVariant.updateMany({ where: { id: item.variantId, siteId: order.siteId, product: { trackInventory: true } }, data: { inventory: { decrement: item.quantity } } });
      } else if (item.productId) {
        await tx.product.updateMany({ where: { id: item.productId, siteId: order.siteId, trackInventory: true }, data: { inventory: { decrement: item.quantity } } });
      }
    }
    return true;
  });
}
