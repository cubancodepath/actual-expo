/**
 * useFormat — reactive money formatting, mirroring upstream's `useFormat`
 * (packages/desktop-client/src/hooks/useFormat.ts).
 *
 * Reads the synced number + currency prefs and returns a `format(cents, type)`
 * function plus the pieces a display component (our `Money`) needs to render:
 * the Intl locale/fraction digits and the resolved currency (symbol, position,
 * space). Because it subscribes to `useSyncedPref`, every consumer re-renders
 * the instant any of those prefs changes.
 */
import { useCallback, useMemo } from "react";
import { useSyncedPref } from "@/lib/hooks/useSyncedPref";
import { getCurrency, type Currency } from "@/core/shared/currencies";
import {
  formatAmount,
  integerToCurrency,
  formatAmountShort,
  localeForNumberFormat,
  type NumberFormatType,
} from "@/core/shared/util";

/** Subset of upstream's FormatType relevant to money display. */
export type MoneyFormatType = "financial" | "financial-with-sign" | "financial-no-decimals";

export type UseFormatResult = {
  /** Format cents to a display string honoring number + currency prefs. */
  format: (cents: number, type?: MoneyFormatType) => string;
  numberFormat: NumberFormatType;
  locale: string;
  minimumFractionDigits: number;
  maximumFractionDigits: number;
  /** Resolved default currency (`code === ""` ⇒ no symbol). */
  currency: Currency;
  /** Currency symbol (`""` when no currency is set). */
  symbol: string;
  symbolPosition: "before" | "after";
  spaceBetween: boolean;
};

export function useFormat(): UseFormatResult {
  const [numberFormatPref] = useSyncedPref("numberFormat");
  const [hideFractionPref] = useSyncedPref("hideFraction");
  const [currencyCodePref] = useSyncedPref("defaultCurrencyCode");
  const [symbolPositionPref] = useSyncedPref("currencySymbolPosition");
  const [spaceEnabledPref] = useSyncedPref("currencySpaceBetweenAmountAndSymbol");

  const numberFormat = (numberFormatPref || "comma-dot") as NumberFormatType;
  const hideFraction = hideFractionPref === "true";
  const currency = getCurrency(currencyCodePref || "");

  const format = useCallback(
    (cents: number, type: MoneyFormatType = "financial") => {
      switch (type) {
        case "financial-with-sign":
          return formatAmount(cents);
        case "financial-no-decimals":
          return formatAmountShort(cents);
        default:
          return integerToCurrency(cents);
      }
    },
    // The engine reads its config from module state kept in sync by
    // applyFormatConfig; depend on the prefs so consumers re-run on change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [numberFormat, hideFraction, currency.code, symbolPositionPref, spaceEnabledPref],
  );

  // Fraction digits follow the currency (e.g. JPY = 0), or 0 when hidden.
  const fractionDigits = hideFraction ? 0 : currency.decimalPlaces;

  return useMemo(
    () => ({
      format,
      numberFormat,
      locale: localeForNumberFormat(numberFormat),
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
      currency,
      symbol: currency.symbol,
      symbolPosition: (symbolPositionPref || "before") as "before" | "after",
      spaceBetween: spaceEnabledPref === "true",
    }),
    [format, numberFormat, fractionDigits, currency, symbolPositionPref, spaceEnabledPref],
  );
}
