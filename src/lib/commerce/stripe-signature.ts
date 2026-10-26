import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Stripe webhook signatures (https://docs.stripe.com/webhooks#verify-manually):
 * the `Stripe-Signature` header carries `t=<unix seconds>` and one or more
 * `v1=<hex HMAC-SHA256 of "<t>.<raw body>">` keyed with the endpoint secret.
 */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

const hmac = (secret: string, timestamp: number, payload: string) => createHmac("sha256", secret).update(`${timestamp}.${payload}`, "utf8").digest("hex");

export function signPayload(payload: string, secret: string, timestamp = Math.floor(Date.now() / 1000)) {
  return `t=${timestamp},v1=${hmac(secret, timestamp, payload)}`;
}

export type SignatureCheck = { ok: true } | { ok: false; reason: "missing" | "malformed" | "expired" | "mismatch" };

export function verifySignature(payload: string, header: string | null, secret: string, now = Math.floor(Date.now() / 1000), tolerance = SIGNATURE_TOLERANCE_SECONDS): SignatureCheck {
  if (!header) return { ok: false, reason: "missing" };
  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const [k, v] = part.trim().split("=", 2);
    if (k === "t" && /^\d+$/.test(v ?? "")) timestamp = Number(v);
    if (k === "v1" && /^[0-9a-f]{64}$/.test(v ?? "")) signatures.push(v);
  }
  if (timestamp === null || !signatures.length) return { ok: false, reason: "malformed" };
  if (Math.abs(now - timestamp) > tolerance) return { ok: false, reason: "expired" };
  const expected = Buffer.from(hmac(secret, timestamp, payload), "hex");
  const match = signatures.some((s) => {
    const given = Buffer.from(s, "hex");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
  return match ? { ok: true } : { ok: false, reason: "mismatch" };
}
