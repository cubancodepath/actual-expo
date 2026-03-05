/**
 * Apply goal templates to all categories for a given month.
 *
 * Reads each category's goal_def, calculates the goal result using
 * the engine, and saves the computed goal/long_goal to zero_budgets.
 *
 * Uses a two-pass architecture:
 *   Pass 1: Process all non-remainder categories
 *   Pass 2: Distribute leftover budget to remainder categories by weight
 */

import { runQuery, first } from '../db';
import { monthToInt, addMonths } from '../lib/date';
import { setBudgetAmount } from '../budgets';
import type { CategoryRow, ZeroBudgetRow } from '../db/types';
import { calculateGoal, type GoalContext } from './engine';
import { parseGoalDef } from './index';
import { setGoalResult } from './index';
import type { RemainderTemplate } from './types';

// ---------------------------------------------------------------------------
// Alive transaction filter (same as budgets/index.ts)
// ---------------------------------------------------------------------------

const ALIVE_TX_FILTER = `
  t.tombstone = 0
  AND t.isParent = 0
  AND t.date IS NOT NULL
  AND t.acct IS NOT NULL
  AND (t.isChild = 0 OR NOT EXISTS (
    SELECT 1 FROM transactions t2 WHERE t2.id = t.parent_id AND t2.tombstone = 1
  ))`;

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export type ApplyGoalsResult = {
  /** Number of categories that had templates applied. */
  applied: number;
  /** Errors encountered (category name + error message). */
  errors: Array<{ category: string; error: string }>;
};

// ---------------------------------------------------------------------------
// Compute previous month's balance for a category
// ---------------------------------------------------------------------------

/**
 * Get the leftover balance from the previous month for a category.
 * This is a simplified version — computes budgeted + spent + carryIn
 * for the previous month only (not the full carryover chain).
 *
 * For a more accurate result, we query the budget row + transactions
 * for the previous month.
 */
async function getFromLastMonth(
  categoryId: string,
  month: string,
): Promise<number> {
  const prevMonth = addMonths(month, -1);
  const prevMonthInt = monthToInt(prevMonth);
  const startDate = prevMonthInt * 100 + 1;
  const endDate = prevMonthInt * 100 + 31;

  // Get budgeted amount for previous month
  const budgetRow = await first<{ amount: number; carryover: number }>(
    'SELECT amount, carryover FROM zero_budgets WHERE month = ? AND category = ?',
    [prevMonthInt, categoryId],
  );
  const budgeted = budgetRow?.amount ?? 0;
  const carryover = budgetRow?.carryover === 1;

  // Get spent amount for previous month
  const spentRow = await first<{ spent: number }>(
    `SELECT COALESCE(SUM(t.amount), 0) AS spent
     FROM transactions t
     LEFT JOIN category_mapping cm ON cm.id = t.category
     JOIN accounts a ON a.id = t.acct AND a.offbudget = 0
     WHERE ${ALIVE_TX_FILTER}
       AND COALESCE(cm.transferId, t.category) = ?
       AND t.date >= ? AND t.date <= ?`,
    [categoryId, startDate, endDate],
  );
  const spent = spentRow?.spent ?? 0;

  const leftover = budgeted + spent;

  // If carryover is off and leftover is negative, it doesn't carry forward
  if (!carryover && leftover < 0) return 0;

  // Positive balances always carry forward
  return leftover;
}

// ---------------------------------------------------------------------------
// Get total available budget for a month (income - already allocated)
// ---------------------------------------------------------------------------

async function getToBudget(month: string): Promise<number> {
  const monthInt = monthToInt(month);
  const startDate = monthInt * 100 + 1;
  const endDate = monthInt * 100 + 31;

  // Total income this month
  const incomeRow = await first<{ total: number }>(
    `SELECT COALESCE(SUM(t.amount), 0) AS total
     FROM transactions t
     LEFT JOIN category_mapping cm ON cm.id = t.category
     JOIN categories c ON c.id = COALESCE(cm.transferId, t.category) AND c.tombstone = 0
     JOIN category_groups g ON g.id = c.cat_group AND g.is_income = 1
     JOIN accounts a ON a.id = t.acct AND a.offbudget = 0
     WHERE ${ALIVE_TX_FILTER}
       AND t.date >= ? AND t.date <= ?`,
    [startDate, endDate],
  );
  const income = incomeRow?.total ?? 0;

  // Total already budgeted this month
  const budgetedRow = await first<{ total: number }>(
    `SELECT COALESCE(SUM(zb.amount), 0) AS total
     FROM zero_budgets zb
     JOIN categories c ON c.id = zb.category AND c.tombstone = 0
     JOIN category_groups g ON g.id = c.cat_group AND g.is_income = 0
     WHERE zb.month = ?`,
    [monthInt],
  );
  const budgeted = budgetedRow?.total ?? 0;

  return income - budgeted;
}

// ---------------------------------------------------------------------------
// Main apply function
// ---------------------------------------------------------------------------

/**
 * Apply goal templates to all categories for a month.
 *
 * For each category with a non-null goal_def:
 * 1. Parse the goal_def JSON into templates
 * 2. Get the previous month's leftover balance
 * 3. Calculate goal result using the engine
 * 4. Write the budgeted amount to zero_budgets.amount
 * 5. Write goal indicator to zero_budgets.goal / long_goal
 *
 * Uses two passes: first processes priority-based templates,
 * then distributes remaining budget to remainder categories.
 *
 * @param month  Target month ("YYYY-MM")
 * @param force  If true, overwrite categories that already have a budget.
 *               If false (default), only fill categories with budget = 0.
 * @returns      Result with count of applied categories and any errors
 */
export async function applyGoals(
  month: string,
  force = false,
): Promise<ApplyGoalsResult> {
  const monthInt = monthToInt(month);

  // Get all categories with goal_def set
  const categories = await runQuery<CategoryRow>(
    `SELECT c.* FROM categories c
     JOIN category_groups g ON g.id = c.cat_group AND g.is_income = 0
     WHERE c.tombstone = 0 AND c.goal_def IS NOT NULL AND c.goal_def != ''`,
  );

  // Get current month's budget rows for previouslyBudgeted
  const budgetRows = await runQuery<ZeroBudgetRow>(
    'SELECT * FROM zero_budgets WHERE month = ?',
    [monthInt],
  );
  const budgetMap = new Map(budgetRows.map(r => [r.category, r.amount]));

  const result: ApplyGoalsResult = { applied: 0, errors: [] };

  // Track available budget — deduct each allocation so we don't over-assign
  let availBudget = await getToBudget(month);

  // Track remainder categories for pass 2
  const remainderCategories: Array<{
    cat: CategoryRow;
    templates: import('./types').Template[];
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

      // Skip categories that already have a budget (unless force mode)
      if (previouslyBudgeted !== 0 && !force) {
        // Still write goal indicator for display purposes
        const fromLastMonth = await getFromLastMonth(cat.id, month);
        const ctx: GoalContext = { fromLastMonth, previouslyBudgeted };
        const goalResult = await calculateGoal(cat.id, month, templates, ctx);
        if (!goalResult.hasRemainder) {
          await setGoalResult(month, cat.id, goalResult.goal, goalResult.longGoal);
        }
        continue;
      }

      const fromLastMonth = await getFromLastMonth(cat.id, month);
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

      // Write the budgeted amount (capped at available budget)
      const amount = Math.min(goalResult.budgeted, Math.max(0, availBudget));
      if (amount > 0 || force) {
        await setBudgetAmount(month, cat.id, amount);
        availBudget -= amount;
      }

      await setGoalResult(month, cat.id, goalResult.goal, goalResult.longGoal);
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
      // Re-query available budget since pass 1 wrote new amounts
      const remainderAvail = await getToBudget(month);
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

          // Write budgeted amount
          if (goalResult.budgeted > 0 || force) {
            await setBudgetAmount(month, rc.cat.id, goalResult.budgeted);
          }

          await setGoalResult(month, rc.cat.id, goalResult.goal, goalResult.longGoal);
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
        category: '(remainder)',
        error: `Failed to compute available budget: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }

  return result;
}

