import { useBudgetUIStore } from "./budgetUIStore";
import { usePickerStore } from "./pickerStore";
import { useSyncStore } from "./syncStore";
import { clearQueryCache } from "@/core/queries/queryCache";
import { currentMonth } from "@/core/shared/months";
import { PREFERENCE_DEFAULTS } from "@/core/server/preferences/types";
import { defaultFlagPrefs } from "@/core/server/preferences/featureFlags";

/**
 * Reset all Zustand stores to their initial state.
 * Must be called before loading a new budget to prevent stale data
 * from the previous budget leaking into the UI.
 */
export function resetAllStores(): void {
  clearQueryCache();
  // Reset spreadsheet engine
  import("@/core/domain/spreadsheet/instance").then(({ resetSpreadsheet }) => resetSpreadsheet());
  useBudgetUIStore.setState({ month: currentMonth(), pickedCategory: null });
  usePickerStore.getState().clear();
  useSyncStore.setState({
    status: "idle",
    lastErrorCode: null,
    conflictCode: null,
    lastSync: null,
  });

  // Reset synced prefs store (lazy import to avoid circular deps)
  const initial: Record<string, string> = { ...PREFERENCE_DEFAULTS, ...defaultFlagPrefs() };
  import("@/hooks/useSyncedPrefs").then(({ useSyncedPrefsStore }) => {
    useSyncedPrefsStore.setState({ prefs: initial, loaded: false });
  });
}
