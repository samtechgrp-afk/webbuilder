import { safeCssValue, safeIdent } from "./css-values";
import type { SiteFontFace } from "./fonts";

/**
 * Global design tokens. One JSON object per site (Site.designTokens) compiles
 * to CSS custom properties on `.site-root`, so the editor canvas, the live
 * site and the design-system preview all read the same variables.
 *
 * The named groups are open-ended maps (a designer can add `colors.gold`),
 * while the generated scales (fluid type, 8pt spacing) come from a few
 * numbers. Everything is optional: a site without a type scale or spacing
 * unit compiles exactly as it did before phase 4.
 */

export interface TypeScale {
  /** Body size in rem at the smallest and largest container widths. */
  minBase: number;
  maxBase: number;
  /** Modular ratio between steps at each end (e.g. 1.2 minor third, 1.333 perfect fourth). */
  minRatio: number;
  maxRatio: number;
  /** Container widths in px where the scale stops growing. */
  minWidth: number;
  maxWidth: number;
}

export interface DesignTokens {
  /** The preset these tokens started from, for display only. */
  preset?: string;
  colors?: Record<string, string>;
  fonts?: Record<string, string>;
  /** Fixed sizes. These win over the generated type scale for the same name. */
  fontSizes?: Record<string, string>;
  typeScale?: TypeScale;
  lineHeights?: Record<string, string>;
  letterSpacing?: Record<string, string>;
  /** Grid unit in px; emits `--space-1` … `--space-32` as multiples of it. */
  spaceUnit?: number;
  spacing?: Record<string, string>;
  radii?: Record<string, string>;
  /** Multi-layer elevations. */
  shadows?: Record<string, string>;
  /** Backdrop blur radii for glass surfaces. */
  blur?: Record<string, string>;
  /** Border glows, written as box-shadow values. */
  glows?: Record<string, string>;
  /** Radial ambient glows, written as background images. */
  ambient?: Record<string, string>;
  /**
   * The site's custom fonts (SiteFont rows), attached when a page is loaded
   * so every renderer emits their @font-face / @import rules. Never stored
   * in Site.designTokens: the tokens schema drops it on save.
   */
  fontFaces?: SiteFontFace[];
}

/** The open-ended groups and the variable prefix each compiles to. */
export const TOKEN_GROUPS = {
  colors: "color",
  fonts: "font",
  fontSizes: "text",
  lineHeights: "leading",
  letterSpacing: "tracking",
  spacing: "space",
  radii: "radius",
  shadows: "shadow",
  blur: "blur",
  glows: "glow",
  ambient: "ambient",
} as const satisfies Partial<Record<keyof DesignTokens, string>>;

export type TokenGroup = keyof typeof TOKEN_GROUPS;

/** Type scale steps, smallest first, with their exponent on the ratio. */
export const TYPE_STEPS = { small: -1, body: 0, lead: 1, h4: 2, h3: 3, h2: 4, h1: 5, display: 6 } as const;
export type TypeStep = keyof typeof TYPE_STEPS;

export const SPACE_STEPS = 32;

const num = (n: number) => String(Math.round(n * 10000) / 10000);

/**
 * A size that grows linearly from `minRem` at `minWidth` to `maxRem` at
 * `maxWidth`, clamped at both ends. The slope is in `cqi` (1% of the site
 * container's width) rather than `vw`, so the editor's tablet and mobile
 * previews scale type exactly like a real device instead of tracking the
 * editor window. Operators get spaces on both sides, which calc() requires.
 */
export function fluidClamp(minRem: number, maxRem: number, minWidth: number, maxWidth: number): string {
  if (Math.abs(maxRem - minRem) < 0.0001 || maxWidth <= minWidth) return `${num(minRem)}rem`;
  const slope = (maxRem - minRem) / ((maxWidth - minWidth) / 16); // rem per rem of width
  const intercept = minRem - slope * (minWidth / 16);
  const fluid = `${num(slope * 100)}cqi`;
  const preferred =
    Math.abs(intercept) < 0.0001 ? fluid : intercept > 0 ? `${num(intercept)}rem + ${fluid}` : `${fluid} - ${num(-intercept)}rem`;
  const [lo, hi] = minRem < maxRem ? [minRem, maxRem] : [maxRem, minRem];
  return `clamp(${num(lo)}rem, ${preferred}, ${num(hi)}rem)`;
}

/** Size of one step of the modular scale at both ends, in rem. */
export function typeStepRange(scale: TypeScale, step: TypeStep): [number, number] {
  const n = TYPE_STEPS[step];
  return [scale.minBase * scale.minRatio ** n, scale.maxBase * scale.maxRatio ** n];
}

export function fluidTypeScale(scale: TypeScale): Record<TypeStep, string> {
  const out = {} as Record<TypeStep, string>;
  for (const step of Object.keys(TYPE_STEPS) as TypeStep[]) {
    const [min, max] = typeStepRange(scale, step);
    out[step] = fluidClamp(min, max, scale.minWidth, scale.maxWidth);
  }
  return out;
}

export function spaceScale(unitPx: number): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 1; i <= SPACE_STEPS; i++) out[String(i)] = `${num((i * unitPx) / 16)}rem`;
  return out;
}

/** Every variable the tokens define, as name → value, in cascade order. */
export function tokenVariables(tokens: DesignTokens): [string, string][] {
  const vars: [string, string][] = [];
  const push = (name: string, value: unknown) => {
    const v = safeCssValue(value);
    const id = safeIdent(name);
    if (v && id) vars.push([`--${id}`, v]);
  };
  // Generated scales first, so a named token with the same name overrides them.
  if (tokens.typeScale) for (const [step, v] of Object.entries(fluidTypeScale(tokens.typeScale))) push(`text-${step}`, v);
  if (tokens.spaceUnit) for (const [step, v] of Object.entries(spaceScale(tokens.spaceUnit))) push(`space-${step}`, v);
  for (const [group, prefix] of Object.entries(TOKEN_GROUPS) as [TokenGroup, string][]) {
    for (const [name, value] of Object.entries(tokens[group] ?? {})) push(`${prefix}-${safeIdent(name)}`, value);
  }
  return vars;
}

export function tokensToCss(tokens: DesignTokens, scope = ".site-root"): string {
  return `${scope}{${tokenVariables(tokens)
    .map(([k, v]) => `${k}:${v}`)
    .join(";")}}`;
}

/** What a style field can pick from, per kind of value. */
export type TokenKind = "color" | "background" | "font" | "text" | "leading" | "tracking" | "space" | "radius" | "shadow" | "blur";

export interface TokenOption {
  label: string;
  value: string;
  /** Resolved value, for swatches and tooltips. */
  preview: string;
}

/** Token options for one kind of style field, as `var(--…)` references. */
export function tokenOptions(tokens: DesignTokens, kind: TokenKind): TokenOption[] {
  const vars = new Map(tokenVariables(tokens));
  const pick = (prefix: string, wrap = (v: string) => v) =>
    [...vars.entries()]
      .filter(([k]) => k.startsWith(`--${prefix}-`))
      .map(([k, preview]) => ({ label: k.slice(prefix.length + 3), value: wrap(`var(${k})`), preview }));
  switch (kind) {
    case "background":
      return [...pick("color"), ...pick("ambient")];
    case "shadow":
      return [...pick("shadow"), ...pick("glow")];
    case "blur":
      return pick("blur", (v) => `blur(${v})`);
    default:
      return pick(kind);
  }
}

export const isTokenRef = (v: string | undefined) => !!v && /^(var\(--[\w-]+\)|blur\(var\(--[\w-]+\)\))$/.test(v.trim());

/**
 * Applying a preset replaces the values it defines and keeps the site's own
 * extra tokens (say `colors.gold`), so pages that reference them still render.
 */
export function applyPreset(current: DesignTokens, preset: DesignTokens & { preset: string }): DesignTokens {
  const next: DesignTokens = { ...current, ...preset };
  for (const group of Object.keys(TOKEN_GROUPS) as TokenGroup[]) {
    if (current[group] || preset[group]) next[group] = { ...current[group], ...preset[group] };
  }
  return next;
}

/** Resolves `var(--color-x)` against the token palette so contrast can be checked. */
export function resolveColor(value: string | undefined, tokens: DesignTokens): string | undefined {
  if (!value) return undefined;
  const m = value.match(/^var\(--color-([\w-]+)\)$/);
  return m ? tokens.colors?.[m[1]] : value;
}
