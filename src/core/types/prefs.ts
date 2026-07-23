// Preference category types — faithful mirror of upstream Actual's
// `packages/loot-core/src/types/prefs.ts`, trimmed to what the mobile client
// needs. Category NAMES and KEY names match upstream verbatim so the engine and
// the `use*Pref` hooks stay aligned; keys that only exist for desktop/electron
// or web-only surfaces are intentionally omitted (noted inline).
//
// Storage backend per category (see the preferences engine + hooks):
//   SyncedPrefs   → SQLite `preferences` table, replicated via CRDT
//   LocalPrefs    → device MMKV keyed `${budgetId}-${key}` (app layer)
//   GlobalPrefs   → device-global MMKV via @/core/platform/asyncStorage
//   MetadataPrefs → budget metadata (budgetContextStore) — infra
//   ServerPrefs   → sync-server (deferred on mobile)

export type FeatureFlag =
  | "goalTemplatesEnabled"
  | "goalTemplatesUIEnabled"
  | "actionTemplating"
  | "formulaMode"
  | "currency"
  | "ageOfMoneyReport"
  | "balanceForecastReport"
  | "customThemes"
  | "budgetAnalysisReport"
  | "payeeLocations"
  | "enableBanking"
  | "sankeyReport"
  | "akahuBankSync"
  | "mobileCalculator";

/**
 * Cross-device preferences. These sync across devices when changed (SQLite
 * `preferences` table, replicated via CRDT). All values are strings.
 *
 * Omitted vs upstream: the CSV/OFX/QIF/CAMT import mappings and the web
 * sidebar/net-worth-chart dynamic keys — mobile has no bank-file import UI nor
 * a sidebar.
 */
export type SyncedPrefs = Partial<
  Record<
    | "budgetType"
    | "upcomingScheduledTransactionLength"
    | "firstDayOfWeekIdx"
    | "dateFormat"
    | "numberFormat"
    | "hideFraction"
    | "isPrivacyEnabled"
    | "currencySymbolPosition"
    | "currencySpaceBetweenAmountAndSymbol"
    | "defaultCurrencyCode"
    | "learn-categories"
    | "show-hidden-tags"
    | `hide-cleared-${string}`
    | `hide-reconciled-${string}`
    | `flags.${FeatureFlag}`,
    string
  >
>;

/**
 * Preferences stored alongside the budget database (upstream: `metadata.json`).
 * On mobile these live in `budgetContextStore`; `useMetadataPref` exposes them
 * with these upstream names. `cloudFileId` is expo's `fileId`.
 */
export type MetadataPrefs = Partial<{
  budgetName: string;
  id: string;
  lastUploaded: string;
  cloudFileId: string;
  groupId: string;
  encryptKeyId: string;
  lastSyncedTimestamp: string;
  resetClock: boolean;
  lastScheduleRun: string;
}>;

/**
 * Local preferences for a single device (upstream: browser `localStorage`
 * keyed `${budgetId}-${prefName}`). On mobile: device MMKV, same key shape.
 *
 * Omitted vs upstream: web-only `reportsView*` and `sidebarWidth`.
 */
export type LocalPrefs = Partial<{
  "ui.showClosedAccounts": boolean;
  "expand-splits": boolean;
  "budget.collapsed": string[];
  "budget.summaryCollapsed": boolean;
  "budget.showHiddenCategories": boolean;
  "budget.startMonth": string;
  "flags.updateNotificationShownForVersion": string;
  "schedules.showCompleted": boolean;
  "mobile.showSpentColumn": boolean;
}>;

export type Theme = "light" | "dark" | "auto" | "midnight" | string;
export type DarkTheme = "dark" | "midnight";

/**
 * Per-device, cross-budget preferences (upstream: `global-store.json` /
 * IndexedDB via the asyncStorage platform capability). On mobile: device-global
 * MMKV via `@/core/platform/asyncStorage`.
 *
 * Omitted vs upstream: electron-only (`documentDir`, `serverSelfSignedCert`,
 * `syncServerConfig`), web sidebar (`floatingSidebar`, `categoryExpandedState`),
 * and desktop plugin/custom-theme fields.
 */
export type GlobalPrefs = Partial<{
  maxMonths: number;
  language: string;
  theme: Theme;
  preferredDarkTheme: DarkTheme;
  notifyWhenUpdateIsAvailable: boolean;
}>;

export type ServerPrefs = Partial<{
  "flags.plugins": "true" | "false";
}>;
