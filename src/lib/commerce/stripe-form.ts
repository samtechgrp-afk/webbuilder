export type FormValue = string | number | boolean | null | undefined | FormValue[] | { [k: string]: FormValue };

/** Stripe's form encoding: nested objects and arrays become `a[b][0][c]=…`. */
export function formEncode(value: Record<string, FormValue>): string {
  const out = new URLSearchParams();
  const walk = (prefix: string, v: FormValue) => {
    if (v === null || v === undefined) return;
    if (Array.isArray(v)) v.forEach((item, i) => walk(`${prefix}[${i}]`, item));
    else if (typeof v === "object") for (const [k, inner] of Object.entries(v)) walk(prefix ? `${prefix}[${k}]` : k, inner);
    else out.append(prefix, String(v));
  };
  walk("", value);
  return out.toString();
}
