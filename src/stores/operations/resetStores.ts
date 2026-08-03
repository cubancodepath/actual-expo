import { useBudgetUIStore } from "@/stores/budgetUIStore";
import { useLastTransactionStore } from "@/stores/lastTransactionStore";
import { usePickerStore } from "@/stores/pickerStore";
import { useSyncStore } from "@/stores/syncStore";
import { useSyncedPrefsStore } from "@/hooks/useSyncedPrefs";
import { unloadSpreadsheet } from "@/core/server/sheet";
import { clearQueryCache } from "@/lib/queries/queryCache";
import { currentMonth } from "@/core/shared/months";
import { PREFERENCE_DEFAULTS } from "@/core/server/preferences/types";
import { defaultFlagPrefs } from "@/core/server/preferences/featureFlags";

/**
 * Reset all Zustand stores to their initial state. Called before loading a new
 * budget to prevent stale data from the previous budget leaking into the UI.
 *
 * An operation (operations → stores → core): it fans out over several stores,
 * so it lives here rather than inside any one store. `useSyncedPrefsStore` is a
 * leaf (imports no store), so the imports here are all one-way — no cycle, no
 * dynamic imports needed.
 */
export function resetAllStores(): void {
  clearQueryCache();
  unloadSpreadsheet();
  useBudgetUIStore.setState({ month: currentMonth(), pickedCategory: null });
  // The remembered account is one budget file's id and means nothing in the next.
  useLastTransactionStore.getState().reset();
  usePickerStore.getState().clear();
  useSyncStore.setState({
    status: "idle",
    lastErrorCode: null,
    conflictCode: null,
    lastSync: null,
  });
  const initial: Record<string, string> = { ...PREFERENCE_DEFAULTS, ...defaultFlagPrefs() };
  useSyncedPrefsStore.setState({ prefs: initial, loaded: false });
}
