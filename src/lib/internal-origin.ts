/**
 * Where the app fetches its own rendered pages from (the proxy's 404 page,
 * the static exporter). A fixed origin, never the request's Host header, so a
 * forged Host can't point the fetch elsewhere.
 */
export const internalOrigin = () =>
  process.env.INTERNAL_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : `http://127.0.0.1:${process.env.PORT ?? 3000}`);
