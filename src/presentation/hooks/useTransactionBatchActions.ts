/**
 * useTransactionBatchActions — batch operations on selected transactions.
 *
 * Ported from Actual Budget's useTransactionBatchActions pattern:
 * - No optimistic updates — mutations go to DB, sync-event triggers refetch
 * - All operations wrapped in undoable() + batchMessages() for single undo step
 * - Hook receives selection state, returns action handlers
 */

import { useCallback, useRef } from "react";
import { Alert } from "react-native";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { deleteTransaction, updateTransaction, setClearedBulk } from "@/transactions";
import { undoable } from "@/sync/undo";
import { batchMessages } from "@/sync";
import { useUndoStore } from "@/stores/undoStore";
import type { TransactionDisplay } from "@/transactions/types";

export interface UseTransactionBatchActionsOptions {
  selectedIds: Set<string>;
  transactions: TransactionDisplay[];
  onDone: () => void;
}

export interface UseTransactionBatchActionsResult {
  handleBulkDelete: () => void;
  handleBulkToggleCleared: () => void;
  handleBulkMove: (targetAccountId: string, targetAccountName?: string) => void;
  handleBulkChangeCategory: (categoryId: string) => void;
}

export function useTransactionBatchActions({
  selectedIds,
  transactions,
  onDone,
}: UseTransactionBatchActionsOptions): UseTransactionBatchActionsResult {
  const { t } = useTranslation("transactions");

  // Refs to avoid stale closures in Alert callbacks
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;
  const transactionsRef = useRef(transactions);
  transactionsRef.current = transactions;

  const handleBulkDelete = useCallback(() => {
    const ids = selectedIdsRef.current;
    const count = ids.size;
    if (count === 0) return;

    const hasReconciled = transactionsRef.current.some((txn) => ids.has(txn.id) && txn.reconciled);
    const plural = count === 1 ? "" : "s";
    const message = hasReconciled
      ? t("deleteTransactionsReconciledMessage", { count, plural })
      : t("deleteTransactionsMessage", { count, plural });

    Alert.alert(t("deleteTransactionsTitle"), message, [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("delete"),
        style: "destructive",
        onPress: async () => {
          onDone();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

          await undoable(async () => {
            await batchMessages(async () => {
              for (const id of ids) {
                await deleteTransaction(id);
              }
            });
          })();

          useUndoStore.getState().showUndo(t("bulkDeleted", { count }));
        },
      },
    ]);
  }, [onDone, t]);

  const handleBulkToggleCleared = useCallback(async () => {
    const ids = selectedIdsRef.current;
    const txns = transactionsRef.current;

    const selected = txns.filter((txn) => ids.has(txn.id) && !txn.reconciled);
    if (selected.length === 0) return;

    const targetVal = selected.some((txn) => !txn.cleared);
    const targetIds = selected.map((txn) => txn.id);

    await setClearedBulk(targetIds, targetVal);
    // sync-event auto-refreshes the list
  }, []);

  const handleBulkMove = useCallback(
    (targetAccountId: string, targetAccountName?: string) => {
      const ids = selectedIdsRef.current;
      const count = ids.size;
      if (count === 0) return;

      const hasReconciled = transactionsRef.current.some(
        (txn) => ids.has(txn.id) && txn.reconciled,
      );
      const plural = count === 1 ? "" : "s";
      const account = targetAccountName ?? t("account");
      const message = hasReconciled
        ? t("moveTransactionsReconciledMessage", { count, plural, account })
        : t("moveTransactionsMessage", { count, plural, account });

      Alert.alert(t("moveTransactionsTitle"), message, [
        { text: t("cancel"), style: "cancel" },
        {
          text: t("move"),
          onPress: async () => {
            onDone();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

            await undoable(async () => {
              await batchMessages(async () => {
                for (const id of ids) {
                  await updateTransaction(id, { account: targetAccountId });
                }
              });
            })();

            useUndoStore.getState().showUndo(t("bulkDeleted", { count }));
          },
        },
      ]);
    },
    [onDone, t],
  );

  const handleBulkChangeCategory = useCallback(
    async (categoryId: string) => {
      const ids = selectedIdsRef.current;
      if (ids.size === 0) return;

      const hasReconciled = transactionsRef.current.some(
        (txn) => ids.has(txn.id) && txn.reconciled,
      );

      async function doChange() {
        await undoable(async () => {
          await batchMessages(async () => {
            for (const id of ids) {
              await updateTransaction(id, { category: categoryId });
            }
          });
        })();
        onDone();
      }

      if (hasReconciled) {
        Alert.alert(t("changeCategoryTitle"), t("changeCategoryReconciledMessage"), [
          { text: t("cancel"), style: "cancel" },
          { text: t("changeAnyway"), onPress: doChange },
        ]);
      } else {
        await doChange();
      }
    },
    [onDone, t],
  );

  return {
    handleBulkDelete,
    handleBulkToggleCleared,
    handleBulkMove,
    handleBulkChangeCategory,
  };
}
