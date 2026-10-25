/** URL slugs: lowercase ASCII words joined by hyphens. */
export function slugify(input: string, max = 80): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
}

/** Machine keys for post types, taxonomies and fields: lowercase with underscores. */
export function keyify(input: string, max = 40): string {
  const k = slugify(input, max).replace(/-/g, "_");
  return /^[a-z]/.test(k) ? k : k ? `x_${k}`.slice(0, max) : "";
}

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/;

export type SlugRule = "TITLE" | "DATE_TITLE" | "ID";

export function slugFromRule(rule: SlugRule, title: string, now = new Date()): string {
  switch (rule) {
    case "TITLE":
      return slugify(title) || "untitled";
    case "DATE_TITLE":
      return `${now.toISOString().slice(0, 10)}-${slugify(title) || "untitled"}`;
    case "ID":
      return Math.random().toString(36).slice(2, 10);
  }
}

/** Picks the first free slug: "name", "name-2", "name-3"… */
export async function uniqueSlug(base: string, taken: (slug: string) => Promise<boolean>): Promise<string> {
  if (!(await taken(base))) return base;
  for (let i = 2; i < 500; i++) {
    const candidate = `${base}-${i}`;
    if (!(await taken(candidate))) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}
