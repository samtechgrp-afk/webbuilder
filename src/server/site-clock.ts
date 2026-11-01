import { cacheLife } from "next/cache";

/**
 * "Now" for shortcodes like [year] and [date]. Cache Components refuses a
 * bare `new Date()` while prerendering, so the time is read once inside a
 * cache entry and shared until it expires: plenty for a copyright year.
 */
export async function siteClock(): Promise<string> {
  "use cache";
  cacheLife("hours");
  return new Date().toISOString();
}
