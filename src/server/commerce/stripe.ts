import "server-only";
import { formEncode } from "@/lib/commerce/stripe-form";
import { getEnv } from "@/lib/env.mjs";

/**
 * A minimal Stripe REST client: the two calls the shop needs, over fetch.
 * STRIPE_API_BASE points it at a local mock for tests; it defaults to
 * Stripe itself.
 */
const apiBase = () => (getEnv().STRIPE_API_BASE || "https://api.stripe.com").replace(/\/$/, "");

export class StripeError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export interface CheckoutLineItem {
  name: string;
  description?: string;
  images?: string[];
  unitAmount: number;
  quantity: number;
}

export interface CheckoutSessionInput {
  currency: string;
  lineItems: CheckoutLineItem[];
  successUrl: string;
  cancelUrl: string;
  /** Stripe Checkout UI language ("fr", "es", "auto"). */
  locale?: string;
  shippingCountries?: string[];
  clientReferenceId: string;
  metadata: Record<string, string>;
  idempotencyKey: string;
}

export async function createCheckoutSession(secretKey: string, input: CheckoutSessionInput): Promise<{ id: string; url: string }> {
  const body = formEncode({
    mode: "payment",
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    client_reference_id: input.clientReferenceId,
    locale: input.locale,
    metadata: input.metadata,
    payment_intent_data: { metadata: input.metadata },
    shipping_address_collection: input.shippingCountries?.length ? { allowed_countries: input.shippingCountries } : undefined,
    line_items: input.lineItems.map((l) => ({
      quantity: l.quantity,
      price_data: {
        currency: input.currency.toLowerCase(),
        unit_amount: l.unitAmount,
        product_data: { name: l.name, description: l.description || undefined, images: l.images?.length ? l.images.slice(0, 8) : undefined },
      },
    })),
  });
  let res: Response;
  try {
    res = await fetch(`${apiBase()}/v1/checkout/sessions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/x-www-form-urlencoded", "Idempotency-Key": input.idempotencyKey, "Stripe-Version": "2025-09-30.clover" },
      body,
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new StripeError("Couldn't reach Stripe", 502);
  }
  const json = (await res.json().catch(() => null)) as { id?: string; url?: string; error?: { message?: string } } | null;
  if (!res.ok || !json?.id || !json.url) {
    // Stripe's message can name the key; log it, show the visitor something generic.
    console.error("stripe checkout failed", res.status, json?.error?.message);
    throw new StripeError(res.status === 401 ? "The shop's Stripe key was rejected" : "Stripe couldn't start the checkout", 502);
  }
  return { id: json.id, url: json.url };
}
