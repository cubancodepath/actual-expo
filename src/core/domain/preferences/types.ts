export type DateFormatOption =
  | "MM/dd/yyyy"
  | "dd/MM/yyyy"
  | "yyyy-MM-dd"
  | "MM.dd.yyyy"
  | "dd.MM.yyyy"
  | "dd-MM-yyyy";

export type NumberFormatOption =
  | "comma-dot"
  | "dot-comma"
  | "space-comma"
  | "apostrophe-dot"
  | "comma-dot-in";

import type { SyncedPrefs } from "./prefs.types";

/**
 * The fixed SyncedPrefs keys the engine loads eagerly (with defaults) into the
 * synced-prefs cache. A subset of `SyncedPrefs` — the dynamic per-entity keys
 * (`hide-cleared-*`, `flags.*`, …) are read/written on demand, not seeded here.
 */
export type PreferenceKey =
  | "budgetType"
  | "upcomingScheduledTransactionLength"
  | "firstDayOfWeekIdx"
  | "dateFormat"
  | "numberFormat"
  | "hideFraction"
  | "isPrivacyEnabled"
  | "defaultCurrencyCode"
  | "currencySymbolPosition"
  | "currencySpaceBetweenAmountAndSymbol";

// Compile-time guard: every eagerly-loaded key is a real SyncedPref key.
type _AssertKnownKeys = PreferenceKey extends keyof SyncedPrefs ? true : never;
const _knownKeysAreSynced: _AssertKnownKeys = true;
void _knownKeysAreSynced;

export const PREFERENCE_DEFAULTS: Record<PreferenceKey, string> = {
  budgetType: "envelope",
  upcomingScheduledTransactionLength: "7",
  firstDayOfWeekIdx: "0",
  dateFormat: "MM/dd/yyyy",
  numberFormat: "comma-dot",
  hideFraction: "false",
  isPrivacyEnabled: "false",
  defaultCurrencyCode: "",
  currencySymbolPosition: "before",
  currencySpaceBetweenAmountAndSymbol: "false",
};

export const DATE_FORMAT_OPTIONS: { value: DateFormatOption; label: string; example: string }[] = [
  { value: "MM/dd/yyyy", label: "MM/DD/YYYY", example: "03/04/2026" },
  { value: "dd/MM/yyyy", label: "DD/MM/YYYY", example: "04/03/2026" },
  { value: "yyyy-MM-dd", label: "YYYY-MM-DD", example: "2026-03-04" },
  { value: "MM.dd.yyyy", label: "MM.DD.YYYY", example: "03.04.2026" },
  { value: "dd.MM.yyyy", label: "DD.MM.YYYY", example: "04.03.2026" },
  { value: "dd-MM-yyyy", label: "DD-MM-YYYY", example: "04-03-2026" },
];

// Mirror of upstream `numberFormats` (packages/loot-core/src/shared/util.ts):
// the shown value IS the number example, and it swaps to `labelNoFraction`
// when "Hide decimal places" is on. ` ` = narrow no-break space.
export const NUMBER_FORMAT_OPTIONS: {
  value: NumberFormatOption;
  label: string;
  labelNoFraction: string;
}[] = [
  { value: "comma-dot", label: "1,000.33", labelNoFraction: "1,000" },
  { value: "dot-comma", label: "1.000,33", labelNoFraction: "1.000" },
  { value: "space-comma", label: "1 000,33", labelNoFraction: "1 000" },
  { value: "apostrophe-dot", label: "1'000.33", labelNoFraction: "1'000" },
  { value: "comma-dot-in", label: "1,00,000.33", labelNoFraction: "1,00,000" },
];

// Follows Pikaday `firstDay` numbering (0 = Sunday). Labels for the UI are
// localized at render via the `weekdays` i18n keys — these are fallbacks.
export const DAY_OF_WEEK_OPTIONS: { value: string; label: string }[] = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
];
