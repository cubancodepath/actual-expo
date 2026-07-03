import { first, runQuery } from "@/core/db";
import { sendMessages } from "@/core/sync";
import { Timestamp } from "@/core/crdt";
import { PREFERENCE_DEFAULTS, type PreferenceKey } from "./types";
import { ALL_FEATURE_FLAGS, FEATURE_FLAG_DEFAULTS, type FeatureFlag } from "./featureFlags";

export async function getPreference(key: PreferenceKey): Promise<string> {
  const row = await first<{ value: string }>("SELECT value FROM preferences WHERE id = ?", [key]);
  return row?.value ?? PREFERENCE_DEFAULTS[key];
}

export async function getAllPreferences(): Promise<Record<PreferenceKey, string>> {
  const keys = Object.keys(PREFERENCE_DEFAULTS);
  const placeholders = keys.map(() => "?").join(",");
  const rows = await runQuery<{ id: string; value: string }>(
    `SELECT id, value FROM preferences WHERE id IN (${placeholders})`,
    keys,
  );
  const result = { ...PREFERENCE_DEFAULTS };
  for (const row of rows) {
    if (row.id in result) {
      result[row.id as PreferenceKey] = row.value;
    }
  }
  return result;
}

export async function setPreference(key: PreferenceKey, value: string): Promise<void> {
  await sendMessages([
    {
      timestamp: Timestamp.send()!,
      dataset: "preferences",
      row: key,
      column: "value",
      value,
    },
  ]);
}

export async function getAllFeatureFlags(): Promise<Record<FeatureFlag, boolean>> {
  const keys = ALL_FEATURE_FLAGS.map((f) => `flags.${f}`);
  const placeholders = keys.map(() => "?").join(",");
  const rows = await runQuery<{ id: string; value: string }>(
    `SELECT id, value FROM preferences WHERE id IN (${placeholders})`,
    keys,
  );
  const result = { ...FEATURE_FLAG_DEFAULTS };
  for (const row of rows) {
    const name = row.id.replace("flags.", "") as FeatureFlag;
    if (name in result) {
      result[name] = row.value === "true";
    }
  }
  return result;
}

export async function setFeatureFlag(name: FeatureFlag, enabled: boolean): Promise<void> {
  await sendMessages([
    {
      timestamp: Timestamp.send()!,
      dataset: "preferences",
      row: `flags.${name}`,
      column: "value",
      value: enabled ? "true" : "false",
    },
  ]);
}

export type BudgetType = "envelope" | "tracking";

/**
 * Which budgeting model this file uses — drives which spreadsheet formulas
 * (envelope.ts vs tracking.ts) and which table (zero_budgets vs
 * reflect_budgets) budget cells are read from. Stored as the synced
 * "budgetType" preferences row, same as upstream (server/budget/base.ts).
 * Older files may have the pre-rename value "report" (see upstream
 * migration 1745425408000_update_budgetType_pref.sql) — normalize
 * defensively in case a peer on an older version writes it directly.
 */
export async function getBudgetType(): Promise<BudgetType> {
  const row = await first<{ value: string }>("SELECT value FROM preferences WHERE id = ?", [
    "budgetType",
  ]);
  return row?.value === "tracking" || row?.value === "report" ? "tracking" : "envelope";
}

/** Read/write arbitrary preferences (e.g. per-account settings like hide-cleared-{id}). */
export async function getArbitraryPref(key: string): Promise<string | null> {
  const row = await first<{ value: string }>("SELECT value FROM preferences WHERE id = ?", [key]);
  return row?.value ?? null;
}

export async function setArbitraryPref(key: string, value: string): Promise<void> {
  await sendMessages([
    {
      timestamp: Timestamp.send()!,
      dataset: "preferences",
      row: key,
      column: "value",
      value,
    },
  ]);
}

export {
  type FeatureFlag,
  ALL_FEATURE_FLAGS,
  FEATURE_FLAG_DEFAULTS,
  FEATURE_FLAG_LABELS,
} from "./featureFlags";
