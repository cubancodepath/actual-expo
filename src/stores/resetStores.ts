import { useAccountsStore } from './accountsStore';
import { useBudgetStore } from './budgetStore';
import { useCategoriesStore } from './categoriesStore';
import { usePayeesStore } from './payeesStore';
import { usePickerStore } from './pickerStore';
import { useSyncStore } from './syncStore';
import { useTransactionsStore } from './transactionsStore';
import { currentMonth } from '../lib/date';

/**
 * Reset all Zustand stores to their initial state.
 * Must be called before loading a new budget to prevent stale data
 * from the previous budget leaking into the UI.
 */
export function resetAllStores(): void {
  useAccountsStore.setState({ accounts: [], loading: false });
  useBudgetStore.setState({ month: currentMonth(), data: null, loading: false });
  useCategoriesStore.setState({ groups: [], categories: [], loading: false });
  usePayeesStore.setState({ payees: [], loading: false });
  usePickerStore.getState().clear();
  useSyncStore.setState({ status: 'idle', refreshing: false, error: null, lastSync: null });
  useTransactionsStore.setState({ transactions: [], accountId: null, loading: false });
}
