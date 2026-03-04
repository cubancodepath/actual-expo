/**
 * Apply goal templates to all categories for a given month.
 *
 * Reads each category's goal_def, calculates the goal result using
 * the engine, and saves the computed goal/long_goal to zero_budgets.
 */

import { runQuery, first } from '../db';
import { monthToInt, addMonths } from '../lib/date';
import type { CategoryRow, ZeroBudgetRow } from '../db/types';
import { calculateGoal, type GoalContext } from './engine';
import { parseGoalDef } from './index';
import { setGoalResult } from './index';

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
// Main apply function
// ---------------------------------------------------------------------------

/**
 * Apply goal templates to all categories for a month.
 *
 * For each category with a non-null goal_def:
 * 1. Parse the goal_def JSON into templates
 * 2. Get the previous month's leftover balance
 * 3. Calculate goal result using the engine
 * 4. Save goal and long_goal to zero_budgets
 *
 * @param month  Target month ("YYYY-MM")
 * @returns      Result with count of applied categories and any errors
 */
export async function applyGoals(month: string): Promise<ApplyGoalsResult> {
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

  for (const cat of categories) {
    try {
      const templates = parseGoalDef(cat.goal_def);
      if (templates.length === 0) continue;

      const fromLastMonth = await getFromLastMonth(cat.id, month);
      const previouslyBudgeted = budgetMap.get(cat.id) ?? 0;

      const ctx: GoalContext = { fromLastMonth, previouslyBudgeted };
      const goalResult = await calculateGoal(cat.id, month, templates, ctx);

      await setGoalResult(
        month,
        cat.id,
        goalResult.goal,
        goalResult.longGoal,
      );

      result.applied++;
    } catch (e) {
      result.errors.push({
        category: cat.name,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return result;
}
