/**
 * Apply format config (number, currency, date) from preferences.
 * Called during bootstrap and reactively via useSyncedPref.
 */

import {
  setNumberFormat,
  setCurrencyConfig,
  setPrivacyMode,
  type NumberFormatType,
} from "@/lib/format";
import { setDateFormat } from "@/lib/date";
import { getCurrency } from "@/lib/currencies";

export function applyFormatConfig(prefs: {
  numberFormat: string;
  hideFraction: string;
  dateFormat: string;
  isPrivacyEnabled: string;
  defaultCurrencyCode: string;
  currencySymbolPosition: string;
  currencySpaceBetweenAmountAndSymbol: string;
}) {
  setPrivacyMode(prefs.isPrivacyEnabled === "true");
  setNumberFormat({
    format: prefs.numberFormat as NumberFormatType,
    hideFraction: prefs.hideFraction === "true",
  });
  setDateFormat(prefs.dateFormat);

  const currency = getCurrency(prefs.defaultCurrencyCode || "");
  setCurrencyConfig({
    symbol: currency.symbol,
    position: (prefs.currencySymbolPosition || "before") as "before" | "after",
    spaceBetween: prefs.currencySpaceBetweenAmountAndSymbol === "true",
  });
}
