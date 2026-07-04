import { useBudgetUIStore } from "./budgetUIStore";
import { usePickerStore } from "./pickerStore";
import { useSyncStore } from "./syncStore";
import { clearQueryCache } from "@/core/queries/queryCache";
import { currentMonth } from "@/lib/date";
import { PREFERENCE_DEFAULTS } from "@/core/domain/preferences/types";
import { FEATURE_FLAG_DEFAULTS } from "@/core/domain/preferences/featureFlags";

/**
 * Reset all Zustand stores to their initial state.
 * Must be called before loading a new budget to prevent stale data
 * from the previous budget leaking into the UI.
 */
export function resetAllStores(): void {
  clearQueryCache();
  // Reset spreadsheet engine
  import("@/core/domain/spreadsheet/instance").then(({ resetSpreadsheet }) => resetSpreadsheet());
  useBudgetUIStore.setState({ month: currentMonth(), coverTarget: null });
  usePickerStore.getState().clear();
  useSyncStore.setState({ status: "idle", lastErrorCode: null, lastSync: null });

  // Reset synced prefs store (lazy import to avoid circular deps)
  const initial: Record<string, string> = { ...PREFERENCE_DEFAULTS };
  for (const [flag, val] of Object.entries(FEATURE_FLAG_DEFAULTS)) {
    initial[`flags.${flag}`] = String(val);
  }
  import("@/hooks/useSyncedPrefs").then(({ useSyncedPrefsStore }) => {
    useSyncedPrefsStore.setState({ prefs: initial, loaded: false });
  });
}
