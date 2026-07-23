/**
 * Budget formula definitions for the envelope budgeting system.
 *
 * Ported from Actual Budget's server/budget/envelope.ts.
 * Each cell is created exactly once per month (like loot-core).
 *
 * Cell types:
 * - SQL cells (deps=[]): re-query DB on recompute via triggerBudgetChanges
 * - Formula cells (deps=[...]): pure functions of other cells, cascade automatically
 * - Static cells: set once, only change via ss.setByName()
 */

import { Spreadsheet } from "@/core/server/spreadsheet/spreadsheet";
import { sheetForMonth, envelopeBudget } from "@/core/server/spreadsheet/bindings";
import { firstSync } from "@/core/db";
import { monthToInt, addMonths } from "@/core/shared/months";
import { getCategories, getCategoryGroups } from "@/core/server/budget";
import type { Category, CategoryGroup } from "@/core/types/models";
import { safeNumber } from "@/lib/number";
import { num, createSpentCells, getBudgetRange } from "@/core/server/spreadsheet/util";
import { inferGoalFromDef } from "@/core/server/budget/goals";

// ---------------------------------------------------------------------------
// Create all budget cells for a single month
// ---------------------------------------------------------------------------

/**
 * Create all budget cells for a given month.
 * Each cell is created exactly once — createDynamic does early-return
 * if the cell already exists (matching loot-core's idempotent pattern).
 *
 * Can be called with or without an outer transaction.
 * When called from createAllBudgetCells, the caller wraps in startTransaction/endTransaction.
 */
export async function createBudgetCells(
  ss: Spreadsheet,
  month: string,
  categories: Category[],
  groups: CategoryGroup[],
): Promise<void> {
  const sheet = sheetForMonth(month);
  const prevMonth = addMonths(month, -1);
  const prevSheet = sheetForMonth(prevMonth);
  const monthInt = monthToInt(month);

  const expenseGroups = groups.filter((g) => !g.is_income);
  const incomeGroup = groups.find((g) => g.is_income);
  const incomeCats = categories.filter((c) => incomeGroup && c.cat_group === incomeGroup.id);

  // ── Buffered (SQL cell) ──
  ss.createDynamic(sheet, envelopeBudget.buffered, {
    dependencies: [],
    run: () => {
      const row = firstSync<{ buffered: number }>(
        "SELECT buffered FROM zero_budget_months WHERE id = ?",
        [month],
      );
      return row?.buffered ?? 0;
    },
  });

  // ── Per-category: catSpent for ALL categories (income + expense) ──
  createSpentCells(ss, month, categories);

  // ── Per-category: budget/carryover/balance for expense categories only ──
  for (const cat of categories) {
    const group = groups.find((g) => g.id === cat.cat_group);
    if (!group || group.is_income) continue;

    ss.createDynamic(sheet, envelopeBudget.catBudgeted(cat.id), {
      dependencies: [],
      run: () => {
        const row = firstSync<{ amount: number }>(
          "SELECT amount FROM zero_budgets WHERE month = ? AND category = ?",
          [monthInt, cat.id],
        );
        return row?.amount ?? 0;
      },
    });

    ss.createDynamic(sheet, envelopeBudget.catCarryover(cat.id), {
      dependencies: [],
      run: () => {
        const row = firstSync<{ carryover: number }>(
          "SELECT carryover FROM zero_budgets WHERE month = ? AND category = ?",
          [monthInt, cat.id],
        );
        return row?.carryover === 1;
      },
    });

    ss.createDynamic(sheet, envelopeBudget.catBalance(cat.id), {
      dependencies: [
        envelopeBudget.catBudgeted(cat.id),
        envelopeBudget.catSpent(cat.id),
        `${prevSheet}!${envelopeBudget.catCarryover(cat.id)}`,
        `${prevSheet}!${envelopeBudget.catBalance(cat.id)}`,
        `${prevSheet}!${envelopeBudget.catBalancePos(cat.id)}`,
      ],
      run: (budgetedVal, spentVal, prevCarryoverVal, prevBalance, prevBalancePos) => {
        const prevCo = prevCarryoverVal === true || prevCarryoverVal === 1;
        return safeNumber(
          num(budgetedVal) + num(spentVal) + (prevCo ? num(prevBalance) : num(prevBalancePos)),
        );
      },
    });

    ss.createDynamic(sheet, envelopeBudget.catBalancePos(cat.id), {
      dependencies: [envelopeBudget.catBalance(cat.id)],
      run: (balance) => Math.max(0, num(balance)),
    });

    // Goal cells mirror zero_budgets.goal/long_goal — the values applyGoals()
    // persists — so applying templates / remote sync updates category colors
    // live (parity with upstream handleBudgetChange, which re-sets these cells
    // on every budget change). Dynamic (not static) so triggerBudgetChanges can
    // invalidate them via the "goal-"/"long-goal-" prefixes.
    //
    // Fallback when no zero_budgets row/value yet (month before applyGoals):
    // infer from goal_def, the same inference the getBudgetMonth() read path
    // uses. carryIn isn't available at this synchronous point, so "by"
    // sinking-fund goals approximate it as 0 — the function's documented fallback.
    const inferred = cat.goal_def ? inferGoalFromDef(cat.goal_def, month) : null;
    ss.createDynamic(sheet, envelopeBudget.catGoal(cat.id), {
      dependencies: [],
      run: () => {
        const row = firstSync<{ goal: number | null }>(
          "SELECT goal FROM zero_budgets WHERE month = ? AND category = ?",
          [monthInt, cat.id],
        );
        return row?.goal ?? inferred?.goal ?? 0;
      },
    });
    ss.createDynamic(sheet, envelopeBudget.catLongGoal(cat.id), {
      dependencies: [],
      run: () => {
        const row = firstSync<{ long_goal: number | null }>(
          "SELECT long_goal FROM zero_budgets WHERE month = ? AND category = ?",
          [monthInt, cat.id],
        );
        return row?.long_goal != null ? row.long_goal === 1 : (inferred?.longGoal ?? false);
      },
    });
  }

  // ── Per-group: groupSpent for ALL groups (income + expense) ──
  for (const group of groups) {
    const groupCats = categories.filter((c) => c.cat_group === group.id);
    ss.createDynamic(sheet, envelopeBudget.groupSpent(group.id), {
      dependencies: groupCats.map((c) => envelopeBudget.catSpent(c.id)),
      run: (...vals) => safeNumber(vals.reduce((sum: number, v) => sum + num(v), 0)),
    });
  }

  // ── Per-group: groupBudgeted/groupBalance for expense groups only ──
  for (const group of expenseGroups) {
    const groupCats = categories.filter((c) => c.cat_group === group.id);

    ss.createDynamic(sheet, envelopeBudget.groupBudgeted(group.id), {
      dependencies: groupCats.map((c) => envelopeBudget.catBudgeted(c.id)),
      run: (...vals) => safeNumber(vals.reduce((sum: number, v) => sum + num(v), 0)),
    });

    ss.createDynamic(sheet, envelopeBudget.groupBalance(group.id), {
      dependencies: groupCats.map((c) => envelopeBudget.catBalance(c.id)),
      run: (...vals) => safeNumber(vals.reduce((sum: number, v) => sum + num(v), 0)),
    });
  }

  // ── totalIncome: alias of income group's spent (formula, not SQL) ──
  if (incomeGroup) {
    ss.createDynamic(sheet, envelopeBudget.totalIncome, {
      dependencies: [envelopeBudget.groupSpent(incomeGroup.id)],
      run: (amount) => num(amount),
    });
  } else {
    ss.createStatic(sheet, envelopeBudget.totalIncome, 0);
  }

  // ── Summary cells ──
  ss.createDynamic(sheet, envelopeBudget.totalBudgeted, {
    dependencies: expenseGroups.map((g) => envelopeBudget.groupBudgeted(g.id)),
    run: (...vals) => safeNumber(-vals.reduce((sum: number, v) => sum + num(v), 0)),
  });

  ss.createDynamic(sheet, envelopeBudget.totalSpent, {
    dependencies: expenseGroups.map((g) => envelopeBudget.groupSpent(g.id)),
    run: (...vals) => safeNumber(vals.reduce((sum: number, v) => sum + num(v), 0)),
  });

  ss.createDynamic(sheet, envelopeBudget.totalBalance, {
    dependencies: expenseGroups.map((g) => envelopeBudget.groupBalance(g.id)),
    run: (...vals) => safeNumber(vals.reduce((sum: number, v) => sum + num(v), 0)),
  });

  // ── Buffered auto/selected ──
  ss.createDynamic(sheet, envelopeBudget.bufferedAuto, {
    dependencies: incomeCats.flatMap((c) => [
      envelopeBudget.catSpent(c.id),
      envelopeBudget.catCarryover(c.id),
    ]),
    run: (...vals) => {
      let total = 0;
      for (let i = 0; i < vals.length; i += 2) {
        const amount = num(vals[i]);
        const co = vals[i + 1] === true || vals[i + 1] === 1;
        if (co) total += amount;
      }
      return safeNumber(total);
    },
  });

  ss.createDynamic(sheet, envelopeBudget.bufferedSelected, {
    dependencies: [envelopeBudget.buffered, envelopeBudget.bufferedAuto],
    run: (manual, auto) => (num(manual) !== 0 ? num(manual) : num(auto)),
  });

  // ── Cross-month cells ──
  ss.createDynamic(sheet, envelopeBudget.fromLastMonth, {
    dependencies: [
      `${prevSheet}!${envelopeBudget.toBudget}`,
      `${prevSheet}!${envelopeBudget.bufferedSelected}`,
    ],
    run: (prevToBudget, prevBuffered) => safeNumber(num(prevToBudget) + num(prevBuffered)),
  });

  ss.createDynamic(sheet, envelopeBudget.lastMonthOverspent, {
    dependencies: categories
      .filter((c) => {
        const g = groups.find((grp) => grp.id === c.cat_group);
        return g && !g.is_income;
      })
      .flatMap((c) => [
        `${prevSheet}!${envelopeBudget.catBalance(c.id)}`,
        `${prevSheet}!${envelopeBudget.catCarryover(c.id)}`,
      ]),
    run: (...vals) => {
      let penalty = 0;
      for (let i = 0; i < vals.length; i += 2) {
        const balance = num(vals[i]);
        const co = vals[i + 1] === true || vals[i + 1] === 1;
        if (balance < 0 && !co) penalty += balance;
      }
      return safeNumber(penalty);
    },
  });

  // ── Final: incomeAvailable + toBudget ──
  ss.createDynamic(sheet, envelopeBudget.incomeAvailable, {
    dependencies: [envelopeBudget.totalIncome, envelopeBudget.fromLastMonth],
    run: (income, fromLast) => safeNumber(num(income) + num(fromLast)),
  });

  ss.createDynamic(sheet, envelopeBudget.toBudget, {
    dependencies: [
      envelopeBudget.incomeAvailable,
      envelopeBudget.lastMonthOverspent,
      envelopeBudget.totalBudgeted,
      envelopeBudget.bufferedSelected,
    ],
    run: (available, lastOverspent, totalBudgeted, buffered) =>
      safeNumber(num(available) + num(lastOverspent) + num(totalBudgeted) - num(buffered)),
  });
}

// ---------------------------------------------------------------------------
// Multi-month loading
// ---------------------------------------------------------------------------

export { getBudgetRange } from "@/core/server/spreadsheet/util";

/**
 * Create budget cells for ALL months in the budget range.
 * Wraps everything in a single transaction so topological sort runs once.
 * Returns the built range so callers (spreadsheet/sync.ts) can track it for
 * ensureMonthRange()'s gap-filling extension.
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
