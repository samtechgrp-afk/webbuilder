"use server";

import { getTenant } from "@/lib/tenant";
import { run } from "./action-result";
import { createApiKey, revokeApiKey, setGraphqlAccess } from "./graphql/developer-service";

/** Developer screen actions. Each service call asserts `developer.api` itself. */

export async function setGraphqlAccessAction(input: { siteId: string; enabled: boolean; public: boolean }) {
  return run(async () => setGraphqlAccess(await getTenant(input.siteId), input));
}
export async function createApiKeyAction(input: { siteId: string; name: string; scope: "READ" | "READ_WRITE" }) {
  return run(async () => createApiKey(await getTenant(input.siteId), input));
}
export async function revokeApiKeyAction(input: { siteId: string; id: string }) {
  return run(async () => revokeApiKey(await getTenant(input.siteId), input));
}
