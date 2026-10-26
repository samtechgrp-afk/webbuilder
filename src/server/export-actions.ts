"use server";

import { getTenant } from "@/lib/tenant";
import { run } from "./action-result";
import { deleteExport, startExport } from "./export/export-service";

/** Export actions. Each service call asserts `site.settings` itself. */

export async function startExportAction(input: { siteId: string; baseUrl: string }) {
  return run(async () => startExport(await getTenant(input.siteId), input));
}
export async function deleteExportAction(input: { siteId: string; id: string }) {
  return run(async () => deleteExport(await getTenant(input.siteId), input));
}
