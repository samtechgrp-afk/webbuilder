import { createHmac, timingSafeEqual } from "node:crypto";
import { getEnv } from "@/lib/env.mjs";

/**
 * Tokens for customers' order status links: an HMAC of the order id, so the
 * link is unguessable without customer accounts. Kept free of server-only
 * imports because the proxy checks them too (a page can't send a real 404
 * once its shell has streamed).
 */
const sign = (orderId: string) => createHmac("sha256", getEnv().SESSION_SECRET).update(`order-status:${orderId}`).digest("base64url").slice(0, 32);

export const orderStatusToken = (orderId: string) => sign(orderId);

export function verifyOrderStatusToken(orderId: string, token: string | null | undefined) {
  if (!token) return false;
  const a = Buffer.from(sign(orderId));
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}
