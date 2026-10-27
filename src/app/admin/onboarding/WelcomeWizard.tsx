"use client";

import { useEffect, useRef, useState } from "react";
import { Button, inputClass } from "@/components/cms/ui";
import { skipOnboardingAction } from "@/server/template-actions";
import { TemplateGallery, type SiteSetupChoice, type TemplateSummary } from "../sites/new/TemplateGallery";

export interface ThemeChoice {
  key: string;
  label: string;
  description: string;
  swatch: string[];
}

const LANGUAGES = [
  { code: "en-US", label: "English (US)", currency: "USD" },
  { code: "en-GB", label: "English (UK)", currency: "GBP" },
  { code: "fr-FR", label: "Français", currency: "EUR" },
  { code: "de-DE", label: "Deutsch", currency: "EUR" },
  { code: "es-ES", label: "Español", currency: "EUR" },
  { code: "it-IT", label: "Italiano", currency: "EUR" },
  { code: "nl-NL", label: "Nederlands", currency: "EUR" },
  { code: "pt-BR", label: "Português (Brasil)", currency: "BRL" },
  { code: "ja-JP", label: "日本語", currency: "JPY" },
] as const;
const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "BRL", "JPY", "CHF", "SEK", "INR"];

// Shared buttons read --accent, which site pages set from branding; there's no site yet.
const ACCENT = { ["--accent" as string]: "#18181b" };

const STEPS = ["Name your site", "Language", "Theme", "Starting point"] as const;

/**
 * Four steps in a modal: site title, default language and currency, an
 * optional theme preset over the template's own design, then the template
 * gallery, whose create form carries the earlier choices.
 */
export function WelcomeWizard({ firstName, themes, templates, sectors }: { firstName: string | null; themes: ThemeChoice[]; templates: TemplateSummary[]; sectors: Record<string, string> }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [lang, setLang] = useState<string>("en-US");
  const [currency, setCurrency] = useState<string>("USD");
  const [preset, setPreset] = useState<string | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open && step < 3) d.showModal();
    if (d?.open && step === 3) d.close();
    return () => d?.close();
  }, [step]);

  const language = LANGUAGES.find((l) => l.code === lang)!;
  const setup: SiteSetupChoice = { name: name.trim(), locale: { code: language.code, label: language.label, currency }, preset };
  const canNext = step !== 0 || name.trim().length > 0;

  if (step === 3) {
    return (
      <main className="mx-auto w-full max-w-7xl p-6 sm:p-8" style={ACCENT} data-onboarding-step="4">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.2em] text-zinc-400">Step 4 of 4</p>
            <h1 className="mt-1 text-2xl font-semibold text-zinc-900">Pick a starting point for {setup.name}</h1>
            <p className="mt-1 text-sm text-zinc-600">
              Open any template to preview it, then choose “Use this template”. Your language ({language.label}, {currency})
              {preset ? ` and the ${themes.find((t) => t.key === preset)?.label} theme` : ""} will be applied.
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setStep(2)}>Back</Button>
            <form action={skipOnboardingAction}>
              <Button type="submit" tone="ghost" data-onboarding-skip="">Skip for now</Button>
            </form>
          </div>
        </div>
        <TemplateGallery templates={templates} sectors={sectors} setup={setup} />
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-zinc-100" style={ACCENT}>
      <dialog
        ref={ref}
        aria-labelledby="welcome-title"
        onCancel={(e) => e.preventDefault()}
        className="m-auto w-[min(560px,calc(100vw-2rem))] rounded-2xl bg-white p-0 shadow-2xl backdrop:bg-zinc-900/40"
        data-onboarding-wizard=""
        data-onboarding-step={step + 1}
      >
        <div className="border-b border-zinc-100 px-7 pt-6 pb-5">
          <ol className="mb-4 flex gap-1.5" aria-label="Progress">
            {STEPS.map((s, i) => (
              <li key={s} className={`h-1 flex-1 rounded-full ${i <= step ? "bg-zinc-900" : "bg-zinc-200"}`} aria-current={i === step ? "step" : undefined}>
                <span className="sr-only">{s}</span>
              </li>
            ))}
          </ol>
          <p className="text-xs font-semibold uppercase tracking-[.2em] text-zinc-400">Step {step + 1} of 4</p>
          <h1 id="welcome-title" className="mt-1 text-xl font-semibold text-zinc-900">
            {step === 0 ? `Welcome${firstName ? `, ${firstName}` : ""}! What's your site called?` : step === 1 ? "Which language will visitors read?" : "Pick a look"}
          </h1>
        </div>

        <div className="px-7 py-6">
          {step === 0 && (
            <label className="block text-sm font-medium text-zinc-800">
              Site title
              <input
                autoFocus
                value={name}
                maxLength={60}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && canNext && setStep(1)}
                placeholder="e.g. Harbor Coffee"
                className={`${inputClass} mt-1`}
                data-onboarding-name=""
              />
              <span className="mt-1.5 block text-xs font-normal text-zinc-500">You can change it any time in Settings.</span>
            </label>
          )}

          {step === 1 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-zinc-800">
                Default language
                <select
                  value={lang}
                  onChange={(e) => {
                    setLang(e.target.value);
                    setCurrency(LANGUAGES.find((l) => l.code === e.target.value)!.currency);
                  }}
                  className={`${inputClass} mt-1`}
                  data-onboarding-locale=""
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>{l.label}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium text-zinc-800">
                Currency
                <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={`${inputClass} mt-1`} data-onboarding-currency="">
                  {CURRENCIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <p className="text-xs text-zinc-500 sm:col-span-2">You can add more languages later under Settings → Languages.</p>
            </div>
          )}

          {step === 2 && (
            <div role="radiogroup" aria-label="Theme" className="grid gap-2.5">
              {[{ key: null, label: "Template's own design", description: "Keep the colours and fonts each starter template was designed with.", swatch: [] as string[] }, ...themes].map((t) => (
                <button
                  key={t.key ?? "own"}
                  type="button"
                  role="radio"
                  aria-checked={preset === t.key}
                  onClick={() => setPreset(t.key)}
                  className={`flex items-center gap-3 rounded-xl border p-3 text-left ${preset === t.key ? "border-zinc-900 ring-2 ring-zinc-900/10" : "border-zinc-200 hover:border-zinc-400"}`}
                  data-onboarding-theme={t.key ?? "template"}
                >
                  <span className="flex h-9 w-14 shrink-0 overflow-hidden rounded-md border border-zinc-200 bg-[conic-gradient(#f4f4f5_25%,#fff_0_50%,#f4f4f5_0_75%,#fff_0)] bg-[length:8px_8px]">
                    {t.swatch.map((c) => (
                      <span key={c} className="flex-1" style={{ background: c }} />
                    ))}
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-zinc-900">{t.label}</span>
                    <span className="block text-xs text-zinc-500">{t.description}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-zinc-100 px-7 py-4">
          <form action={skipOnboardingAction}>
            <Button type="submit" tone="ghost" data-onboarding-skip="">Skip for now</Button>
          </form>
          <div className="flex gap-2">
            {step > 0 && <Button onClick={() => setStep(step - 1)}>Back</Button>}
            <Button tone="primary" disabled={!canNext} onClick={() => setStep(step + 1)} data-onboarding-next="">
              {step === 2 ? "Choose a template" : "Continue"}
            </Button>
          </div>
        </div>
      </dialog>
    </main>
  );
}
