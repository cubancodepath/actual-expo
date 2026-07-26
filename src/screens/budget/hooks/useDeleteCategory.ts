import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import {
  deleteCategory,
  deleteCategoryGroup,
  isCategoryTransferRequired,
} from "@/core/server/budget";
import { useBudgetUIStore } from "@/stores/budgetUIStore";
import { useUndo } from "@/lib/hooks/useUndo";
import { emitErrorEvent } from "@/lib/errors/ErrorChannel";
import { dialog } from "@/ui/feedback/dialog/dialogStore";

export type DeletableCategory = { id: string; name: string };
export type DeletableGroup = { id: string; name: string; categories: { id: string }[] };

/** What a delete flow needs to know once it has decided how to ask. */
type DeletePlan = {
  /** Whether a destination has to be nominated before anything is removed. */
  needsTransfer: boolean;
  title: string;
  message: string;
  /** Ids kept out of the picker — the thing being deleted can't receive itself. */
  excludeIds: string[];
  /** Runs the removal, with the chosen destination when there was one. */
  remove: (transferId?: string) => Promise<void>;
  /** Shown after it succeeds. */
  undoMessage: string;
};

/**
 * The half of a delete that is the same whether it's one category or a whole
 * group: ask, send the user to the picker when a destination is needed, and
 * resume once they come back with one.
 *
 * The picker hands its answer through `budgetUIStore.pickedCategory` rather
 * than a return value — the selection travels back *down* the stack — so the
 * flow is split across a callback and an effect.
 */
function useTransferDelete(onDeleted?: () => void) {
  const { t } = useTranslation("budget");
  const router = useRouter();
  const { showUndoNotification } = useUndo();
  const pickedCategory = useBudgetUIStore((s) => s.pickedCategory);
  const setPickedCategory = useBudgetUIStore((s) => s.setPickedCategory);

  // The plan waiting on the picker; null when nothing is in flight.
  const [pending, setPending] = useState<DeletePlan | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Kept in refs so the picker effect doesn't re-run on every fresh closure.
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

  const run = useCallback(
    async (plan: DeletePlan, transferId?: string) => {
      setIsDeleting(true);
      try {
        await plan.remove(transferId);
        showUndoNotification(plan.undoMessage);
        onDeletedRef.current?.();
      } catch (e) {
        await reportFailure(e);
      } finally {
        setIsDeleting(false);
      }
    },
    [reportFailure, showUndoNotification],
  );

  const start = useCallback(
    async (plan: DeletePlan) => {
      if (isDeleting) return;

      const ok = await dialog.confirm({
        title: plan.title,
        message: plan.message,
        confirmLabel: plan.needsTransfer ? t("selectCategory") : t("delete"),
        // Only the button that actually deletes gets the destructive styling.
        // "Select Category" opens a picker and nothing is lost yet — there's
        // still a screen to back out of, so dressing it in red overstates it.
        destructive: !plan.needsTransfer,
      });
      if (!ok) return;

      if (!plan.needsTransfer) {
        await run(plan);
        return;
      }

      setPickedCategory(null);
      setPending(plan);
      router.push({
        pathname: "/(auth)/budget/delete-category-picker",
        params: { excludeIds: plan.excludeIds.join(",") },
      });
    },
    [isDeleting, router, run, setPickedCategory, t],
  );

  useEffect(() => {
    if (!pending || !pickedCategory) return;
    const plan = pending;
    const target = pickedCategory.catId;

    void (async () => {
      setPending(null);
      setPickedCategory(null);
      await run(plan, target);
    })();
  }, [pending, pickedCategory, run, setPickedCategory]);

  return { start, isDeleting, reportFailure };
}

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
 * @param onDeleted Runs after a successful delete — dismiss the sheet, pop the
 *                  screen, whatever the caller was showing.
 */
export function useDeleteCategory({ onDeleted }: { onDeleted?: () => void } = {}) {
  const { t } = useTranslation("budget");
  const { start, isDeleting, reportFailure } = useTransferDelete(onDeleted);

  const requestDelete = useCallback(
    async (category: DeletableCategory) => {
      let needsTransfer: boolean;
      try {
        needsTransfer = await isCategoryTransferRequired(category.id);
      } catch (e) {
        await reportFailure(e);
        return;
      }

      await start({
        needsTransfer,
        title: t("deleteCategoryTitle"),
        message: needsTransfer
          ? t("deleteCategoryWithTransfers", { name: category.name })
          : t("deleteCategoryMessage", { name: category.name }),
        excludeIds: [category.id],
        remove: (transferId) => deleteCategory(category.id, transferId),
        undoMessage: t("categoryDeleted"),
      });
    },
    [reportFailure, start, t],
  );

  return { requestDelete, isDeleting };
}

/**
 * Deleting a whole group, which takes every category in it along.
 *
 * Same shape as {@link useDeleteCategory}, and it has to be: a group delete is
 * N category deletes, so if any one of them would strand transactions the group
 * needs a destination just as much. `deleteCategoryGroup` passes the target
 * down to each category, so one choice covers the lot.
 *
 * The check loops the group's categories client-side and stops at the first
 * one that answers yes, mirroring upstream's `useDeleteCategoryGroupMutation`
 * — there is no server-side group equivalent to invent here.
 */
export function useDeleteCategoryGroup({ onDeleted }: { onDeleted?: () => void } = {}) {
  const { t } = useTranslation("budget");
  const { start, isDeleting, reportFailure } = useTransferDelete(onDeleted);

  const requestDeleteGroup = useCallback(
    async (group: DeletableGroup) => {
      let needsTransfer = false;
      try {
        for (const category of group.categories) {
          if (await isCategoryTransferRequired(category.id)) {
            needsTransfer = true;
            break;
          }
        }
      } catch (e) {
        await reportFailure(e);
        return;
      }

      // `count` drives i18next's own plural selection — the old manual
      // "y"/"ies" suffix was English grammar leaking into the Spanish string,
      // which rendered "categoríay".
      const count = group.categories.length;

      await start({
        needsTransfer,
        title: t("deleteGroupTitle"),
        message: needsTransfer
          ? t("deleteGroupWithTransfers", { name: group.name, count })
          : count > 0
            ? t("deleteGroupMessageWithCategories", { name: group.name, count })
            : t("deleteGroupMessageEmpty", { name: group.name }),
        excludeIds: group.categories.map((c) => c.id),
        remove: (transferId) => deleteCategoryGroup(group.id, transferId),
        undoMessage: t("categoryGroupDeleted"),
      });
    },
    [reportFailure, start, t],
  );

  return { requestDeleteGroup, isDeleting };
}
