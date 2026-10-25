import { z } from "zod";
import { safeCssValue } from "./css-values";
import { TOKEN_GROUPS, type DesignTokens, type TokenGroup } from "./tokens";

/**
 * Validation for saved tokens. The compiler already drops unsafe values, but
 * the server refuses them outright so a designer sees why a value was not
 * kept, and nothing unsafe is ever stored.
 */

const MAX_PER_GROUP = 48;
const tokenName = z.string().regex(/^[a-z][a-z0-9-]{0,31}$/, "Token names use lowercase letters, digits and dashes");

const cssValue = (label: string) =>
  z
    .string()
    .trim()
    .refine((v) => safeCssValue(v) !== null, { message: `${label} contains characters that aren't allowed in CSS here` });

const COLOR = /^(#[0-9a-f]{3,8}|(rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|color-mix)\([^()]*(\([^()]*\)[^()]*)*\)|var\(--color-[a-z0-9-]+\)|transparent|currentcolor|[a-z]{3,20})$/i;

const color = cssValue("A colour").refine((v) => COLOR.test(v), { message: "Colours are hex, rgb(), hsl(), oklch() or another colour token" });

const group = (value: z.ZodType<string>) =>
  z.record(tokenName, value).refine((r) => Object.keys(r).length <= MAX_PER_GROUP, { message: `At most ${MAX_PER_GROUP} tokens per group` });

const typeScale = z
  .object({
    minBase: z.number().min(0.625).max(2),
    maxBase: z.number().min(0.625).max(2.5),
    minRatio: z.number().min(1).max(1.8),
    maxRatio: z.number().min(1).max(1.8),
    minWidth: z.number().int().min(240).max(1600),
    maxWidth: z.number().int().min(480).max(2560),
  })
  .refine((s) => s.minWidth < s.maxWidth, { message: "The type scale's smallest width must be below its largest" });

const groupSchemas: Record<TokenGroup, z.ZodType<Record<string, string>>> = Object.fromEntries(
  (Object.keys(TOKEN_GROUPS) as TokenGroup[]).map((g) => [g, group(g === "colors" ? color : cssValue(`A ${g} token`))]),
) as unknown as Record<TokenGroup, z.ZodType<Record<string, string>>>;

export const designTokensSchema = z.object({
  preset: z.string().max(40).optional(),
  typeScale: typeScale.optional(),
  spaceUnit: z.number().int().min(2).max(16).optional(),
  ...Object.fromEntries(Object.entries(groupSchemas).map(([k, s]) => [k, s.optional()])),
}) as unknown as z.ZodType<DesignTokens>;

/** Validated tokens, or the first problem as a sentence with the field that caused it. */
export function parseDesignTokens(raw: unknown): { ok: true; tokens: DesignTokens } | { ok: false; error: string } {
  const res = designTokensSchema.safeParse(raw);
  if (res.success) return { ok: true, tokens: res.data };
  const issue = res.error.issues[0];
  const where = issue?.path.length ? ` (${issue.path.join(".")})` : "";
  return { ok: false, error: `${issue?.message ?? "Invalid design tokens"}${where}` };
}
