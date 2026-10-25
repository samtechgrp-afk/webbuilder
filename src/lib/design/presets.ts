import type { DesignTokens } from "./tokens";

/**
 * Font stacks the font selector offers. The `--font-*` families are loaded
 * once by the root layout (next/font), so every site can use them without a
 * request to a third-party font host.
 */
export const FONT_CHOICES = [
  { label: "Geist Sans", value: "var(--font-geist-sans), system-ui, sans-serif" },
  { label: "Inter", value: "var(--font-inter), system-ui, sans-serif" },
  { label: "Geist Mono", value: "var(--font-geist-mono), ui-monospace, monospace" },
  { label: "Fraunces", value: "var(--font-fraunces), Georgia, serif" },
  { label: "Instrument Serif", value: "var(--font-instrument-serif), Georgia, serif" },
  { label: "System sans", value: "system-ui, -apple-system, sans-serif" },
  { label: "System serif", value: "Georgia, 'Times New Roman', serif" },
] as const;

const font = (label: (typeof FONT_CHOICES)[number]["label"]) => FONT_CHOICES.find((f) => f.label === label)!.value;

/** The semantic colours every preset defines and the editor shows first. */
export const CORE_COLORS = [
  ["background", "Canvas"],
  ["surface-low", "Surface low"],
  ["surface-mid", "Surface mid"],
  ["surface-high", "Surface high"],
  ["primary", "Primary"],
  ["on-primary", "Text on primary"],
  ["accent", "Accent"],
  ["heading", "Heading"],
  ["text", "Body text"],
  ["muted", "Muted text"],
  ["border", "Border"],
] as const;

export type PresetKey = "linear-dark" | "stripe-clean" | "vercel-mono";

export const PRESETS: Record<PresetKey, { label: string; description: string; tokens: DesignTokens & { preset: PresetKey } }> = {
  "linear-dark": {
    label: "Linear Dark",
    description: "Pure black canvas, hairline borders, violet and indigo auras.",
    tokens: {
      preset: "linear-dark",
      colors: {
        background: "#000000",
        "surface-low": "#08090A",
        "surface-mid": "#0F1011",
        "surface-high": "#17181A",
        primary: "#5E6AD2",
        "on-primary": "#FFFFFF",
        accent: "#A78BFA",
        heading: "#F7F8F8",
        text: "#D0D6E0",
        muted: "#8A8F98",
        border: "rgba(255, 255, 255, 0.08)",
      },
      fonts: { heading: font("Inter"), display: font("Inter"), body: font("Inter"), mono: font("Geist Mono") },
      typeScale: { minBase: 0.9375, maxBase: 1, minRatio: 1.2, maxRatio: 1.333, minWidth: 360, maxWidth: 1280 },
      lineHeights: { tight: "1.08", snug: "1.3", body: "1.6" },
      letterSpacing: { tight: "-0.03em", snug: "-0.012em", wide: "0.08em" },
      spaceUnit: 8,
      radii: { sm: "6px", md: "10px", lg: "16px", pill: "999px" },
      shadows: {
        sm: "0 1px 2px rgba(0, 0, 0, 0.5)",
        md: "0 0 0 1px rgba(255, 255, 255, 0.06), 0 4px 12px -2px rgba(0, 0, 0, 0.6)",
        lg: "0 0 0 1px rgba(255, 255, 255, 0.06), 0 12px 32px -8px rgba(0, 0, 0, 0.7)",
        xl: "0 0 0 1px rgba(255, 255, 255, 0.08), 0 24px 64px -16px rgba(0, 0, 0, 0.8)",
      },
      blur: { sm: "8px", md: "16px", lg: "32px" },
      glows: {
        subtle: "0 0 0 1px rgba(255, 255, 255, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.06)",
        primary: "0 0 0 1px rgba(94, 106, 210, 0.55), 0 0 24px rgba(94, 106, 210, 0.35)",
      },
      ambient: {
        primary: "radial-gradient(60% 50% at 50% 0%, rgba(94, 106, 210, 0.32), transparent 70%)",
        accent: "radial-gradient(40% 40% at 85% 15%, rgba(167, 139, 250, 0.22), transparent 70%)",
      },
    },
  },
  "stripe-clean": {
    label: "Stripe Clean",
    description: "Bright canvas, indigo-to-purple gradients, soft layered shadows.",
    tokens: {
      preset: "stripe-clean",
      colors: {
        background: "#FFFFFF",
        "surface-low": "#F6F9FC",
        "surface-mid": "#EEF2F7",
        "surface-high": "#FFFFFF",
        primary: "#635BFF",
        "on-primary": "#FFFFFF",
        accent: "#A259FF",
        heading: "#0A2540",
        text: "#425466",
        muted: "#5E6E82",
        border: "#E3E8EE",
      },
      fonts: { heading: font("Geist Sans"), display: font("Geist Sans"), body: font("Geist Sans"), mono: font("Geist Mono") },
      typeScale: { minBase: 1, maxBase: 1.0625, minRatio: 1.2, maxRatio: 1.3, minWidth: 360, maxWidth: 1280 },
      lineHeights: { tight: "1.12", snug: "1.35", body: "1.65" },
      letterSpacing: { tight: "-0.02em", snug: "-0.01em", wide: "0.06em" },
      spaceUnit: 8,
      radii: { sm: "4px", md: "8px", lg: "12px", pill: "999px" },
      shadows: {
        sm: "0 1px 1px rgba(10, 37, 64, 0.06), 0 2px 4px rgba(10, 37, 64, 0.06)",
        md: "0 2px 5px -1px rgba(50, 50, 93, 0.25), 0 1px 3px -1px rgba(0, 0, 0, 0.3)",
        lg: "0 13px 27px -5px rgba(50, 50, 93, 0.25), 0 8px 16px -8px rgba(0, 0, 0, 0.3)",
        xl: "0 30px 60px -12px rgba(50, 50, 93, 0.25), 0 18px 36px -18px rgba(0, 0, 0, 0.3)",
      },
      blur: { sm: "6px", md: "12px", lg: "24px" },
      glows: {
        subtle: "0 0 0 1px rgba(10, 37, 64, 0.08)",
        primary: "0 0 0 1px rgba(99, 91, 255, 0.4), 0 0 0 4px rgba(99, 91, 255, 0.12)",
      },
      ambient: {
        primary: "radial-gradient(70% 60% at 20% 0%, rgba(99, 91, 255, 0.18), transparent 70%)",
        accent: "radial-gradient(50% 50% at 90% 10%, rgba(162, 89, 255, 0.16), transparent 70%)",
        gradient: "linear-gradient(135deg, #635BFF 0%, #A259FF 55%, #FF7EB6 100%)",
      },
    },
  },
  "vercel-mono": {
    label: "Vercel Monochrome",
    description: "True black and white, sharp geometry, dense type.",
    tokens: {
      preset: "vercel-mono",
      colors: {
        background: "#FFFFFF",
        "surface-low": "#FAFAFA",
        "surface-mid": "#F2F2F2",
        "surface-high": "#FFFFFF",
        primary: "#000000",
        "on-primary": "#FFFFFF",
        accent: "#171717",
        heading: "#000000",
        text: "#171717",
        muted: "#666666",
        border: "#EAEAEA",
      },
      fonts: { heading: font("Geist Sans"), display: font("Geist Sans"), body: font("Geist Sans"), mono: font("Geist Mono") },
      typeScale: { minBase: 0.9375, maxBase: 1, minRatio: 1.2, maxRatio: 1.25, minWidth: 360, maxWidth: 1280 },
      lineHeights: { tight: "1.05", snug: "1.25", body: "1.5" },
      letterSpacing: { tight: "-0.045em", snug: "-0.02em", wide: "0.04em" },
      spaceUnit: 8,
      radii: { sm: "4px", md: "6px", lg: "8px", pill: "999px" },
      shadows: {
        sm: "0 0 0 1px rgba(0, 0, 0, 0.08)",
        md: "0 0 0 1px rgba(0, 0, 0, 0.08), 0 2px 4px rgba(0, 0, 0, 0.04)",
        lg: "0 0 0 1px rgba(0, 0, 0, 0.08), 0 8px 16px -4px rgba(0, 0, 0, 0.08)",
        xl: "0 0 0 1px rgba(0, 0, 0, 0.08), 0 24px 48px -12px rgba(0, 0, 0, 0.16)",
      },
      blur: { sm: "4px", md: "8px", lg: "16px" },
      glows: {
        subtle: "0 0 0 1px #EAEAEA",
        primary: "0 0 0 1px #000000, 0 0 0 4px rgba(0, 0, 0, 0.08)",
      },
      ambient: {
        primary: "radial-gradient(50% 50% at 50% 0%, rgba(0, 0, 0, 0.06), transparent 70%)",
      },
    },
  },
};

export const PRESET_KEYS = Object.keys(PRESETS) as PresetKey[];
