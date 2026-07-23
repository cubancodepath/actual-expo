// LocalPrefs storage — per-device, per-budget preferences. Faithful to
// upstream, where LocalPrefs live client-side in browser `localStorage` keyed
// `${budgetId}-${prefName}` (NOT in loot-core). The mobile equivalent is a
// dedicated device MMKV instance with the same key shape. App-layer on purpose:
// this is device UI state, never synced.
import { createMMKV } from "react-native-mmkv";

import type { LocalPrefs } from "@/core/types/prefs";

const storage = createMMKV({ id: "actual-local" });

function storageKey(budgetId: string, key: keyof LocalPrefs): string {
  return `${budgetId}-${key}`;
}

export function getLocalPref<K extends keyof LocalPrefs>(
  budgetId: string,
  key: K,
): LocalPrefs[K] | undefined {
  const raw = storage.getString(storageKey(budgetId, key));
  if (raw === undefined) return undefined;
  try {
    return JSON.parse(raw) as LocalPrefs[K];
  } catch {
    return undefined;
  }
}

export function setLocalPref<K extends keyof LocalPrefs>(
  budgetId: string,
  key: K,
  value: LocalPrefs[K],
): void {
  const fullKey = storageKey(budgetId, key);
  if (value === undefined) {
    storage.remove(fullKey);
    return;
  }
  storage.set(fullKey, JSON.stringify(value));
}
