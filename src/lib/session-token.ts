import { SignJWT, jwtVerify } from "jose";

/**
 * Signed session cookie. It carries only the server-side Session id; the
 * Session row is the source of truth, so revoking it logs the user out
 * everywhere. Kept free of Prisma imports so the proxy can verify it cheaply.
 */
export const SESSION_COOKIE = "sb_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

function key() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
  return new TextEncoder().encode(secret);
}

export async function signSessionToken(sessionId: string) {
  return new SignJWT({ sid: sessionId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(key());
}

export async function verifySessionToken(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    return typeof payload.sid === "string" ? payload.sid : null;
  } catch {
    return null;
  }
}
