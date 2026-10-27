import { getEnv } from "@/lib/env.mjs";

/**
 * Where the app fetches its own rendered pages from (the proxy's 404 page,
 * the static exporter). A fixed origin, never the request's Host header, so a
 * forged Host can't point the fetch elsewhere.
 */
export const internalOrigin = () => {
  const { INTERNAL_URL, VERCEL_URL, PORT } = getEnv();
  return INTERNAL_URL ?? (VERCEL_URL ? `https://${VERCEL_URL}` : `http://127.0.0.1:${PORT}`);
};
