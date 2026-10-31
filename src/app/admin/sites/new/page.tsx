import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { platformDomain } from "@/lib/env.mjs";
import { SECTORS } from "@/lib/templates/types";
import { canCreateSites } from "@/server/template-service";
import { templateSummaries } from "./summaries";
import { TemplateGallery } from "./TemplateGallery";

export const metadata: Metadata = { title: "New site" };

/** Onboarding: pick a starter template, preview it on every device, create the site in one click. */
export default async function NewSitePage() {
  const user = await requireUser();
  if (!(await canCreateSites(user))) {
    return (
      <main className="mx-auto w-full max-w-xl p-8" data-create-forbidden="">
        <h1 className="text-2xl font-semibold text-zinc-900">New site</h1>
        <p className="mt-3 text-sm text-zinc-600">Only designers can start new sites. Ask your studio to create one for you.</p>
        <Link href="/admin" className="mt-6 inline-block text-sm font-medium text-zinc-900 underline">Back to your sites</Link>
      </main>
    );
  }
  const templates = templateSummaries();
  return (
    <main className="mx-auto w-full max-w-7xl p-6 sm:p-8" style={{ ["--accent" as string]: "#18181b" }}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/admin" className="text-sm text-zinc-500 hover:text-zinc-900">← Your sites</Link>
          <h1 className="mt-2 text-2xl font-semibold text-zinc-900">Start a new site</h1>
          <p className="mt-1 text-sm text-zinc-600">Pick a starter template. Pages, design system, content types and sample content are all editable afterwards.</p>
        </div>
      </div>
      <TemplateGallery templates={templates} sectors={SECTORS} rootDomain={platformDomain()} />
    </main>
  );
}
