import { NextResponse } from "next/server";
import { handleStripeWebhook } from "@/server/commerce/webhook";

/**
 * Stripe → shop events. Point each shop's Stripe webhook here (Settings →
 * Payments shows the URL) and send at least checkout.session.completed and
 * checkout.session.expired. The raw body is needed for the signature check.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > 512 * 1024) return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  const result = await handleStripeWebhook(raw, request.headers.get("stripe-signature"));
  return NextResponse.json(result.body, { status: result.status });
}
