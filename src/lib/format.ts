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
  | 'comma-dot'
  | 'dot-comma'
  | 'space-comma'
  | 'apostrophe-dot'
  | 'comma-dot-in';

const FORMAT_TO_LOCALE: Record<NumberFormatType, string> = {
  'comma-dot': 'en-US',
  'dot-comma': 'de-DE',
  'space-comma': 'fr-FR',
  'apostrophe-dot': 'de-CH',
  'comma-dot-in': 'en-IN',
};

// Module-level config — updated via setNumberFormat()
let numberConfig: { format: NumberFormatType; hideFraction: boolean } = {
  format: 'comma-dot',
  hideFraction: false,
};

// Cached formatters — invalidated when config changes
let cachedFormatter: Intl.NumberFormat | null = null;
let cachedFormatterShort: Intl.NumberFormat | null = null;

/** Update the global number format config. Called from preferencesStore. */
export function setNumberFormat(config: {
  format: NumberFormatType;
  hideFraction: boolean;
}) {
  numberConfig = config;
  cachedFormatter = null;
  cachedFormatterShort = null;
}

function getFormatter(): Intl.NumberFormat {
  if (!cachedFormatter) {
    const locale = FORMAT_TO_LOCALE[numberConfig.format] ?? 'en-US';
    cachedFormatter = new Intl.NumberFormat(locale, {
      minimumFractionDigits: numberConfig.hideFraction ? 0 : 2,
      maximumFractionDigits: numberConfig.hideFraction ? 0 : 2,
    });
  }
  return cachedFormatter;
}

function getFormatterShort(): Intl.NumberFormat {
  if (!cachedFormatterShort) {
    const locale = FORMAT_TO_LOCALE[numberConfig.format] ?? 'en-US';
    cachedFormatterShort = new Intl.NumberFormat(locale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  }
  return cachedFormatterShort;
}

// ── Currency symbol config ────────────────────────────────────────────────────

import type { SvgSymbolData } from './currencies';

let currencyConfig: {
  symbol: string;
  svgSymbol?: SvgSymbolData;
  position: 'before' | 'after';
  spaceBetween: boolean;
} = { symbol: '', position: 'before', spaceBetween: false };

/** Update the global currency symbol config. Called from preferencesStore. */
export function setCurrencyConfig(config: {
  symbol: string;
  svgSymbol?: SvgSymbolData;
  position: 'before' | 'after';
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

  let sign = '';
  let value = formatted;
  if (formatted.startsWith('-')) {
    sign = '-';
    value = formatted.slice(1);
  } else if (formatted.startsWith('+')) {
    sign = '+';
    value = formatted.slice(1);
  }

  const space = currencyConfig.spaceBetween ? '\u202F' : '';
  const sym = currencyConfig.symbol;

  const styled =
    currencyConfig.position === 'after'
      ? `${value}${space}${sym}`
      : `\u202A${sym}\u202C${space}${value}`;

  return sign + styled;
}

/** Replacement text shown when privacy mode is active. */
export const PRIVACY_MASK = '•••••';

// ── Formatting ────────────────────────────────────────────────────────────────

/**
 * Format cents with sign: "+1,234.56" or "-1,234.56".
 * Positive values get a "+" prefix, negative get "-", zero shows "0.00".
 */
export function formatAmount(cents: number): string {
  const formatted = getFormatter().format(Math.abs(cents) / 100);
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
export function formatBalance(cents: number): string {
  const formatted = getFormatter().format(Math.abs(cents) / 100);
  const result = cents < 0 ? `-${formatted}` : formatted;
  return applyCurrencyStyling(result);
}

/**
 * Format cents without decimals: "1,234" or "-1,234".
 * Used for compact display where precision isn't needed.
 */
export function formatAmountShort(cents: number): string {
  const formatted = getFormatterShort().format(Math.abs(cents) / 100);
  const result = cents < 0 ? `-${formatted}` : formatted;
  return applyCurrencyStyling(result);
}

// ── Structured formatting (for component-based rendering with SVG symbols) ────

export type FormattedAmountParts = {
  sign: '' | '+' | '-';
  number: string;
  symbol: string;
  svgSymbol?: SvgSymbolData;
  position: 'before' | 'after';
  spaceBetween: boolean;
};

/**
 * Return structured parts for component-based rendering.
 * Used by Amount and CurrencyInput when an SVG symbol is active.
 */
export function formatAmountParts(cents: number, showSign = false): FormattedAmountParts {
  const formatted = getFormatter().format(Math.abs(cents) / 100);
  let sign: '' | '+' | '-' = '';
  if (showSign && cents > 0) sign = '+';
  else if (cents < 0) sign = '-';

  return {
    sign,
    number: formatted,
    symbol: currencyConfig.symbol,
    svgSymbol: currencyConfig.svgSymbol,
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
  // Lazy require to avoid circular dependency at module load
  const { usePrivacyStore } = require('../stores/privacyStore');
  if (usePrivacyStore.getState().privacyMode) return PRIVACY_MASK;
  return showSign ? formatAmount(cents) : formatBalance(cents);
}

// ── Parsing ───────────────────────────────────────────────────────────────────

/**
 * Get the decimal separator for the current number format.
 */
function getDecimalSeparator(): string {
  const locale = FORMAT_TO_LOCALE[numberConfig.format] ?? 'en-US';
  const parts = new Intl.NumberFormat(locale).formatToParts(1.1);
  return parts.find((p) => p.type === 'decimal')?.value ?? '.';
}

/**
 * Parse a user-entered amount string to cents.
 * Respects the current number format's decimal separator.
 * @example parseCents("1,234.56") → 123456  (comma-dot)
 * @example parseCents("1.234,56") → 123456  (dot-comma)
 * @example parseCents("50") → 5000
 * @example parseCents("abc") → 0
 */
export function parseCents(input: string): number {
  const decSep = getDecimalSeparator();
  // Remove everything except digits and decimal separator
  let cleaned = '';
  for (const ch of input) {
    if (ch >= '0' && ch <= '9') cleaned += ch;
    else if (ch === decSep) cleaned += '.';
  }
  const num = parseFloat(cleaned);
  if (isNaN(num)) return 0;
  return Math.round(num * 100);
}
