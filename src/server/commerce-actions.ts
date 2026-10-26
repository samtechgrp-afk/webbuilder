"use server";

import type { OrderStatus } from "@prisma/client";
import { getTenant } from "@/lib/tenant";
import { run } from "./action-result";
import { setOrderStatus } from "./commerce/order-service";
import { createProduct, deleteProduct, saveProduct, type ProductInput } from "./commerce/product-service";
import { saveStoreSettings, type StoreSettingsInput } from "./commerce/store-service";

/**
 * Server actions for the shop. The tenant always comes from the session; the
 * services check permissions (`commerce.manage` for the catalog and orders,
 * `site.settings` for payments).
 */

type WithSite<T> = T & { siteId: string };

export async function createProductAction(input: WithSite<{ title: string }>) {
  return run(async () => createProduct(await getTenant(input.siteId), input.title));
}
export async function saveProductAction(input: WithSite<{ product: ProductInput }>) {
  return run(async () => saveProduct(await getTenant(input.siteId), input.product));
}
export async function deleteProductAction(input: WithSite<{ id: string }>) {
  return run(async () => deleteProduct(await getTenant(input.siteId), input.id));
}
export async function setOrderStatusAction(input: WithSite<{ id: string; status: OrderStatus }>) {
  return run(async () => setOrderStatus(await getTenant(input.siteId), input.id, input.status));
}
export async function saveStoreSettingsAction(input: WithSite<{ settings: StoreSettingsInput }>) {
  return run(async () => saveStoreSettings(await getTenant(input.siteId), input.settings));
}
