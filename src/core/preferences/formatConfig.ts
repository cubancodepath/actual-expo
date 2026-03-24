/**
 * Apply format config (number, currency, date) from preferences.
 * Called during bootstrap and reactively via useSyncedPref.
 */

import { setNumberFormat, setCurrencyConfig, type NumberFormatType } from "@/lib/format";
import { setDateFormat } from "@/lib/date";
import { getCurrency } from "@/lib/currencies";

export function applyFormatConfig(prefs: {
  numberFormat: string;
  hideFraction: string;
  dateFormat: string;
  defaultCurrencyCode: string;
  defaultCurrencyCustomSymbol: string;
  currencySymbolPosition: string;
  currencySpaceBetweenAmountAndSymbol: string;
}) {
  setNumberFormat({
    format: prefs.numberFormat as NumberFormatType,
    hideFraction: prefs.hideFraction === "true",
  });
  setDateFormat(prefs.dateFormat);

  const currency = getCurrency(prefs.defaultCurrencyCode || "");
  const effectiveSymbol = prefs.defaultCurrencyCustomSymbol || currency.symbol;
  setCurrencyConfig({
    symbol: effectiveSymbol,
    svgSymbol: prefs.defaultCurrencyCustomSymbol ? undefined : currency.svgSymbol,
    position: (prefs.currencySymbolPosition || "before") as "before" | "after",
    spaceBetween: prefs.currencySpaceBetweenAmountAndSymbol === "true",
  });
}
