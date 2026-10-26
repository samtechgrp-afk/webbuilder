/** Site address rules, shared by the new-site form and the seeder. */

export const SUBDOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;
const RESERVED = new Set(["www", "admin", "api", "app", "login", "logout", "mail", "static", "assets", "uploads", "sites", "site-404", "cdn", "dashboard", "help", "status", "docs"]);

export function subdomainProblem(subdomain: string): string | null {
  if (!SUBDOMAIN_RE.test(subdomain)) return "Use 3 to 40 lowercase letters, digits or dashes, starting and ending with a letter or digit";
  if (subdomain.includes("--")) return "Use single dashes";
  if (RESERVED.has(subdomain)) return "That address is reserved";
  return null;
}

/** "Northwind Coffee Co." → "northwind-coffee-co" */
export const suggestSubdomain = (name: string) =>
  name.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "");
