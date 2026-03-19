import { useBudgetStore } from "./budgetStore";
import { useBudgetUIStore } from "./budgetUIStore";
import { usePickerStore } from "./pickerStore";
import { useSyncStore } from "./syncStore";
import { clearQueryCache } from "../queries/queryCache";
import { currentMonth } from "../lib/date";
import { PREFERENCE_DEFAULTS } from "../preferences/types";
import { FEATURE_FLAG_DEFAULTS } from "../preferences/featureFlags";

/**
 * Reset all Zustand stores to their initial state.
 * Must be called before loading a new budget to prevent stale data
 * from the previous budget leaking into the UI.
 */
export function resetAllStores(): void {
  clearQueryCache();
  // Reset spreadsheet engine
  import("../spreadsheet/instance").then(({ resetSpreadsheet }) => resetSpreadsheet());
  useBudgetStore.setState({ month: currentMonth(), data: null, loading: false });
  useBudgetUIStore.setState({ month: currentMonth(), coverTarget: null });
  usePickerStore.getState().clear();
  useSyncStore.setState({ status: "idle", error: null, lastSync: null });

  // Reset synced prefs store (lazy import to avoid circular deps)
  const initial: Record<string, string> = { ...PREFERENCE_DEFAULTS };
  for (const [flag, val] of Object.entries(FEATURE_FLAG_DEFAULTS)) {
    initial[`flags.${flag}`] = String(val);
  }
  import("../presentation/hooks/useSyncedPref").then(({ useSyncedPrefsStore }) => {
    useSyncedPrefsStore.setState({ prefs: initial, loaded: false });
  });
}
