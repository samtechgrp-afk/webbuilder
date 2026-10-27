import "server-only";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email/dispatcher";
import type { PostalAddress } from "@/lib/email/layout";
import { orderReceiptEmail, storeAlertEmail, type OrderEmailData } from "@/lib/email/templates/orders";
import { hasPermission } from "@/lib/rbac";
import { orderStatusUrl, platformOrigin } from "./links";

/**
 * The customer receipt and the store owner alert for a paid order. Called once
 * the webhook has moved the order to PAID; idempotency keys per order make a
 * second call (a replayed event) a no-op.
 */
export async function sendOrderEmails(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: { include: { product: { select: { isPhysical: true } } } }, site: { select: { id: true, name: true, branding: true } } },
  });
  if (!order || order.status !== "PAID") return;

  const branding = (order.site.branding ?? {}) as { accent?: string; logoText?: string };
  const data: OrderEmailData = {
    brand: { name: branding.logoText || order.site.name, accent: branding.accent ?? null },
    number: order.number,
    currency: order.currency,
    locale: order.locale,
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    items: order.items.map((i) => ({ title: i.title, variantTitle: i.variantTitle, sku: i.sku, quantity: i.quantity, price: i.price, digital: i.product ? !i.product.isPhysical : false })),
    taxAmount: order.taxAmount,
    shippingAmount: order.shippingAmount,
    totalAmount: order.totalAmount,
    shippingAddr: (order.shippingAddr ?? null) as PostalAddress | null,
    paidAt: order.paidAt ?? new Date(),
  };

  const jobs: Promise<unknown>[] = [];
  if (order.customerEmail) {
    jobs.push(sendEmail({ ...orderReceiptEmail(data, orderStatusUrl(order.id)), to: order.customerEmail, tag: "order.receipt", siteId: order.siteId, idempotencyKey: `order.receipt:${order.id}` }));
  }

  const managers = await prisma.membership.findMany({ where: { siteId: order.siteId }, select: { user: { select: { email: true } }, role: { select: { permissions: true } } } });
  const to = [...new Set(managers.filter((m) => hasPermission(m.role.permissions, "commerce.manage")).map((m) => m.user.email))];
  if (to.length) {
    const replyTo = order.customerEmail;
    jobs.push(sendEmail({ ...storeAlertEmail(data, `${platformOrigin()}/admin/sites/${order.siteId}/orders/${order.id}`), to, replyTo, tag: "order.alert", siteId: order.siteId, idempotencyKey: `order.alert:${order.id}` }));
  }
  await Promise.all(jobs);
}
