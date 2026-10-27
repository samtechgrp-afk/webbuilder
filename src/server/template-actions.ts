"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { TemplateError } from "@/lib/templates/seeder";
import { createSiteFromTemplate } from "./template-service";

export type CreateSiteState = { error?: string; field?: "name" | "subdomain" | "template" } | null;

/** Creates a site from a starter template and opens its home page in the builder. */
export async function createSiteFromTemplateAction(_prev: CreateSiteState, form: FormData): Promise<CreateSiteState> {
  const user = await requireUser();
  let target: string;
  try {
    const { siteId, homeId } = await createSiteFromTemplate(user, {
      template: String(form.get("template") ?? ""),
      name: String(form.get("name") ?? ""),
      subdomain: String(form.get("subdomain") ?? ""),
    });
    target = `/admin/sites/${siteId}/pages/${homeId}/edit`;
  } catch (err) {
    if (err instanceof TemplateError) return { error: err.message, field: err.field };
    throw err;
  }
  redirect(target);
}
