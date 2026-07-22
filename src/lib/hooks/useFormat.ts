/**
 * useFormat — reactive money formatting, mirroring upstream's `useFormat`
 * (packages/desktop-client/src/hooks/useFormat.ts).
 *
 * Reads the synced number-format prefs and returns a `format(cents, type)`
 * function plus the Intl config a display component (our `Money`) feeds to
 * heroui's `NumberValue`. Because it subscribes to `useSyncedPref`, every
 * consumer re-renders the instant "Number Format" or "Hide Decimals" changes.
 *
 * TODO(currency): upstream's hook also reads `defaultCurrencyCode`,
 * `currencySymbolPosition`, `currencySpaceBetweenAmountAndSymbol`, resolves
 * `getCurrency(...)`, applies per-currency decimals + symbol styling, and
 * exposes `forEdit`/`fromEdit`. We deliberately DON'T mirror that yet — our
 * currency logic isn't faithful to upstream. Pair it with
 * desktop-client/src/hooks/useFormat.ts + loot-core/shared/currencies.ts when
 * the currency UI is introduced.
 */
import { useCallback, useMemo } from "react";
import { useSyncedPref } from "@/lib/hooks/useSyncedPref";
import {
  formatAmount,
  formatBalance,
  formatAmountShort,
  localeForNumberFormat,
  getFractionDigits,
  type NumberFormatType,
} from "@/lib/format";

/** Subset of upstream's FormatType relevant to money display. */
export type MoneyFormatType = "financial" | "financial-with-sign" | "financial-no-decimals";

export type UseFormatResult = {
  /** Format cents to a display string honoring the current number format. */
  format: (cents: number, type?: MoneyFormatType) => string;
  /** Intl config to feed heroui `NumberValue` (same Intl the engine uses). */
  numberFormat: NumberFormatType;
  locale: string;
  minimumFractionDigits: number;
  maximumFractionDigits: number;
};

export function useFormat(): UseFormatResult {
  const [numberFormatPref] = useSyncedPref("numberFormat");
  const [hideFractionPref] = useSyncedPref("hideFraction");

  const numberFormat = (numberFormatPref || "comma-dot") as NumberFormatType;
  const hideFraction = hideFractionPref === "true";

  const format = useCallback(
    (cents: number, type: MoneyFormatType = "financial") => {
      switch (type) {
        case "financial-with-sign":
          return formatAmount(cents);
        case "financial-no-decimals":
          return formatAmountShort(cents);
        default:
          return formatBalance(cents);
      }
    },
    // The engine reads its config from module state kept in sync by
    // applyFormatConfig; depend on the prefs so consumers re-run on change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [numberFormat, hideFraction],
  );

  const fractionDigits = getFractionDigits(hideFraction);

  return useMemo(
    () => ({
      format,
      numberFormat,
      locale: localeForNumberFormat(numberFormat),
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }),
    [format, numberFormat, fractionDigits],
  );
}
