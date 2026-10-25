/** Rejects anything that could break out of a declaration or the <style> element. */
export function safeCssValue(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const v = String(value).trim();
  if (!v || v.length > 300 || /[;{}<>\\]|\/\*|@import|expression\(|url\(/i.test(v)) return null;
  return v;
}

export const safeIdent = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, "");
