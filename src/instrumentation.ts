import { assertEnv } from "@/lib/env.mjs";

/**
 * Runs once when the server starts: refuse to serve with a broken
 * configuration, then make sure the built-in roles exist.
 */
export async function register() {
  assertEnv();
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const [{ prisma }, { ensureSystemRoles }] = await Promise.all([import("@/lib/db"), import("@/server/system-roles")]);
  // A database that's still starting must not stop the server; site creation repeats the check.
  await ensureSystemRoles(prisma).catch((err) => console.error("Couldn't check the system roles:", err instanceof Error ? err.message : err));
}
