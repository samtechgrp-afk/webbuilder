import type { Violation } from "@/lib/builder/policy";
import { Forbidden } from "@/lib/tenant";
import { TenantViolation } from "@/lib/tenant-db";
import { EditError } from "./content-service";

export type ActionResult<T> =
  | ({ ok: true } & T)
  | { ok: false; error: string; code?: string; violations?: Violation[] };

/** Turns expected failures into a result the UI can show; anything else is a real bug and still throws. */
export async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, ...(await fn()) };
  } catch (err) {
    if (err instanceof EditError) return { ok: false, error: err.message, code: err.code, violations: err.violations };
    if (err instanceof Forbidden) return { ok: false, error: "You don't have permission to do that.", code: "forbidden" };
    if (err instanceof TenantViolation) return { ok: false, error: "That request crossed a site boundary.", code: "forbidden" };
    throw err; // redirect()/notFound() and real bugs
  }
}
