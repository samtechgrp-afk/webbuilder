import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Encryption at rest for third-party secrets (Stripe keys). AES-256-GCM with
 * a key from SECRETS_KEY, or derived from SESSION_SECRET when that isn't set.
 * Stored as "v1.<iv>.<tag>.<ciphertext>" (base64url). Node-only (node:crypto);
 * the seed script uses it too, so it skips the server-only guard.
 */
function key() {
  const raw = process.env.SECRETS_KEY || process.env.SESSION_SECRET;
  if (!raw || raw.length < 32) throw new Error("SECRETS_KEY (or SESSION_SECRET) must be at least 32 characters");
  return createHash("sha256").update(`webbuilder:secrets:${raw}`).digest();
}

export function encryptSecret(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

/** Null when the value is missing or can't be decrypted (e.g. the key changed). */
export function decryptSecret(stored: string | null | undefined): string | null {
  if (!stored) return null;
  const [v, iv, tag, data] = stored.split(".");
  if (v !== "v1" || !iv || !tag || !data) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
