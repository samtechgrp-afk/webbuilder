import "server-only";
import type { OrderStatus, Prisma } from "@prisma/client";
import type { TenantContext } from "@/lib/tenant";
import { EditError } from "../content-service";

/**
 * Orders for /admin/sites/<id>/orders. Payment states (PENDING → PAID,
 * CANCELLED) are set by the Stripe webhook; people move paid orders through
 * fulfilment. Refunds are issued in Stripe; marking an order refunded here
 * records it.
 */

export const ORDER_TABS = [
  { key: "all", label: "All", where: {} },
  { key: "unfulfilled", label: "To fulfil", where: { status: "PAID" } },
  { key: "fulfilled", label: "Fulfilled", where: { status: "FULFILLED" } },
  { key: "pending", label: "Awaiting payment", where: { status: "PENDING" } },
  { key: "refunded", label: "Refunded", where: { status: "REFUNDED" } },
  { key: "cancelled", label: "Cancelled", where: { status: "CANCELLED" } },
] as const satisfies readonly { key: string; label: string; where: Prisma.OrderWhereInput }[];

/** Status changes a person may make. */
const TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  PAID: ["FULFILLED", "REFUNDED"],
  FULFILLED: ["PAID", "REFUNDED"],
  PENDING: ["CANCELLED"],
};

export const allowedTransitions = (status: OrderStatus) => TRANSITIONS[status] ?? [];

export async function listOrders(t: TenantContext, filter: { tab?: string; q?: string; page?: number }) {
  t.assert("commerce.manage");
  const tab = ORDER_TABS.find((x) => x.key === filter.tab) ?? ORDER_TABS[0];
  const q = filter.q?.trim().replace(/^#/, "") ?? "";
  const search: Prisma.OrderWhereInput = q
    ? /^\d+$/.test(q)
      ? { number: Number(q) }
      : { OR: [{ customerEmail: { contains: q, mode: "insensitive" } }, { customerName: { contains: q, mode: "insensitive" } }] }
    : {};
  const take = 25;
  const page = Math.max(1, filter.page ?? 1);
  const where = { ...search, ...tab.where };
  const [orders, total, counts] = await Promise.all([
    t.db.order.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * take, take, include: { items: { select: { quantity: true } } } }),
    t.db.order.count({ where }),
    Promise.all(ORDER_TABS.map((x) => t.db.order.count({ where: { ...search, ...x.where } }))),
  ]);
  return {
    tab: tab.key,
    page,
    pages: Math.max(1, Math.ceil(total / take)),
    counts: Object.fromEntries(ORDER_TABS.map((x, i) => [x.key, counts[i]])),
    orders: orders.map((o) => ({
      id: o.id,
      number: o.number,
      createdAt: o.createdAt.toISOString(),
      customerEmail: o.customerEmail,
      customerName: o.customerName,
      items: o.items.reduce((n, i) => n + i.quantity, 0),
      totalAmount: o.totalAmount,
      currency: o.currency,
      status: o.status,
    })),
  };
}

export async function getOrder(t: TenantContext, id: string) {
  t.assert("commerce.manage");
  return t.db.order.findUnique({ where: { id }, include: { items: { include: { product: { select: { id: true, title: true } } } } } });
}

export async function setOrderStatus(t: TenantContext, id: string, status: OrderStatus) {
  t.assert("commerce.manage");
  const order = await t.db.order.findUnique({ where: { id }, select: { id: true, status: true, fulfilledAt: true } });
  if (!order) throw new EditError("This order no longer exists", "not_found");
  if (!allowedTransitions(order.status).includes(status)) throw new EditError(`A ${order.status.toLowerCase()} order can't be marked ${status.toLowerCase()}`, "invalid");
  // Conditional on the status we read, so a webhook landing at the same moment wins cleanly.
  const res = await t.db.order.updateMany({
    where: { id, status: order.status },
    data: { status, fulfilledAt: status === "FULFILLED" ? new Date() : status === "PAID" ? null : order.fulfilledAt },
  });
  if (!res.count) throw new EditError("This order changed while you were looking at it. Reload and try again.", "conflict");
  await t.db.auditLog.create({ data: { userId: t.user.id, action: "order.status", targetId: id, data: { from: order.status, to: status } } });
  return { status };
}
