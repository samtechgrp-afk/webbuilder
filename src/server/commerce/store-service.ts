import "server-only";
import { cacheLife, cacheTag, updateTag } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import type { TenantContext } from "@/lib/tenant";
import { EditError } from "../content-service";
import { decryptSecret, encryptSecret } from "../crypto";
import { siteCacheTag } from "../public-site";

/**
 * Shop settings. The currency follows the site's default language (Phase 8)
 * so prices, checkout and receipts agree with how the site is published;
 * Store.currency only applies to single-language sites. Stripe keys are
 * encrypted at rest, never sent back to the browser, and only people with
 * `site.settings` (designers, super admins) can set them.
 */

/** Public, cached: what the storefront needs to know. Never includes keys. */
export async function getStorefront(siteId: string) {
  "use cache";
  cacheLife("hours");
  cacheTag(siteCacheTag(siteId));
  const [store, locale] = await Promise.all([
    prisma.store.findUnique({ where: { siteId }, select: { enabled: true, currency: true, productTemplateId: true, stripeSecretKey: true } }),
    prisma.siteLocale.findFirst({ where: { siteId, isDefault: true }, select: { currency: true, code: true } }),
  ]);
  return {
    currency: locale?.currency ?? store?.currency ?? "USD",
    locale: locale?.code ?? "en-US",
    checkout: !!store?.enabled && !!store.stripeSecretKey,
    productTemplateId: store?.productTemplateId ?? null,
  };
}

/** Uncached store row plus the currency in force, for admin screens and checkout. */
export async function readStore(siteId: string) {
  const [store, locale] = await Promise.all([
    prisma.store.findUnique({ where: { siteId } }),
    prisma.siteLocale.findFirst({ where: { siteId, isDefault: true }, select: { currency: true, code: true } }),
  ]);
  return { store, currency: locale?.currency ?? store?.currency ?? "USD", locale: locale?.code ?? "en-US", currencyFromLocale: !!locale };
}

const COUNTRY = z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Use two-letter country codes, like US or FR");

export const storeSettingsSchema = z
  .object({
    enabled: z.boolean(),
    currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Use a three-letter currency code, like USD"),
    productTemplateId: z.string().max(40).nullable(),
    shippingCountries: z.array(COUNTRY).max(60),
    /** Undefined keeps the stored key, "" removes it. */
    stripeSecretKey: z
      .string()
      .trim()
      .regex(/^((sk|rk)_(test|live)_[A-Za-z0-9]{8,})?$/, "That doesn't look like a Stripe secret key (sk_test_… or sk_live_…)")
      .optional(),
    stripeWebhookSecret: z
      .string()
      .trim()
      .regex(/^(whsec_[A-Za-z0-9]{8,})?$/, "That doesn't look like a webhook signing secret (whsec_…)")
      .optional(),
  })
  .strict();
export type StoreSettingsInput = z.input<typeof storeSettingsSchema>;

const mask = (secret: string | null) => (secret ? `${secret.slice(0, secret.indexOf("_", 3) + 1)}…${secret.slice(-4)}` : null);

/** Settings screen view: keys masked to their mode and last four characters. */
export async function storeSettings(t: TenantContext) {
  t.assert("site.settings");
  const { store, currency, currencyFromLocale } = await readStore(t.site.id);
  const secret = decryptSecret(store?.stripeSecretKey);
  const templates = await t.db.post.findMany({ where: { postType: { key: "template" }, status: { not: "TRASHED" } }, orderBy: { title: "asc" }, select: { id: true, title: true } });
  return {
    enabled: store?.enabled ?? false,
    currency,
    storeCurrency: store?.currency ?? "USD",
    currencyFromLocale,
    productTemplateId: store?.productTemplateId ?? null,
    shippingCountries: store?.shippingCountries ?? [],
    stripeKey: mask(secret),
    liveMode: !!secret?.includes("_live_"),
    webhookSecret: mask(decryptSecret(store?.stripeWebhookSecret)),
    keyUnreadable: !!store?.stripeSecretKey && !secret,
    templates,
  };
}

export async function saveStoreSettings(t: TenantContext, raw: StoreSettingsInput) {
  t.assert("site.settings");
  const parsed = storeSettingsSchema.safeParse(raw);
  if (!parsed.success) throw new EditError(parsed.error.issues[0]?.message ?? "Check the settings", "invalid");
  const input = parsed.data;
  if (input.productTemplateId && !(await t.db.post.findFirst({ where: { id: input.productTemplateId, postType: { key: "template" } }, select: { id: true } }))) {
    throw new EditError("That product page template doesn't exist", "invalid");
  }
  const current = await prisma.store.findUnique({ where: { siteId: t.site.id }, select: { stripeSecretKey: true } });
  const willHaveKey = input.stripeSecretKey === undefined ? !!current?.stripeSecretKey : !!input.stripeSecretKey;
  if (input.enabled && !willHaveKey) throw new EditError("Add a Stripe secret key before turning checkout on", "invalid");

  const secrets = {
    ...(input.stripeSecretKey !== undefined ? { stripeSecretKey: input.stripeSecretKey ? encryptSecret(input.stripeSecretKey) : null } : {}),
    ...(input.stripeWebhookSecret !== undefined ? { stripeWebhookSecret: input.stripeWebhookSecret ? encryptSecret(input.stripeWebhookSecret) : null } : {}),
  };
  const data = { enabled: input.enabled, currency: input.currency, productTemplateId: input.productTemplateId, shippingCountries: [...new Set(input.shippingCountries)], ...secrets };
  await t.db.store.upsert({ where: { siteId: t.site.id }, create: { ...data, siteId: t.site.id }, update: data });
  await t.db.auditLog.create({
    data: { userId: t.user.id, action: "store.settings", targetId: t.site.id, data: { enabled: input.enabled, keyChanged: input.stripeSecretKey !== undefined, webhookChanged: input.stripeWebhookSecret !== undefined } },
  });
  updateTag(siteCacheTag(t.site.id));
  return {};
}
