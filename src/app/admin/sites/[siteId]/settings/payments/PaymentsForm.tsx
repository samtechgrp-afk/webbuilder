"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Card, Field, Notice, Toggle, inputClass } from "@/components/cms/ui";
import { saveStoreSettingsAction } from "@/server/commerce-actions";

interface Settings {
  enabled: boolean;
  currency: string;
  storeCurrency: string;
  currencyFromLocale: boolean;
  productTemplateId: string | null;
  shippingCountries: string[];
  stripeKey: string | null;
  liveMode: boolean;
  webhookSecret: string | null;
  keyUnreadable: boolean;
  templates: { id: string; title: string }[];
}

export function PaymentsForm({ siteId, settings, webhookUrl }: { siteId: string; settings: Settings; webhookUrl: string }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(settings.enabled);
  const [currency, setCurrency] = useState(settings.storeCurrency);
  const [templateId, setTemplateId] = useState(settings.productTemplateId ?? "");
  const [countries, setCountries] = useState(settings.shippingCountries.join(", "));
  const [secretKey, setSecretKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();

  const save = (extra: { stripeSecretKey?: string; stripeWebhookSecret?: string } = {}) =>
    start(async () => {
      setNotice(null);
      const res = await saveStoreSettingsAction({
        siteId,
        settings: {
          enabled,
          currency,
          productTemplateId: templateId || null,
          shippingCountries: countries.split(/[\s,]+/).filter(Boolean),
          ...(secretKey ? { stripeSecretKey: secretKey } : {}),
          ...(webhookSecret ? { stripeWebhookSecret: webhookSecret } : {}),
          ...extra,
        },
      });
      if (!res.ok) return setNotice({ tone: "error", text: res.error });
      setSecretKey("");
      setWebhookSecret("");
      setNotice({ tone: "success", text: "Payment settings saved." });
      router.refresh();
    });

  return (
    <form
      className="space-y-5"
      data-payments-form=""
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      {notice && (
        <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>
          <span data-payments-notice="">{notice.text}</span>
        </Notice>
      )}
      <Card title="Checkout">
        <label className="flex items-center justify-between gap-3 text-sm text-zinc-800">
          <span>
            Take orders
            <span className="block text-xs text-zinc-500">When off, carts still work but the checkout button is disabled.</span>
          </span>
          <Toggle checked={enabled} onChange={setEnabled} label="Take orders" id="checkout-enabled" />
        </label>
      </Card>

      <Card title="Stripe">
        <div className="space-y-4">
          {settings.keyUnreadable && <Notice tone="error">The saved key can&apos;t be decrypted (the server&apos;s secret changed). Enter it again.</Notice>}
          <Field
            label="Secret key"
            hint={settings.stripeKey ? <>Saved: <code data-saved-key="">{settings.stripeKey}</code> ({settings.liveMode ? "live mode, real payments" : "test mode"}). Leave empty to keep it.</> : "From Stripe → Developers → API keys. A restricted key (rk_) with Checkout Sessions write access works too."}
          >
            {(p) => <input {...p} name="stripeSecretKey" type="password" autoComplete="off" className={inputClass} value={secretKey} placeholder={settings.stripeKey ? "••••••••" : "sk_test_…"} onChange={(e) => setSecretKey(e.target.value.trim())} />}
          </Field>
          <Field
            label="Webhook signing secret"
            hint={settings.webhookSecret ? <>Saved: <code>{settings.webhookSecret}</code>. Leave empty to keep it.</> : "Create a webhook endpoint in Stripe with the URL below, then paste its signing secret (whsec_…)."}
          >
            {(p) => <input {...p} name="stripeWebhookSecret" type="password" autoComplete="off" className={inputClass} value={webhookSecret} placeholder={settings.webhookSecret ? "••••••••" : "whsec_…"} onChange={(e) => setWebhookSecret(e.target.value.trim())} />}
          </Field>
          <div className="rounded-lg bg-zinc-50 px-3 py-2.5 text-xs text-zinc-600">
            <p className="font-medium text-zinc-800">Webhook endpoint</p>
            <code className="mt-1 block break-all" data-webhook-url="">{webhookUrl}</code>
            <p className="mt-1">Events: checkout.session.completed, checkout.session.expired, checkout.session.async_payment_succeeded, checkout.session.async_payment_failed. Orders are only marked paid once this is set up.</p>
          </div>
          {(settings.stripeKey || settings.webhookSecret) && (
            <Button tone="danger" size="sm" disabled={pending} onClick={() => window.confirm("Remove the Stripe keys and turn checkout off?") && (setEnabled(false), save({ stripeSecretKey: "", stripeWebhookSecret: "" }))}>
              Disconnect Stripe
            </Button>
          )}
        </div>
      </Card>

      <Card title="Shop">
        <div className="space-y-4">
          <Field
            label="Currency"
            hint={settings.currencyFromLocale ? `The site's default language sets the currency (${settings.currency}). Change it under Settings → Languages.` : "Three-letter code. Prices are entered in this currency."}
          >
            {(p) => <input {...p} name="currency" className={`${inputClass} w-32 uppercase`} value={settings.currencyFromLocale ? settings.currency : currency} maxLength={3} disabled={settings.currencyFromLocale} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />}
          </Field>
          <Field label="Ships to" hint="Two-letter country codes, separated by commas. Checkout asks for an address in one of these when the cart has a physical product. Defaults to US.">
            {(p) => <input {...p} name="shippingCountries" className={inputClass} value={countries} placeholder="US, CA, GB, FR" onChange={(e) => setCountries(e.target.value.toUpperCase())} />}
          </Field>
          <Field label="Product page template" hint="A template with a Product details widget set to “The page's product”. Product pages use a plain layout until you pick one.">
            {(p) => (
              <select {...p} name="productTemplateId" className={inputClass} value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                <option value="">Plain layout</option>
                {settings.templates.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.title}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
      </Card>
      <div className="flex justify-end">
        <Button tone="primary" type="submit" disabled={pending} data-save-payments="">
          {pending ? "Saving…" : "Save payment settings"}
        </Button>
      </div>
    </form>
  );
}
