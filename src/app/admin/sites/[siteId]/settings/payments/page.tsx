import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getTenant } from "@/lib/tenant";
import { storeSettings } from "@/server/commerce/store-service";
import { PaymentsForm } from "./PaymentsForm";

export const metadata: Metadata = { title: "Payments" };

export default async function PaymentsPage({ params }: PageProps<"/admin/sites/[siteId]/settings/payments">) {
  const { siteId } = await params;
  const t = await getTenant(siteId);
  // Stripe keys are a designer/admin concern: client roles never see this screen.
  if (!t.can("site.settings")) notFound();
  const settings = await storeSettings(t);
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (/^(localhost|127\.)/.test(host) ? "http" : "https");

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <nav className="mb-2 text-sm text-zinc-500">
        <Link href={`/admin/sites/${t.site.id}/settings`} className="hover:text-zinc-900">Settings</Link> /
      </nav>
      <h1 className="text-2xl font-semibold text-zinc-900">Payments</h1>
      <p className="mb-6 text-sm text-zinc-500">Connect the shop to Stripe Checkout. Keys are encrypted and never shown again in full; only designers and admins can see this page.</p>
      <PaymentsForm siteId={t.site.id} settings={settings} webhookUrl={`${proto}://${host}/api/webhooks/stripe`} />
    </main>
  );
}
