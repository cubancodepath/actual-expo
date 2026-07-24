/**
 * Centralized currency formatting utilities.
 *
 * The app stores money as integers in cents (e.g. 123456 = $1,234.56).
 * All formatting helpers live here so we have a single place to change
 * locale, currency, or formatting library in the future.
 *
 * Number format is configurable via `setNumberFormat()` which is called
 * when preferences load (from preferencesStore). Maps format strings
 * to Intl.NumberFormat locales following Actual Budget's convention.
 */

export type NumberFormatType =
  | "comma-dot"
  | "dot-comma"
  | "space-comma"
  | "apostrophe-dot"
  | "comma-dot-in";

/** Alias matching upstream loot-core's `NumberFormats` name (same set). */
export type NumberFormats = NumberFormatType;

const FORMAT_TO_LOCALE: Record<NumberFormatType, string> = {
  "comma-dot": "en-US",
  "dot-comma": "de-DE",
  "space-comma": "fr-FR",
  "apostrophe-dot": "de-CH",
  "comma-dot-in": "en-IN",
};

/**
 * BCP-47 locale that reproduces a given number format's grouping/decimal
 * separators. Exposed so React components (e.g. `Money`) can feed heroui's
 * `NumberValue` the SAME Intl locale the engine uses — keeping one source of
 * truth instead of a second, divergent formatter.
 */
export function localeForNumberFormat(format: NumberFormatType): string {
  return FORMAT_TO_LOCALE[format] ?? "en-US";
}

/** Fraction digits for money display: 0 when decimals are hidden, else 2. */
export function getFractionDigits(hideFraction: boolean): number {
  // TODO(currency): upstream derives this from `activeCurrency.decimalPlaces`
  // (e.g. JPY = 0). Pair with desktop-client/src/hooks/useFormat.ts when the
  // currency UI lands.
  return hideFraction ? 0 : 2;
}

// Module-level config — updated via setNumberFormat()
let numberConfig: { format: NumberFormatType; hideFraction: boolean } = {
  format: "comma-dot",
  hideFraction: false,
};

// Cached formatters — invalidated when config changes
let cachedFormatter: Intl.NumberFormat | null = null;
let cachedFormatterShort: Intl.NumberFormat | null = null;

/** Update the global number format config. Called from preferencesStore. */
export function setNumberFormat(config: { format: NumberFormatType; hideFraction: boolean }) {
  numberConfig = config;
  cachedFormatter = null;
  cachedFormatterShort = null;
}

function getFormatter(): Intl.NumberFormat {
  if (!cachedFormatter) {
    const locale = FORMAT_TO_LOCALE[numberConfig.format] ?? "en-US";
    cachedFormatter = new Intl.NumberFormat(locale, {
      minimumFractionDigits: numberConfig.hideFraction ? 0 : 2,
      maximumFractionDigits: numberConfig.hideFraction ? 0 : 2,
    });
  }
  return cachedFormatter;
}

function getFormatterShort(): Intl.NumberFormat {
  if (!cachedFormatterShort) {
    const locale = FORMAT_TO_LOCALE[numberConfig.format] ?? "en-US";
    cachedFormatterShort = new Intl.NumberFormat(locale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  }
  return cachedFormatterShort;
}

/**
 * Normalize the apostrophe grouping separator to U+2019, matching upstream's
 * `getNumberFormat` (Intl may emit a keyboard U+0027 depending on the ICU
 * version). No-op for every other format.
 */
function normalizeNumber(formatted: string): string {
  return normalizeNumberFor(numberConfig.format, formatted);
}

/**
 * Pure variant of {@link normalizeNumber} for consumers that format outside the
 * engine (e.g. `Money` feeding heroui's `NumberValue`) and know their format.
 */
export function normalizeNumberFor(format: NumberFormatType, formatted: string): string {
  return format === "apostrophe-dot" ? formatted.replace(/'/g, "’") : formatted;
}

// ── Currency symbol config ────────────────────────────────────────────────────

let currencyConfig: {
  symbol: string;
  position: "before" | "after";
  spaceBetween: boolean;
} = { symbol: "", position: "before", spaceBetween: false };

/** Update the global currency symbol config. Called from preferencesStore. */
export function setCurrencyConfig(config: {
  symbol: string;
  position: "before" | "after";
  spaceBetween: boolean;
}) {
  currencyConfig = config;
}

/**
 * Wrap a formatted numeric string with the configured currency symbol.
 * No-op when symbol is empty (currency feature disabled).
 *
 * Handles: sign extraction, position (before/after), optional narrow
 * non-breaking space, and LTR embedding marks for RTL symbols.
 */
function applyCurrencyStyling(formatted: string): string {
  if (!currencyConfig.symbol) return formatted;

  let sign = "";
  let value = formatted;
  if (formatted.startsWith("-")) {
    sign = "-";
    value = formatted.slice(1);
  } else if (formatted.startsWith("+")) {
    sign = "+";
    value = formatted.slice(1);
  }

  const space = currencyConfig.spaceBetween ? "\u202F" : "";
  const sym = currencyConfig.symbol;

  const styled =
    currencyConfig.position === "after"
      ? `${value}${space}${sym}`
      : `\u202A${sym}\u202C${space}${value}`;

  return sign + styled;
}

/** Replacement text shown when privacy mode is active. */
export const PRIVACY_MASK = "•••••";

// Module-level privacy flag, updated by applyFormatConfig() when the synced
// `isPrivacyEnabled` pref changes. Kept local (not a store read) so imperative
// formatters stay pure and avoid a circular import through the prefs layer.
let privacyMode = false;

/** Update privacy mode. Called from applyFormatConfig on pref load/change. */
export function setPrivacyMode(enabled: boolean): void {
  privacyMode = enabled;
}

// ── Formatting ────────────────────────────────────────────────────────────────

/**
 * Format cents with sign: "+1,234.56" or "-1,234.56".
 * Positive values get a "+" prefix, negative get "-", zero shows "0.00".
 */
export function formatAmount(cents: number): string {
  const formatted = normalizeNumber(getFormatter().format(Math.abs(cents) / 100));
  let result: string;
  if (cents > 0) result = `+${formatted}`;
  else if (cents < 0) result = `-${formatted}`;
  else result = formatted;
  return applyCurrencyStyling(result);
}

/**
 * Format cents without "+" sign: "1,234.56" or "-1,234.56".
 * Used for balances where positive values don't need a sign.
 */
export function integerToCurrency(cents: number): string {
  const formatted = normalizeNumber(getFormatter().format(Math.abs(cents) / 100));
  const result = cents < 0 ? `-${formatted}` : formatted;
  return applyCurrencyStyling(result);
}

/**
 * Format cents without decimals: "1,234" or "-1,234".
 * Used for compact display where precision isn't needed.
 */
export function formatAmountShort(cents: number): string {
  const formatted = normalizeNumber(getFormatterShort().format(Math.abs(cents) / 100));
  const result = cents < 0 ? `-${formatted}` : formatted;
  return applyCurrencyStyling(result);
}

/** Drop a trailing ".0" so 1.0k → 1k. */
function trimDecimalZero(s: string): string {
  return s.replace(/\.0$/, "");
}

/**
 * Compact currency for chart axes / dense KPIs: "$1.2M", "-$10k", "$540".
 * Abbreviates thousands/millions/billions (k/M/B) with one decimal, keeps the
 * app's currency symbol/position. Reusable across all report widgets.
 */
export function formatAmountCompact(cents: number): string {
  const abs = Math.abs(cents) / 100;
  let s: string;
  if (abs >= 1e9) s = trimDecimalZero((abs / 1e9).toFixed(1)) + "B";
  else if (abs >= 1e6) s = trimDecimalZero((abs / 1e6).toFixed(1)) + "M";
  else if (abs >= 1e3) s = trimDecimalZero((abs / 1e3).toFixed(1)) + "k";
  else s = String(Math.round(abs));
  return applyCurrencyStyling(cents < 0 ? `-${s}` : s);
}

// ── Structured formatting (for component-based rendering with SVG symbols) ────

export type FormattedAmountParts = {
  sign: "" | "+" | "-";
  number: string;
  symbol: string;
  position: "before" | "after";
  spaceBetween: boolean;
};

/**
 * Return structured parts for component-based rendering.
 * Used by Amount and CurrencyInput when an SVG symbol is active.
 */
export function formatAmountParts(cents: number, showSign = false): FormattedAmountParts {
  const formatted = normalizeNumber(getFormatter().format(Math.abs(cents) / 100));
  let sign: "" | "+" | "-" = "";
  if (showSign && cents > 0) sign = "+";
  else if (cents < 0) sign = "-";

  return {
    sign,
    number: formatted,
    symbol: currencyConfig.symbol,
    position: currencyConfig.position,
    spaceBetween: currencyConfig.spaceBetween,
  };
}

// ── Privacy-aware formatting (for strings / accessibility labels) ─────────────

/**
 * Format cents respecting privacy mode. Reads store directly (no hook needed).
 * Use this for accessibility labels and string interpolation where
 * the Amount component can't be used.
 */
export function formatPrivacyAware(cents: number, showSign = false): string {
  if (privacyMode) return PRIVACY_MASK;
  return showSign ? formatAmount(cents) : integerToCurrency(cents);
}

// ── Parsing ───────────────────────────────────────────────────────────────────

/**
 * Get the decimal separator for the current number format.
 */
function getDecimalSeparator(): string {
  const locale = FORMAT_TO_LOCALE[numberConfig.format] ?? "en-US";
  const parts = new Intl.NumberFormat(locale).formatToParts(1.1);
  return parts.find((p) => p.type === "decimal")?.value ?? ".";
}

/**
 * Parse a user-entered amount string to cents.
 * Respects the current number format's decimal separator.
 * @example currencyToInteger("1,234.56") → 123456  (comma-dot)
 * @example currencyToInteger("1.234,56") → 123456  (dot-comma)
 * @example currencyToInteger("50") → 5000
 * @example currencyToInteger("abc") → 0
 */
export function currencyToInteger(input: string): number {
  const decSep = getDecimalSeparator();
  // Remove everything except digits and decimal separator
  let cleaned = "";
  for (const ch of input) {
    if (ch >= "0" && ch <= "9") cleaned += ch;
    else if (ch === decSep) cleaned += ".";
  }
  const num = parseFloat(cleaned);
  if (isNaN(num)) return 0;
  return Math.round(num * 100);
}

// ── Amount helpers (merged from src/lib/currency.ts; upstream: shared/util.ts) ──

/** Max value: $9,999,999.99 = 999999999 cents */
export const MAX_CENTS = 999999999;

/** Apply direction to a magnitude: inflow stays positive, outflow negates. */
export const signedCents = (magnitude: number, inflow: boolean): number =>
  inflow ? magnitude : -magnitude;

/**
 * Format cents as a display string using the configured number format.
 * 152 → "1.52" (comma-dot) or "1,52" (dot-comma)
 * Supports negative values: -152 → "-1.52"
 */
export function formatCents(c: number): string {
  // Delegate to integerToCurrency which uses the configured Intl.NumberFormat
  return integerToCurrency(c);
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
 * Convert a dollar amount to integer cents. Ported from loot-core's
 * `amountToInteger` — the inverse of `integerToAmount`. Used by the rules
 * formula engine and custom formula functions.
 */
export function amountToInteger(amount: number, decimalPlaces = 2): number {
  const multiplier = Math.pow(10, decimalPlaces);
  return Math.round(amount * multiplier);
}

/**
 * Convert integer cents to a dollar amount. Ported from loot-core's
 * `integerToAmount`.
 */
export function integerToAmount(integerAmount: number, decimalPlaces = 2): number {
  const divisor = Math.pow(10, decimalPlaces);
  return integerAmount / divisor;
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
