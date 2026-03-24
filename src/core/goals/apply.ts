/**
 * Apply goal templates to all categories for a given month.
 *
 * Reads each category's goal_def, calculates the goal result using
 * the engine, and returns computed allocations.
 *
 * Uses a two-pass architecture:
 *   Pass 1: Process all non-remainder categories
 *   Pass 2: Distribute leftover budget to remainder categories by weight
 */

import { runQuery, first } from "../db";
import { monthToInt } from "@/lib/date";
import { setBudgetAmount, computeToBudget, computeCarryoverChain } from "../budgets";
import type { CategoryRow, ZeroBudgetRow } from "../db/types";
import { calculateGoal, type GoalContext } from "./engine";
import { parseGoalDef } from "./parse";
import { setGoalResult } from "./persist";

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type GoalAllocation = {
  categoryId: string;
  amount: number;
  goal: number | null;
  longGoal: boolean;
};

export type ComputeGoalsResult = {
  /** Computed allocations per category (categoryId → amount in cents). */
  allocations: Map<string, GoalAllocation>;
  /** Number of categories that had templates applied. */
  applied: number;
  /** Errors encountered (category name + error message). */
  errors: Array<{ category: string; error: string }>;
};

// ---------------------------------------------------------------------------
// Compute goal allocations (dry run — no DB writes)
// ---------------------------------------------------------------------------

/**
 * Compute goal-based budget allocations for all categories in a month.
 *
 * This is a **read-only** operation — it calculates what each category
 * should be budgeted based on its goal templates, but does NOT write
 * anything to the database. The caller decides what to do with the results.
 *
 * @param month  Target month ("YYYY-MM")
 * @param force  If true, recalculate categories that already have a budget.
 *               If false (default), only fill underfunded categories.
 * @returns      Computed allocations and any errors
 */
export async function computeGoalAllocations(
  month: string,
  force = false,
): Promise<ComputeGoalsResult> {
  const monthInt = monthToInt(month);

  // Get all non-hidden categories with goal_def set
  // Hidden categories are excluded — they should only be processed if
  // the user explicitly selects them (matches original Actual behavior).
  const categories = await runQuery<CategoryRow>(
    `SELECT c.* FROM categories c
     JOIN category_groups g ON g.id = c.cat_group AND g.is_income = 0
     WHERE c.tombstone = 0 AND c.hidden = 0 AND g.hidden = 0
       AND c.goal_def IS NOT NULL AND c.goal_def != ''`,
  );

  // Get current month's budget rows for previouslyBudgeted
  const budgetRows = await runQuery<ZeroBudgetRow>("SELECT * FROM zero_budgets WHERE month = ?", [
    monthInt,
  ]);
  const budgetMap = new Map(budgetRows.map((r) => [r.category, r.amount]));

  // Compute carryover chain once for all categories (accurate fromLastMonth)
  const allExpenseCatIds = await getAllExpenseCategoryIds();
  const { carryIns } = await computeCarryoverChain(monthInt, allExpenseCatIds);

  const allocations = new Map<string, GoalAllocation>();
  const result: ComputeGoalsResult = { allocations, applied: 0, errors: [] };

  // Track available budget — deduct each allocation so we don't over-assign
  let availBudget = await computeToBudget(month);

  // Track remainder categories for pass 2
  const remainderCategories: Array<{
    cat: CategoryRow;
    templates: import("./types").Template[];
    fromLastMonth: number;
    previouslyBudgeted: number;
    weight: number;
  }> = [];

  // ── Pass 1: Process all non-remainder categories ──────────────────────────
  for (const cat of categories) {
    try {
      const templates = parseGoalDef(cat.goal_def);
      if (templates.length === 0) continue;

      const previouslyBudgeted = budgetMap.get(cat.id) ?? 0;
      const fromLastMonth = carryIns.get(cat.id) ?? 0;

      const ctx: GoalContext = { fromLastMonth, previouslyBudgeted };
      const goalResult = await calculateGoal(cat.id, month, templates, ctx);

      // Check if this is a remainder category
      if (goalResult.hasRemainder) {
        remainderCategories.push({
          cat,
          templates,
          fromLastMonth,
          previouslyBudgeted,
          weight: goalResult.remainderWeight ?? 1,
        });
        continue;
      }

      // Skip if already at or above goal (unless force mode)
      if (!force && previouslyBudgeted >= goalResult.budgeted && goalResult.budgeted > 0) {
        allocations.set(cat.id, {
          categoryId: cat.id,
          amount: previouslyBudgeted,
          goal: goalResult.goal,
          longGoal: goalResult.longGoal,
        });
        continue;
      }

      // Compute the budgeted amount (capped at available budget)
      const delta = goalResult.budgeted - previouslyBudgeted;
      const cappedDelta = Math.min(delta, Math.max(0, availBudget));
      const amount = previouslyBudgeted + cappedDelta;
      availBudget -= cappedDelta;

      allocations.set(cat.id, {
        categoryId: cat.id,
        amount,
        goal: goalResult.goal,
        longGoal: goalResult.longGoal,
      });
      result.applied++;
    } catch (e) {
      result.errors.push({
        category: cat.name,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // ── Pass 2: Distribute remaining budget to remainder categories ───────────
  if (remainderCategories.length > 0) {
    try {
      // Compute remainder available: original availBudget minus what pass 1 consumed
      const remainderAvail = availBudget;
      const totalWeight = remainderCategories.reduce((sum, r) => sum + r.weight, 0);

      for (const rc of remainderCategories) {
        try {
          const ctx: GoalContext = {
            fromLastMonth: rc.fromLastMonth,
            previouslyBudgeted: rc.previouslyBudgeted,
            remainderBudget: remainderAvail,
            totalWeight,
          };
          const goalResult = await calculateGoal(rc.cat.id, month, rc.templates, ctx);

          allocations.set(rc.cat.id, {
            categoryId: rc.cat.id,
            amount: goalResult.budgeted,
            goal: goalResult.goal,
            longGoal: goalResult.longGoal,
          });
          result.applied++;
        } catch (e) {
          result.errors.push({
            category: rc.cat.name,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
    } catch (e) {
      result.errors.push({
        category: "(remainder)",
        error: `Failed to compute available budget: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Apply goals (writes to DB) — used for persisting auto-assign results
// ---------------------------------------------------------------------------

/**
 * Persist goal allocations to the database.
 * Writes budget amounts and goal indicators via CRDT messages.
 */
export async function persistGoalAllocations(
  month: string,
  allocations: Map<string, GoalAllocation>,
): Promise<void> {
  for (const alloc of allocations.values()) {
    if (alloc.amount > 0) {
      await setBudgetAmount(month, alloc.categoryId, alloc.amount);
    }
    await setGoalResult(month, alloc.categoryId, alloc.goal, alloc.longGoal);
  }
}

// ---------------------------------------------------------------------------
// Update goal indicator for a single category (used by goal editor)
// ---------------------------------------------------------------------------

/**
 * Compute and write only the goal indicator (goal + longGoal) for a category.
 * Does NOT change the budgeted amount — that's only done via the assign screen.
 */
export async function updateGoalIndicator(month: string, categoryId: string): Promise<void> {
  const monthInt = monthToInt(month);

  const cat = await first<CategoryRow>("SELECT * FROM categories WHERE id = ? AND tombstone = 0", [
    categoryId,
  ]);
  if (!cat || !cat.goal_def) {
    // Goal was removed — clear the indicator
    await setGoalResult(month, categoryId, null, null);
    return;
  }

  const templates = parseGoalDef(cat.goal_def);
  if (templates.length === 0) {
    await setGoalResult(month, categoryId, null, null);
    return;
  }

  const budgetRow = await first<ZeroBudgetRow>(
    "SELECT * FROM zero_budgets WHERE month = ? AND category = ?",
    [monthInt, categoryId],
  );
  const previouslyBudgeted = budgetRow?.amount ?? 0;

  const allExpenseCatIds = await getAllExpenseCategoryIds();
  const { carryIns } = await computeCarryoverChain(monthInt, allExpenseCatIds);
  const fromLastMonth = carryIns.get(categoryId) ?? 0;

  const ctx: GoalContext = { fromLastMonth, previouslyBudgeted };
  const goalResult = await calculateGoal(categoryId, month, templates, ctx);

  // Write only the goal indicator — never the budgeted amount
  await setGoalResult(
    month,
    categoryId,
    goalResult.hasRemainder ? null : goalResult.goal,
    goalResult.hasRemainder ? false : goalResult.longGoal,
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get all non-tombstoned expense category IDs. */
async function getAllExpenseCategoryIds(): Promise<string[]> {
  const rows = await runQuery<{ id: string }>(
    `SELECT c.id FROM categories c
     JOIN category_groups g ON g.id = c.cat_group AND g.is_income = 0
     WHERE c.tombstone = 0`,
  );
  return rows.map((r) => r.id);
}
