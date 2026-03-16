import { useCallback, useRef } from "react";
import { Alert } from "react-native";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import {
  deleteTransaction,
  setClearedBulk,
  updateTransaction,
  type TransactionDisplay,
} from "../../../transactions";
import { batchMessages } from "../../../sync";
import { undoable } from "../../../sync/undo";
import { useUndoStore } from "../../../stores/undoStore";

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
  onBulkToggleCleared?: (
    ids: Set<string>,
    targetVal: boolean,
    affectedTxns: TransactionDisplay[],
  ) => void;
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
  const { t } = useTranslation("transactions");

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
  const tRef = useRef(t);
  tRef.current = t;

  // Track last bulk-deleted items so undo can restore them optimistically
  const lastBulkDeletedRef = useRef<Array<{ txn: TransactionDisplay; index: number }>>([]);

  const handleBulkDelete = useCallback(() => {
    const count = selectedIdsRef.current.size;
    const plural = count === 1 ? "" : "s";
    const hasReconciled = transactionsRef.current.some(
      (t) => selectedIdsRef.current.has(t.id) && t.reconciled,
    );
    const message = hasReconciled
      ? tRef.current("deleteTransactionsReconciledMessage", { count, plural })
      : tRef.current("deleteTransactionsMessage", { count, plural });
    Alert.alert(tRef.current("deleteTransactionsTitle"), message, [
      { text: tRef.current("cancel"), style: "cancel" },
      {
        text: tRef.current("delete"),
        style: "destructive",
        onPress: async () => {
          refreshIdRef.current++;
          const ids = new Set(selectedIdsRef.current);
          // Snapshot positions before removing so undo can restore them
          const snapshot: Array<{ txn: TransactionDisplay; index: number }> = [];
          transactionsRef.current.forEach((t, i) => {
            if (ids.has(t.id)) snapshot.push({ txn: t, index: i });
          });
          lastBulkDeletedRef.current = snapshot;
          setTransactions((prev) => prev.filter((t) => !ids.has(t.id)));
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
          queueMicrotask(() =>
            useUndoStore.getState().showUndo(tRef.current("bulkDeleted", { count: ids.size })),
          );
          loadAccountsRef.current();
        },
      },
    ]);
  }, [setTransactions, refreshIdRef]);

  const handleBulkMove = useCallback(
    (targetAccountId: string, targetAccountName?: string) => {
      const count = selectedIdsRef.current.size;
      const plural = count === 1 ? "" : "s";
      const account = targetAccountName ?? tRef.current("account").toLowerCase();
      const hasReconciled = transactionsRef.current.some(
        (t) => selectedIdsRef.current.has(t.id) && t.reconciled,
      );
      const message = hasReconciled
        ? tRef.current("moveTransactionsReconciledMessage", { count, plural, account })
        : tRef.current("moveTransactionsMessage", { count, plural, account });
      Alert.alert(tRef.current("moveTransactionsTitle"), message, [
        { text: tRef.current("cancel"), style: "cancel" },
        {
          text: tRef.current("move"),
          onPress: async () => {
            refreshIdRef.current++;
            const ids = new Set(selectedIdsRef.current);
            if (optimisticBulkMoveRef.current) {
              setTransactions((prev) =>
                optimisticBulkMoveRef.current!(prev, ids, targetAccountId, targetAccountName),
              );
            } else {
              setTransactions((prev) => prev.filter((t) => !ids.has(t.id)));
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
      ]);
    },
    [setTransactions, refreshIdRef],
  );

  const handleBulkToggleCleared = useCallback(async () => {
    const selected = transactionsRef.current.filter(
      (t) => selectedIdsRef.current.has(t.id) && !t.reconciled,
    );
    if (selected.length === 0) return;

    refreshIdRef.current++;
    const anyUncleared = selected.some((t) => !t.cleared);
    const targetVal = anyUncleared;
    const ids = new Set(selected.map((t) => t.id));

    setTransactions((prev) => prev.map((t) => (ids.has(t.id) ? { ...t, cleared: targetVal } : t)));
    onBulkToggleClearedRef.current?.(ids, targetVal, selected);
    resetSelectionRef.current();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    await setClearedBulk(
      selected.map((t) => t.id),
      anyUncleared,
    );
  }, [setTransactions, refreshIdRef]);

  const handleBulkChangeCategory = useCallback(
    async (categoryId: string | null) => {
      const ids = new Set(selectedIdsRef.current);
      if (ids.size === 0) return;

      const hasReconciled = transactionsRef.current.some((t) => ids.has(t.id) && t.reconciled);

      const performChange = async () => {
        refreshIdRef.current++;
        setTransactions((prev) =>
          prev.map((t) => (ids.has(t.id) ? { ...t, category: categoryId } : t)),
        );
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
          tRef.current("changeCategoryTitle"),
          tRef.current("changeCategoryReconciledMessage"),
          [
            { text: tRef.current("cancel"), style: "cancel" },
            { text: tRef.current("changeAnyway"), style: "destructive", onPress: performChange },
          ],
        );
      } else {
        await performChange();
      }
    },
    [setTransactions, refreshIdRef],
  );

  /** Restore the last bulk-deleted items into the local list optimistically. */
  const restoreBulkDeleted = useCallback(() => {
    const deleted = lastBulkDeletedRef.current;
    if (deleted.length === 0) return;
    lastBulkDeletedRef.current = [];
    setTransactions((prev) => {
      const existingIds = new Set(prev.map((t) => t.id));
      const toRestore = deleted.filter((d) => !existingIds.has(d.txn.id));
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
