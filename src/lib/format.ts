/**
 * Centralized currency formatting utilities.
 *
 * The app stores money as integers in cents (e.g. 123456 = $1,234.56).
 * All formatting helpers live here so we have a single place to change
 * locale, currency, or formatting library in the future.
 *
 * Uses a cached Intl.NumberFormat instance for performance.
 * Sign handling is manual to avoid Hermes `signDisplay` bugs on Android.
 */

// Cached formatter instance — reused across all calls.
const currencyFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const currencyFmtShort = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

// ── Formatting ────────────────────────────────────────────────────────────────

/**
 * Format cents with sign: "+$1,234.56" or "-$1,234.56".
 * Positive values get a "+" prefix, negative get "-", zero shows "$0.00".
 */
export function formatAmount(cents: number): string {
  const formatted = currencyFmt.format(Math.abs(cents) / 100);
  if (cents > 0) return `+${formatted}`;
  if (cents < 0) return `-${formatted}`;
  return formatted;
}

/**
 * Format cents without "+" sign: "$1,234.56" or "-$1,234.56".
 * Used for balances where positive values don't need a sign.
 */
export function formatBalance(cents: number): string {
  const formatted = currencyFmt.format(Math.abs(cents) / 100);
  if (cents < 0) return `-${formatted}`;
  return formatted;
}

/**
 * Format cents without decimals: "$1,234" or "-$1,234".
 * Used for compact display where precision isn't needed.
 */
export function formatAmountShort(cents: number): string {
  const formatted = currencyFmtShort.format(Math.abs(cents) / 100);
  if (cents < 0) return `-${formatted}`;
  return formatted;
}

// ── Parsing ───────────────────────────────────────────────────────────────────

/**
 * Parse a user-entered dollar string to cents.
 * Strips non-numeric characters except decimal point.
 * @example parseCents("$1,234.56") → 123456
 * @example parseCents("50") → 5000
 * @example parseCents("abc") → 0
 */
export function parseCents(input: string): number {
  const cleaned = input.replace(/[^0-9.]/g, "");
  const num = parseFloat(cleaned);
  if (isNaN(num)) return 0;
  return Math.round(num * 100);
}
