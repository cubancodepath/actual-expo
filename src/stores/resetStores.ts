import { useBudgetStore } from "./budgetStore";
import { useFeatureFlagsStore } from "./featureFlagsStore";
import { usePickerStore } from "./pickerStore";
import { usePreferencesStore } from "./preferencesStore";
import { useSyncStore } from "./syncStore";
import { useRulesStore } from "./rulesStore";
import { useSchedulesStore } from "./schedulesStore";
import { useTransactionsStore } from "./transactionsStore";
import { currentMonth } from "../lib/date";
import { PREFERENCE_DEFAULTS } from "../preferences/types";
import { FEATURE_FLAG_DEFAULTS } from "../preferences/featureFlags";

/**
 * Reset all Zustand stores to their initial state.
 * Must be called before loading a new budget to prevent stale data
 * from the previous budget leaking into the UI.
 */
export function resetAllStores(): void {
  useBudgetStore.setState({ month: currentMonth(), data: null, loading: false });
  // categoriesStore no longer used — liveQuery handles data in components
  // payeesStore no longer used — liveQuery handles data via usePayees hook
  usePickerStore.getState().clear();
  usePreferencesStore.setState({ ...PREFERENCE_DEFAULTS });
  useFeatureFlagsStore.setState({ ...FEATURE_FLAG_DEFAULTS });
  useSyncStore.setState({ status: "idle", error: null, lastSync: null });
  useTransactionsStore.setState({ transactions: [], accountId: null, loading: false });
  useRulesStore.setState({ rules: [], loading: false });
  useSchedulesStore.setState({ schedules: [], loading: false });
}
