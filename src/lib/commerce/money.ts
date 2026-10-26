/**
 * Money is stored as an integer in the currency's minor unit (cents), the
 * way Stripe expects it, so totals never pick up floating-point drift.
 */

/** ISO 4217 currencies without a minor unit (Stripe's list). */
const ZERO_DECIMAL = new Set(["BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA", "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF"]);

export const minorDigits = (currency: string) => (ZERO_DECIMAL.has(currency.toUpperCase()) ? 0 : 2);

export function toMajor(minor: number, currency: string) {
  return minor / 10 ** minorDigits(currency);
}

/** "12.5" / "12,50" / "1 299.00" → 1250 / 1250 / 129900. Null when it isn't a non-negative amount. */
export function parseMoney(input: string, currency: string): number | null {
  const cleaned = input.trim().replace(/[\s ']/g, "");
  if (!cleaned) return null;
  // A lone comma followed by one or two digits is a decimal comma ("12,50").
  const normalised = /^\d+,\d{1,2}$/.test(cleaned) ? cleaned.replace(",", ".") : cleaned.replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(normalised)) return null;
  const digits = minorDigits(currency);
  const value = Math.round(Number(normalised) * 10 ** digits);
  return Number.isSafeInteger(value) ? value : null;
}

/** "1250" → "12.50" for form inputs. */
export function moneyInput(minor: number | null | undefined, currency: string) {
  if (minor === null || minor === undefined) return "";
  return toMajor(minor, currency).toFixed(minorDigits(currency));
}

export function formatMoney(minor: number, currency: string, locale = "en-US") {
  try {
    return new Intl.NumberFormat(locale || "en-US", { style: "currency", currency }).format(toMajor(minor, currency));
  } catch {
    return `${toMajor(minor, currency).toFixed(minorDigits(currency))} ${currency}`;
  }
}
