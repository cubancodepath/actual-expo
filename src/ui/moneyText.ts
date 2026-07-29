import type { UseFormatResult } from "@/lib/hooks/useFormat";

/**
 * The pieces of `useFormat()` that determine how an amount reads. Narrowed to a
 * structural subset so callers can pass the whole `useFormat()` result.
 */
export type MoneyTextFormat = Pick<
  UseFormatResult,
  | "locale"
  | "minimumFractionDigits"
  | "maximumFractionDigits"
  | "symbol"
  | "symbolPosition"
  | "spaceBetween"
>;

export type MoneyTextOptions = {
  /** Leading "+" on positive amounts, mirroring `Money`'s `showSign`. */
  showSign?: boolean;
  /** Drop decimals regardless of the currency, mirroring `Money`'s `noDecimals`. */
  noDecimals?: boolean;
};

// `Intl.NumberFormat` construction is the expensive part, and a budget screen
// asks for one per amount per render. Cache by the only inputs that change it.
const formatters = new Map<string, Intl.NumberFormat>();

function numberFormatter(locale: string, digits: number): Intl.NumberFormat {
  const key = `${locale}|${digits}`;
  let formatter = formatters.get(key);
  if (formatter === undefined) {
    formatter = new Intl.NumberFormat(locale, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    formatters.set(key, formatter);
  }
  return formatter;
}

/**
 * The plain-text form of an amount — what a screen reader should say, and what
 * a composed row label embeds.
 *
 * Deliberately built from the same pieces `Money` renders (sign outside the
 * symbol, symbol at the configured position and spacing) so the spoken string
 * and the visible string never drift. The one difference is intentional: the
 * LTR embedding marks `Money` wraps the symbol in are a rendering fix for
 * bidirectional text, and speech synthesis has no business pronouncing them.
 */
export function moneyText(
  cents: number,
  format: MoneyTextFormat,
  { showSign = false, noDecimals = false }: MoneyTextOptions = {},
): string {
  const digits = noDecimals ? 0 : format.minimumFractionDigits;
  const amount = numberFormatter(format.locale, digits).format(Math.abs(cents) / 100);

  const sign = cents < 0 ? "-" : showSign && cents > 0 ? "+" : "";
  const gap = format.spaceBetween ? " " : "";
  const before = format.symbolPosition !== "after";

  if (!format.symbol) return `${sign}${amount}`;
  return before
    ? `${sign}${format.symbol}${gap}${amount}`
    : `${sign}${amount}${gap}${format.symbol}`;
}
