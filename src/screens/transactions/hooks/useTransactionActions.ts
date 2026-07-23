import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { deleteTransaction, duplicateTransaction, toggleCleared } from "@/core/domain/transactions";
import { emitErrorEvent } from "@/lib/errors/ErrorChannel";
import { useUndoStore } from "@/stores/undoStore";
import { dialog } from "@/ui/feedback/dialog";
import { successHaptic } from "@/ui/haptics";
import type { TransactionDisplay } from "@/core/types/models";

/**
 * Single-transaction actions with their dialogs, guards, undo toast and haptics
 * — the one place that owns this copy/behavior, shared by every surface that
 * offers the actions (list long-press menu today; the search screens when they
 * migrate — their legacy copies drifted and lack the reconciled guards).
 */
export function useTransactionActions() {
  const { t } = useTranslation("transactions");

  /** Confirm (stronger copy when reconciled — upstream parity) then delete + undo toast. */
  const deleteWithConfirm = useCallback(
    async (txn: Pick<TransactionDisplay, "id" | "reconciled">) => {
      const ok = await dialog.confirm(
        txn.reconciled
          ? {
              title: t("deleteReconciledTitle"),
              message: t("deleteReconciledMessage"),
              confirmLabel: t("deleteAnyway"),
              destructive: true,
            }
          : {
              title: t("deleteTitle"),
              message: t("deleteConfirm"),
              confirmLabel: t("delete"),
              destructive: true,
            },
      );
      if (!ok) return;
      try {
        await deleteTransaction(txn.id);
        useUndoStore.getState().showUndo(t("deleteTransaction"));
      } catch (e) {
        emitErrorEvent(e, { operation: "transaction.delete" });
      }
    },
    [t],
  );

  /** Toggle cleared; reconciled (locked) transactions get an explanatory alert instead. */
  const toggleClearedGuarded = useCallback(
    (txn: Pick<TransactionDisplay, "id" | "reconciled">) => {
      if (txn.reconciled) {
        dialog.alert({
          title: t("clearReconciledTitle"),
          message: t("clearReconciledMessage"),
        });
        return;
      }
      toggleCleared(txn.id).catch((e) =>
        emitErrorEvent(e, { operation: "transaction.toggleCleared" }),
      );
    },
    [t],
  );

  /** Duplicate in place; the sync-event refetch surfaces the copy. */
  const duplicate = useCallback((transactionId: string) => {
    duplicateTransaction(transactionId)
      .then(() => successHaptic())
      .catch((e) => emitErrorEvent(e, { operation: "transaction.duplicate" }));
  }, []);

  return { deleteWithConfirm, toggleClearedGuarded, duplicate };
}
