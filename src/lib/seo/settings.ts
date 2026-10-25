import { z } from "zod";

/**
 * Site-wide SEO defaults, kept in Site.settings.seo next to the tagline and
 * 404 page. Each entry's own SEO fields win over these.
 */
export interface SiteSeo {
  /** `%s` is replaced by the page title, e.g. "%s · Aurelia Interiors". */
  titleTemplate?: string;
  /** Title of the home page in search results; defaults to the site name. */
  homeTitle?: string;
  defaultDescription?: string;
  defaultOgImageId?: string | null;
  /** "@handle" for twitter:site. */
  twitterHandle?: string;
  googleVerification?: string;
  bingVerification?: string;
  /** Ask search engines not to index the whole site (staging, pre-launch). */
  discourageIndexing?: boolean;
  /** Post type ids left out of the sitemap (and given noindex). */
  excludedPostTypeIds?: string[];
}

const token = z.string().trim().max(120).regex(/^[\w.:-]*$/, "Verification codes are letters, digits, dots, dashes and colons");

export const siteSeoSchema = z.object({
  titleTemplate: z
    .string()
    .trim()
    .max(80)
    .refine((v) => !v || v.includes("%s"), { message: "The title template needs %s where the page title goes" }),
  homeTitle: z.string().trim().max(70),
  defaultDescription: z.string().trim().max(170),
  defaultOgImageId: z.string().max(40).nullable(),
  twitterHandle: z
    .string()
    .trim()
    .max(16)
    .refine((v) => !v || /^@?\w{1,15}$/.test(v), { message: "Use a handle like @aurelia" })
    .transform((v) => (v && !v.startsWith("@") ? `@${v}` : v)),
  googleVerification: token,
  bingVerification: token,
  discourageIndexing: z.boolean(),
  excludedPostTypeIds: z.array(z.string().max(40)).max(100),
});

export type SiteSeoInput = z.input<typeof siteSeoSchema>;

export const readSiteSeo = (settings: unknown): SiteSeo => (((settings ?? {}) as { seo?: SiteSeo }).seo ?? {});
