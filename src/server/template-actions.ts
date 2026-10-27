"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { TemplateError } from "@/lib/templates/seeder";
import { EditError } from "./content-service";
import { createSiteFromTemplate } from "./template-service";

export type CreateSiteState = { error?: string; field?: "name" | "subdomain" | "template" } | null;

/** Creates a site from a starter template and opens its home page in the builder. */
export async function createSiteFromTemplateAction(_prev: CreateSiteState, form: FormData): Promise<CreateSiteState> {
  const user = await requireUser();
  let target: string;
  try {
    const field = (k: string) => String(form.get(k) ?? "").trim();
    const { siteId, homeId } = await createSiteFromTemplate(
      user,
      { template: field("template"), name: field("name"), subdomain: field("subdomain") },
      {
        locale: field("localeCode") ? { code: field("localeCode"), label: field("localeLabel") || field("localeCode"), currency: field("currency") || "USD" } : null,
        preset: field("preset") || null,
      },
    );
    target = `/admin/sites/${siteId}/pages/${homeId}/edit`;
  } catch (err) {
    if (err instanceof TemplateError) return { error: err.message, field: err.field };
    if (err instanceof EditError) return { error: err.message };
    throw err;
  }
  redirect(target);
}

/** Leaves the welcome wizard without creating a site. */
export async function skipOnboardingAction() {
  const user = await requireUser();
  await prisma.user.update({ where: { id: user.id }, data: { onboardedAt: new Date() } });
  redirect("/admin");
}
