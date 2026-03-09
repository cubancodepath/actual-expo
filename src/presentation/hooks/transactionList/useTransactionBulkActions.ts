import { useCallback, useRef } from 'react';
import { Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  deleteTransaction,
  setClearedBulk,
  updateTransaction,
  type TransactionDisplay,
} from '../../../transactions';
import { batchMessages } from '../../../sync';
import { undoable } from '../../../sync/undo';
import { useUndoStore } from '../../../stores/undoStore';

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

  // Track last bulk-deleted items so undo can restore them optimistically
  const lastBulkDeletedRef = useRef<Array<{ txn: TransactionDisplay; index: number }>>([]);

  const handleBulkDelete = useCallback(() => {
    const count = selectedIdsRef.current.size;
    const hasReconciled = transactionsRef.current.some(t => selectedIdsRef.current.has(t.id) && t.reconciled);
    const message = hasReconciled
      ? `Some of the selected transactions are reconciled. Deleting them may bring your reconciliation out of balance.\n\nDelete ${count} transaction${count === 1 ? '' : 's'}?`
      : `Delete ${count} transaction${count === 1 ? '' : 's'}?`;
    Alert.alert(
      'Delete Transactions',
      message,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            refreshIdRef.current++;
            const ids = new Set(selectedIdsRef.current);
            // Snapshot positions before removing so undo can restore them
            const snapshot: Array<{ txn: TransactionDisplay; index: number }> = [];
            transactionsRef.current.forEach((t, i) => {
              if (ids.has(t.id)) snapshot.push({ txn: t, index: i });
            });
            lastBulkDeletedRef.current = snapshot;
            setTransactions(prev => prev.filter(t => !ids.has(t.id)));
            resetSelectionRef.current();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            // Wrap in undoable so all deletes share one undo marker,
            // and batchMessages so they apply in a single DB transaction.
            await undoable(async () => {
              await batchMessages(async () => {
                for (const txnId of ids) {
                  await deleteTransaction(txnId);
                }
              });
            })();
            queueMicrotask(() => useUndoStore.getState().showUndo(`${ids.size} transaction${ids.size === 1 ? '' : 's'} deleted`));
            loadAccountsRef.current();
          },
        },
      ],
    );
  }, [setTransactions, refreshIdRef]);

  const handleBulkMove = useCallback((targetAccountId: string, targetAccountName?: string) => {
    const count = selectedIdsRef.current.size;
    const hasReconciled = transactionsRef.current.some(t => selectedIdsRef.current.has(t.id) && t.reconciled);
    const message = hasReconciled
      ? `Some of the selected transactions are reconciled. Moving them may bring your reconciliation out of balance.\n\nMove ${count} transaction${count === 1 ? '' : 's'} to ${targetAccountName ?? 'account'}?`
      : `Move ${count} transaction${count === 1 ? '' : 's'} to ${targetAccountName ?? 'account'}?`;
    Alert.alert(
      'Move Transactions',
      message,
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
            await undoable(async () => {
              await batchMessages(async () => {
                for (const txnId of ids) {
                  await updateTransaction(txnId, { acct: targetAccountId });
                }
              });
            })();
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

    const hasReconciled = transactionsRef.current.some(t => ids.has(t.id) && t.reconciled);

    const performChange = async () => {
      refreshIdRef.current++;
      setTransactions(prev => prev.map(t =>
        ids.has(t.id) ? { ...t, category: categoryId } : t
      ));
      resetSelectionRef.current();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      await undoable(async () => {
        await batchMessages(async () => {
          for (const txnId of ids) {
            await updateTransaction(txnId, { category: categoryId });
          }
        });
      })();
    };

    if (hasReconciled) {
      Alert.alert(
        'Change Category',
        'Some of the selected transactions are reconciled. Editing them may bring your reconciliation out of balance.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Change Anyway', style: 'destructive', onPress: performChange },
        ],
      );
    } else {
      await performChange();
    }
  }, [setTransactions, refreshIdRef]);

  /** Restore the last bulk-deleted items into the local list optimistically. */
  const restoreBulkDeleted = useCallback(() => {
    const deleted = lastBulkDeletedRef.current;
    if (deleted.length === 0) return;
    lastBulkDeletedRef.current = [];
    setTransactions(prev => {
      const existingIds = new Set(prev.map(t => t.id));
      const toRestore = deleted.filter(d => !existingIds.has(d.txn.id));
      if (toRestore.length === 0) return prev;
      const next = [...prev];
      // Insert in reverse order so indices stay correct
      for (let i = toRestore.length - 1; i >= 0; i--) {
        next.splice(Math.min(toRestore[i].index, next.length), 0, toRestore[i].txn);
      }
      return next;
    });
  }, [setTransactions]);

  return {
    handleBulkDelete,
    handleBulkMove,
    handleBulkToggleCleared,
    handleBulkChangeCategory,
    restoreBulkDeleted,
  };
}
