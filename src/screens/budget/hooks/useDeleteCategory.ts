import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { deleteCategory, isCategoryTransferRequired } from "@/core/server/budget";
import { useBudgetUIStore } from "@/stores/budgetUIStore";
import { useUndo } from "@/lib/hooks/useUndo";
import { emitErrorEvent } from "@/lib/errors/ErrorChannel";
import { dialog } from "@/ui/feedback/dialog/dialogStore";

export type DeletableCategory = { id: string; name: string };

/**
 * Deleting a category, wherever it's offered from.
 *
 * The wrinkle is that a category holding transactions can't just vanish —
 * something has to say where they go. So the flow asks
 * {@link isCategoryTransferRequired} *before* opening the dialog and lets the
 * answer shape it: an empty category gets a plain "Delete", one with
 * transactions gets told so and its button says "Select Category", which is
 * what actually happens next. Deciding after the user has already pressed
 * Delete produces a picker nobody asked for.
 *
 * Lives here rather than in either screen because both the plan editor and the
 * category details screen offer this, and a delete that behaves differently
 * depending on where you started it is a bug waiting to be filed.
 *
 * @param onDeleted Runs after a successful delete — dismiss the sheet, pop the
 *                  screen, whatever the caller was showing.
 */
export function useDeleteCategory({ onDeleted }: { onDeleted?: () => void } = {}) {
  const { t } = useTranslation("budget");
  const router = useRouter();
  const { showUndoNotification } = useUndo();
  const pickedCategory = useBudgetUIStore((s) => s.pickedCategory);
  const setPickedCategory = useBudgetUIStore((s) => s.setPickedCategory);

  // The id waiting on the picker; null when no delete is in flight.
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Kept in a ref so the picker effect doesn't re-run when the caller passes a
  // fresh closure, which is every render.
  const onDeletedRef = useRef(onDeleted);
  onDeletedRef.current = onDeleted;

  const reportFailure = useCallback(
    async (e: unknown) => {
      // The bus only logs and reports to Sentry, so on its own the delete would
      // fail silently — the dialog is what the user actually sees.
      emitErrorEvent(e);
      await dialog.alert({ title: t("errorTitle"), message: t("couldNotDeleteCategory") });
    },
    [t],
  );

  const requestDelete = useCallback(
    async (category: DeletableCategory) => {
      if (isDeleting) return;

      let needsTransfer: boolean;
      try {
        needsTransfer = await isCategoryTransferRequired(category.id);
      } catch (e) {
        await reportFailure(e);
        return;
      }

      const ok = await dialog.confirm({
        title: t("deleteCategoryTitle"),
        message: needsTransfer
          ? t("deleteCategoryWithTransfers", { name: category.name })
          : t("deleteCategoryMessage", { name: category.name }),
        confirmLabel: needsTransfer ? t("selectCategory") : t("delete"),
        destructive: true,
      });
      if (!ok) return;

      if (needsTransfer) {
        setPickedCategory(null);
        setPendingDelete(category.id);
        router.push({
          pathname: "/(auth)/budget/delete-category-picker",
          params: { excludeIds: category.id, moveCatId: category.id },
        });
        return;
      }

      setIsDeleting(true);
      try {
        await deleteCategory(category.id);
        showUndoNotification(t("categoryDeleted"));
        onDeletedRef.current?.();
      } catch (e) {
        await reportFailure(e);
      } finally {
        setIsDeleting(false);
      }
    },
    [isDeleting, reportFailure, router, setPickedCategory, showUndoNotification, t],
  );

  // The picker hands its answer back through the store rather than a return
  // value, so the second half of the flow resumes here.
  useEffect(() => {
    if (!pendingDelete || !pickedCategory) return;
    const categoryId = pendingDelete;
    const target = pickedCategory.catId;

    void (async () => {
      setIsDeleting(true);
      try {
        await deleteCategory(categoryId, target);
        showUndoNotification(t("categoryDeleted"));
        onDeletedRef.current?.();
      } catch (e) {
        await reportFailure(e);
      } finally {
        setPendingDelete(null);
        setPickedCategory(null);
        setIsDeleting(false);
      }
    })();
  }, [pendingDelete, pickedCategory, reportFailure, setPickedCategory, showUndoNotification, t]);

  return { requestDelete, isDeleting };
}
