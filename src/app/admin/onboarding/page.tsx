import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { PRESETS, PRESET_KEYS } from "@/lib/design/presets";
import { SECTORS } from "@/lib/templates/types";
import { canCreateSites } from "@/server/template-service";
import { templateSummaries } from "../sites/new/summaries";
import { platformDomain } from "@/lib/env.mjs";
import { WelcomeWizard, type ThemeChoice } from "./WelcomeWizard";

export const metadata: Metadata = { title: "Welcome" };

/** First-time welcome wizard: site title, language, theme, then a starter template. */
export default async function OnboardingPage() {
  const user = await requireUser();
  // Invited clients and editors have nothing to set up; their site is waiting.
  if (user.onboardedAt || !(await canCreateSites(user))) redirect("/admin");
  const themes: ThemeChoice[] = PRESET_KEYS.map((key) => {
    const c = PRESETS[key].tokens.colors ?? {};
    return { key, label: PRESETS[key].label, description: PRESETS[key].description, swatch: [c.background, c["surface-low"], c.primary, c.heading].filter((x): x is string => !!x) };
  });
  return <WelcomeWizard firstName={user.name?.split(" ")[0] ?? null} themes={themes} templates={templateSummaries()} sectors={SECTORS} rootDomain={platformDomain()} />;
}
