import { formatBalance } from "./format";

/** Max value: $999,999.99 = 99999999 cents */
export const MAX_CENTS = 99999999;

/**
 * Format cents as a display string using the configured number format.
 * 152 → "1.52" (comma-dot) or "1,52" (dot-comma)
 * Supports negative values: -152 → "-1.52"
 */
export function formatCents(c: number): string {
  // Delegate to formatBalance which uses the configured Intl.NumberFormat
  return formatBalance(c);
}

/**
 * Convert cents to a dollar string for expression mode.
 * 150 → "1.50", 1500 → "15", 0 → "0"
 */
export function centsToDollars(cents: number): string {
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const remainder = abs % 100;
  if (remainder === 0) return String(dollars);
  return `${dollars}.${String(remainder).padStart(2, "0")}`;
}

/**
 * Convert a dollar amount to cents, clamped to MAX_CENTS.
 */
export function dollarsToCents(dollars: number): number {
  return Math.min(Math.round(Math.abs(dollars) * 100), MAX_CENTS);
}

/**
 * Format an expression for display: space around operators.
 * "1.50+0.75" → "1.50 + 0.75"
 */
export function formatExpression(expr: string): string {
  return expr
    .replace(/([+\-*/])/g, " $1 ")
    .replace(/\s+/g, " ")
    .trim();
}
