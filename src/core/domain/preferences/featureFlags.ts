/**
 * Feature flag catalog — mirrors upstream Actual verbatim:
 *   union type: packages/loot-core/src/types/prefs.ts
 *   defaults:   packages/desktop-client/src/hooks/useFeatureFlag.ts
 *
 * Storage is identical to upstream: each flag is a synced pref row
 * `flags.<name>` in the `preferences` table, value "true"/"false",
 * replicated via CRDT. This file is the ONLY place the "flags." prefix
 * and the "true"/"false" string encoding are allowed to appear.
 */

// The FeatureFlag union lives in prefs.types.ts (the faithful mirror of
// upstream's types/prefs.ts). Re-exported here so existing importers keep
// working and the flag encoding helpers below stay colocated.
export type { FeatureFlag } from "./prefs.types";
import type { FeatureFlag } from "./prefs.types";

export const DEFAULT_FEATURE_FLAG_STATE: Record<FeatureFlag, boolean> = {
  goalTemplatesEnabled: false,
  goalTemplatesUIEnabled: false,
  actionTemplating: false,
  formulaMode: false,
  currency: false,
  ageOfMoneyReport: false,
  balanceForecastReport: false,
  customThemes: false,
  budgetAnalysisReport: false,
  payeeLocations: false,
  enableBanking: false,
  sankeyReport: false,
  akahuBankSync: false,
  mobileCalculator: false,
};

export const ALL_FEATURE_FLAGS = Object.keys(DEFAULT_FEATURE_FLAG_STATE) as FeatureFlag[];

/**
 * Flags with a real feature behind them on mobile today — the subset exposed as
 * toggles in the settings UI. The `FeatureFlag` union mirrors upstream verbatim
 * (14 flags), but, exactly like upstream's `Experimental.tsx`, each client only
 * surfaces the flags it actually supports; the rest stay declared-but-hidden.
 */
export const SUPPORTED_FEATURE_FLAGS: FeatureFlag[] = [
  "goalTemplatesEnabled",
  "goalTemplatesUIEnabled",
  "actionTemplating",
  "formulaMode",
  "currency",
  "mobileCalculator",
  "sankeyReport",
  "balanceForecastReport",
  "ageOfMoneyReport",
  "budgetAnalysisReport",
  "payeeLocations",
];

/**
 * Sub-feature dependencies: a flag that only makes sense while its parent is on.
 * Mirrors upstream's `Experimental.tsx`, where `goalTemplatesUIEnabled` is gated
 * behind `goalTemplatesEnabled`. In the UI the child row stays visible but is
 * disabled while the parent is off, and turning the parent off turns the child
 * off too (cascade).
 */
export const FEATURE_FLAG_REQUIRES: Partial<Record<FeatureFlag, FeatureFlag>> = {
  goalTemplatesUIEnabled: "goalTemplatesEnabled",
};

export type FeatureFlagKey = `flags.${FeatureFlag}`;

export function flagKey(name: FeatureFlag): FeatureFlagKey {
  return `flags.${name}`;
}

export function isFlagKey(key: string): key is FeatureFlagKey {
  return key.startsWith("flags.") && (key.slice(6) as FeatureFlag) in DEFAULT_FEATURE_FLAG_STATE;
}

export function flagFromKey(key: FeatureFlagKey): FeatureFlag {
  return key.slice(6) as FeatureFlag;
}

export function parseFlagValue(name: FeatureFlag, value: string | null | undefined): boolean {
  return value === undefined || value === null
    ? DEFAULT_FEATURE_FLAG_STATE[name]
    : value === "true";
}

export function serializeFlagValue(enabled: boolean): "true" | "false" {
  return enabled ? "true" : "false";
}

export function defaultFlagPrefs(): Record<FeatureFlagKey, string> {
  const result = {} as Record<FeatureFlagKey, string>;
  for (const flag of ALL_FEATURE_FLAGS) {
    result[flagKey(flag)] = serializeFlagValue(DEFAULT_FEATURE_FLAG_STATE[flag]);
  }
  return result;
}
