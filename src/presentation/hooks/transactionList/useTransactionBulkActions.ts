import { useCallback, useRef } from 'react';
import { Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  deleteTransaction,
  setClearedBulk,
  updateTransaction,
  type TransactionDisplay,
} from '../../../transactions';

interface UseTransactionBulkActionsOptions {
  selectedIds: Set<string>;
  transactions: TransactionDisplay[];
  setTransactions: React.Dispatch<React.SetStateAction<TransactionDisplay[]>>;
  refreshIdRef: React.MutableRefObject<number>;
  resetSelection: () => void;
  loadAccounts: () => void;
  /** Screen-specific optimistic update for bulk move. Return the updated array. */
  optimisticBulkMove?: (
    prev: TransactionDisplay[],
    ids: Set<string>,
    targetAccountId: string,
    targetAccountName?: string,
  ) => TransactionDisplay[];
  /** Called after bulk toggle cleared for screen-specific side effects (e.g., update clearedBalance) */
  onBulkToggleCleared?: (ids: Set<string>, targetVal: boolean, affectedTxns: TransactionDisplay[]) => void;
}

export function useTransactionBulkActions({
  selectedIds,
  transactions,
  setTransactions,
  refreshIdRef,
  resetSelection,
  loadAccounts,
  optimisticBulkMove,
  onBulkToggleCleared,
}: UseTransactionBulkActionsOptions) {
  // Refs so callbacks always read the latest values without re-creating
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;
  const transactionsRef = useRef(transactions);
  transactionsRef.current = transactions;
  const resetSelectionRef = useRef(resetSelection);
  resetSelectionRef.current = resetSelection;
  const loadAccountsRef = useRef(loadAccounts);
  loadAccountsRef.current = loadAccounts;
  const optimisticBulkMoveRef = useRef(optimisticBulkMove);
  optimisticBulkMoveRef.current = optimisticBulkMove;
  const onBulkToggleClearedRef = useRef(onBulkToggleCleared);
  onBulkToggleClearedRef.current = onBulkToggleCleared;

  const handleBulkDelete = useCallback(() => {
    const count = selectedIdsRef.current.size;
    Alert.alert(
      'Delete Transactions',
      `Delete ${count} transaction${count === 1 ? '' : 's'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            refreshIdRef.current++;
            const ids = new Set(selectedIdsRef.current);
            setTransactions(prev => prev.filter(t => !ids.has(t.id)));
            resetSelectionRef.current();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            for (const txnId of ids) {
              await deleteTransaction(txnId);
            }
            loadAccountsRef.current();
          },
        },
      ],
    );
  }, [setTransactions, refreshIdRef]);

  const handleBulkMove = useCallback((targetAccountId: string, targetAccountName?: string) => {
    const count = selectedIdsRef.current.size;
    Alert.alert(
      'Move Transactions',
      `Move ${count} transaction${count === 1 ? '' : 's'} to ${targetAccountName ?? 'account'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Move',
          onPress: async () => {
            refreshIdRef.current++;
            const ids = new Set(selectedIdsRef.current);
            if (optimisticBulkMoveRef.current) {
              setTransactions(prev => optimisticBulkMoveRef.current!(prev, ids, targetAccountId, targetAccountName));
            } else {
              setTransactions(prev => prev.filter(t => !ids.has(t.id)));
            }
            resetSelectionRef.current();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            for (const txnId of ids) {
              await updateTransaction(txnId, { acct: targetAccountId });
            }
            loadAccountsRef.current();
          },
        },
      ],
    );
  }, [setTransactions, refreshIdRef]);

  const handleBulkToggleCleared = useCallback(async () => {
    const selected = transactionsRef.current.filter(t => selectedIdsRef.current.has(t.id) && !t.reconciled);
    if (selected.length === 0) return;

    refreshIdRef.current++;
    const anyUncleared = selected.some(t => !t.cleared);
    const targetVal = anyUncleared;
    const ids = new Set(selected.map(t => t.id));

    setTransactions(prev => prev.map(t =>
      ids.has(t.id) ? { ...t, cleared: targetVal } : t
    ));
    onBulkToggleClearedRef.current?.(ids, targetVal, selected);
    resetSelectionRef.current();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    await setClearedBulk(selected.map(t => t.id), anyUncleared);
  }, [setTransactions, refreshIdRef]);

  const handleBulkChangeCategory = useCallback(async (categoryId: string | null) => {
    const ids = new Set(selectedIdsRef.current);
    if (ids.size === 0) return;

    refreshIdRef.current++;
    setTransactions(prev => prev.map(t =>
      ids.has(t.id) ? { ...t, category: categoryId } : t
    ));
    resetSelectionRef.current();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    for (const txnId of ids) {
      await updateTransaction(txnId, { category: categoryId });
    }
  }, [setTransactions, refreshIdRef]);

  return {
    handleBulkDelete,
    handleBulkMove,
    handleBulkToggleCleared,
    handleBulkChangeCategory,
  };
}
