import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { computeGoalAllocations, type GoalAllocation } from "@/core/server/budget/goal-template";
import { dialog } from "@/ui/feedback/dialog";
import type { PendingEdits } from "../types";

/** A summarized dry-run: how much it moves and over how many categories. */
export type ModeSummary = {
  allocations: GoalAllocation[];
  /** Categories whose amount would actually change. */
  changed: number;
  /** Net signed change to assigned money, in cents. */
  delta: number;
  errors: Array<{ category: string; error: string }>;
};

export type AutoAssignComputed = {
  fill: ModeSummary;
  recalc: ModeSummary;
  /** Whether any category in this budget has goals at all. */
  hasGoals: boolean;
};

/**
 * The Auto-assign logic: runs the goal engine as a dry-run for both modes and
 * turns a chosen mode into staged edits. Kept out of the button so the button
 * stays presentational — this owns the compute, the delta math, and the
 * error dialogs.
 *
 * Two modes map to the engine's `force` flag: fill only tops up underfunded
 * categories, recalculate rewrites every goal category (which can also lower
 * one that's over its goal). The delta is measured against what the user
 * currently sees — their staged edit if any, otherwise the committed amount.
 */
export function useAutoAssign({
  month,
  pending,
  committedFor,
  onApply,
}: {
  month: string;
  pending: PendingEdits;
  committedFor: (categoryId: string) => number;
  onApply: (allocations: GoalAllocation[]) => void;
}) {
  const { t } = useTranslation("budget");
  const [computed, setComputed] = useState<AutoAssignComputed | null>(null);
  const [loading, setLoading] = useState(false);

  const summarize = useCallback(
    (result: Awaited<ReturnType<typeof computeGoalAllocations>>): ModeSummary => {
      let changed = 0;
      let delta = 0;
      const allocations = [...result.allocations.values()];
      for (const alloc of allocations) {
        const current = pending[alloc.categoryId]?.value ?? committedFor(alloc.categoryId);
        if (alloc.amount !== current) {
          changed++;
          delta += alloc.amount - current;
        }
      }
      return { allocations, changed, delta, errors: result.errors };
    },
    [pending, committedFor],
  );

  const recompute = useCallback(async () => {
    setLoading(true);
    try {
      const [fill, recalc] = await Promise.all([
        computeGoalAllocations(month, false),
        computeGoalAllocations(month, true),
      ]);
      setComputed({
        fill: summarize(fill),
        recalc: summarize(recalc),
        // Recalculate touches every goal category, so its map size is the
        // honest "does this category have any goals at all" signal.
        hasGoals: recalc.allocations.size > 0,
      });
    } catch (e) {
      setComputed(null);
      void dialog.alert({
        title: t("autoAssign.errorTitle"),
        message: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setLoading(false);
    }
  }, [month, summarize, t]);

  const choose = useCallback(
    (summary: ModeSummary) => {
      if (summary.errors.length > 0) {
        const lines = summary.errors.map((e) => `${e.category}: ${e.error}`).join("\n");
        void dialog.alert({ title: t("autoAssign.errorTitle"), message: lines });
      }
      onApply(summary.allocations);
    },
    [onApply, t],
  );

  return { computed, loading, recompute, choose };
}
