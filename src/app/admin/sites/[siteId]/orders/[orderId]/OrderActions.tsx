"use client";

import type { OrderStatus } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/cms/ui";
import { setOrderStatusAction } from "@/server/commerce-actions";

const LABELS: Partial<Record<OrderStatus, string>> = {
  FULFILLED: "Mark fulfilled",
  PAID: "Mark unfulfilled",
  REFUNDED: "Mark refunded",
  CANCELLED: "Cancel order",
};

export function OrderActions({ siteId, orderId, transitions }: { siteId: string; orderId: string; transitions: OrderStatus[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!transitions.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {error && <span role="alert" className="text-sm text-red-700">{error}</span>}
      {transitions.map((status) => (
        <Button
          key={status}
          tone={status === "FULFILLED" ? "primary" : status === "REFUNDED" || status === "CANCELLED" ? "danger" : "secondary"}
          disabled={pending}
          data-order-action={status}
          onClick={() => {
            if ((status === "REFUNDED" || status === "CANCELLED") && !window.confirm(status === "REFUNDED" ? "Mark this order refunded? Refund the payment in Stripe as well." : "Cancel this unpaid order?")) return;
            setError(null);
            start(async () => {
              const res = await setOrderStatusAction({ siteId, id: orderId, status });
              if (!res.ok) setError(res.error);
              router.refresh();
            });
          }}
        >
          {LABELS[status]}
        </Button>
      ))}
    </div>
  );
}
