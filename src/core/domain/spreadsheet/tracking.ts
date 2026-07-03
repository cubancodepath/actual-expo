/**
 * Budget formula definitions for the tracking/report budgeting system.
 *
 * Ported from Actual Budget's server/budget/tracking.ts. Unlike envelope
 * budgeting, tracking mode has no to-budget/buffered/from-last-month pool —
 * each category just tracks budgeted vs. actual, and the summary reports
 * whether the month as a whole was "saved" (income minus spending).
 *
 * Same cell-creation contract as envelope.ts: `createBudgetCells` is called
 * once per month (idempotent — createDynamic no-ops if a cell already
 * exists), wrapped by the caller in startTransaction/endTransaction.
 */

import type { Spreadsheet } from "./spreadsheet";
import { sheetForMonth, trackingBudget } from "./bindings";
import { firstSync } from "@/core/db";
import { monthToInt, addMonths } from "@/lib/date";
import { getCategories, getCategoryGroups } from "../categories";
import type { Category, CategoryGroup } from "../categories/types";
import { safeNumber } from "@/lib/number";
import { num, createSpentCells, getBudgetRange } from "./shared";

export async function createBudgetCells(
  ss: Spreadsheet,
  month: string,
  categories: Category[],
  groups: CategoryGroup[],
): Promise<void> {
  const sheet = sheetForMonth(month);
  const prevSheet = sheetForMonth(addMonths(month, -1));
  const monthInt = monthToInt(month);

  const incomeGroup = groups.find((g) => g.is_income);
  const expenseGroups = groups.filter((g) => !g.is_income && !g.hidden);

  // ── Per-category: catSpent for ALL categories (shared with envelope) ──
  createSpentCells(ss, month, categories);

  // ── Per-category: budget/carryover/balance/spentWithCarryover for ALL categories ──
  for (const cat of categories) {
    ss.createDynamic(sheet, trackingBudget.catBudgeted(cat.id), {
      dependencies: [],
      run: () => {
        const row = firstSync<{ amount: number }>(
          "SELECT amount FROM reflect_budgets WHERE month = ? AND category = ?",
          [monthInt, cat.id],
        );
        return row?.amount ?? 0;
      },
    });

    ss.createDynamic(sheet, trackingBudget.catCarryover(cat.id), {
      dependencies: [],
      run: () => {
        const row = firstSync<{ carryover: number }>(
          "SELECT carryover FROM reflect_budgets WHERE month = ? AND category = ?",
          [monthInt, cat.id],
        );
        return row?.carryover === 1;
      },
    });

    ss.createDynamic(sheet, trackingBudget.catBalance(cat.id), {
      dependencies: [
        trackingBudget.catBudgeted(cat.id),
        trackingBudget.catSpent(cat.id),
        `${prevSheet}!${trackingBudget.catCarryover(cat.id)}`,
        `${prevSheet}!${trackingBudget.catBalance(cat.id)}`,
      ],
      run: (budgetedVal, spentVal, prevCarryoverVal, prevBalance) => {
        const budgeted = num(budgetedVal);
        const spent = num(spentVal);
        const prevCo = prevCarryoverVal === true || prevCarryoverVal === 1;
        const carryIn = prevCo ? num(prevBalance) : 0;
        return cat.is_income
          ? safeNumber(budgeted - spent + carryIn)
          : safeNumber(budgeted + spent + carryIn);
      },
    });

    ss.createDynamic(sheet, trackingBudget.spentWithCarryover(cat.id), {
      dependencies: [
        trackingBudget.catBudgeted(cat.id),
        trackingBudget.catSpent(cat.id),
        trackingBudget.catCarryover(cat.id),
      ],
      run: (budgetedVal, spentVal, carryoverVal) => {
        const carryover = carryoverVal === true || carryoverVal === 1;
        const spent = num(spentVal);
        return carryover ? Math.max(0, safeNumber(num(budgetedVal) + spent)) : spent;
      },
    });
  }

  // ── Per-group: groupSpent/groupBudgeted/groupBalance for ALL groups
  //    (non-hidden categories only, matches upstream) ──
  for (const group of groups) {
    const groupCats = categories.filter((c) => c.cat_group === group.id && !c.hidden);

    ss.createDynamic(sheet, trackingBudget.groupSpent(group.id), {
      dependencies: groupCats.map((c) => trackingBudget.catSpent(c.id)),
      run: (...vals) => safeNumber(vals.reduce((sum: number, v) => sum + num(v), 0)),
    });

    ss.createDynamic(sheet, trackingBudget.groupBudgeted(group.id), {
      dependencies: groupCats.map((c) => trackingBudget.catBudgeted(c.id)),
      run: (...vals) => safeNumber(vals.reduce((sum: number, v) => sum + num(v), 0)),
    });

    ss.createDynamic(sheet, trackingBudget.groupBalance(group.id), {
      dependencies: groupCats.map((c) => trackingBudget.catBalance(c.id)),
      run: (...vals) => safeNumber(vals.reduce((sum: number, v) => sum + num(v), 0)),
    });
  }

  // ── Summary cells ──
  ss.createDynamic(sheet, trackingBudget.totalBudgeted, {
    dependencies: expenseGroups.map((g) => trackingBudget.groupBudgeted(g.id)),
    // NOT negated, unlike envelope's total-budgeted — tracking mode has no
    // to-budget pool to subtract from (upstream: budget/tracking.ts).
    run: (...vals) => safeNumber(vals.reduce((sum: number, v) => sum + num(v), 0)),
  });

  ss.createDynamic(sheet, trackingBudget.totalSpent, {
    dependencies: expenseGroups.map((g) => trackingBudget.groupSpent(g.id)),
    run: (...vals) => safeNumber(vals.reduce((sum: number, v) => sum + num(v), 0)),
  });

  if (incomeGroup) {
    ss.createDynamic(sheet, trackingBudget.totalIncome, {
      dependencies: [trackingBudget.groupSpent(incomeGroup.id)],
      run: (amount) => num(amount),
    });
    ss.createDynamic(sheet, trackingBudget.totalBudgetIncome, {
      dependencies: [trackingBudget.groupBudgeted(incomeGroup.id)],
      run: (amount) => num(amount),
    });
  } else {
    ss.createStatic(sheet, trackingBudget.totalIncome, 0);
    ss.createStatic(sheet, trackingBudget.totalBudgetIncome, 0);
  }

  ss.createDynamic(sheet, trackingBudget.totalLeftover, {
    dependencies: expenseGroups.map((g) => trackingBudget.groupBalance(g.id)),
    run: (...vals) => safeNumber(vals.reduce((sum: number, v) => sum + num(v), 0)),
  });

  ss.createDynamic(sheet, trackingBudget.totalSaved, {
    dependencies: [trackingBudget.totalBudgetIncome, trackingBudget.totalBudgeted],
    // Not safeNumber-wrapped in upstream either — a plain difference of two
    // already-safe integer cells.
    run: (income, budgeted) => num(income) - num(budgeted),
  });

  ss.createDynamic(sheet, trackingBudget.realSaved, {
    dependencies: [trackingBudget.totalIncome, trackingBudget.totalSpent],
    run: (income, spent) => safeNumber(num(income) - -num(spent)),
  });
}

/**
 * Create tracking budget cells for ALL months in the budget range.
 * Mirrors envelope.ts's createAllBudgetCells.
 */
export async function createAllBudgetCells(
  ss: Spreadsheet,
): Promise<{ start: string; end: string }> {
  const { start, end, months } = await getBudgetRange();
  const [cats, groups] = await Promise.all([getCategories(), getCategoryGroups()]);

  ss.startTransaction();
  for (const month of months) {
    await createBudgetCells(ss, month, cats, groups);
  }
  ss.endTransaction();

  return { start, end };
}
