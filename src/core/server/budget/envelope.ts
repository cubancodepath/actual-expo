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
import { firstSync } from "@/core/server/db";
import { monthToInt, addMonths } from "@/core/shared/months";
import { getCategories, getCategoryGroups } from "@/core/server/budget";
import type { Category, CategoryGroup } from "@/core/types/models";
import { safeNumber } from "@/core/shared/util";
import { num, createSpentCells, getBudgetRange } from "@/core/server/budget/base";
import { warmBuffered, warmZeroBudget } from "@/core/server/spreadsheet/warm-cache";
import { inferGoalFromDef } from "@/core/server/budget/goal-template-parser";

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
/**
 * The per-category cells of one month: what's budgeted, whether it carries
 * over, the resulting balance and the goal pair. Expense categories only —
 * income ones get their spend cell from `createSpentCells` and nothing else.
 *
 * Split out of the build loop so `handleCategoryChange` can create exactly
 * these for a single new category, instead of rebuilding the month.
 */
export function createCategory(ss: Spreadsheet, cat: Category, month: string): void {
  const sheet = sheetForMonth(month);
  const prevSheet = sheetForMonth(addMonths(month, -1));
  const monthInt = monthToInt(month);

  ss.createDynamic(sheet, envelopeBudget.catBudgeted(cat.id), {
    dependencies: [],
    run: () => {
      const cached = warmZeroBudget(monthInt, cat.id);
      if (cached !== undefined) return cached?.amount ?? 0;

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
      const cached = warmZeroBudget(monthInt, cat.id);
      if (cached !== undefined) return cached?.carryover === 1;

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
      const cached = warmZeroBudget(monthInt, cat.id);
      if (cached !== undefined) return cached?.goal ?? inferred?.goal ?? 0;

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
      const cached = warmZeroBudget(monthInt, cat.id);
      if (cached !== undefined) {
        return cached?.long_goal != null ? cached.long_goal === 1 : (inferred?.longGoal ?? false);
      }

      const row = firstSync<{ long_goal: number | null }>(
        "SELECT long_goal FROM zero_budgets WHERE month = ? AND category = ?",
        [monthInt, cat.id],
      );
      return row?.long_goal != null ? row.long_goal === 1 : (inferred?.longGoal ?? false);
    },
  });
}

export async function createBudgetCells(
  ss: Spreadsheet,
  month: string,
  categories: Category[],
  groups: CategoryGroup[],
): Promise<void> {
  const sheet = sheetForMonth(month);
  const prevMonth = addMonths(month, -1);
  const prevSheet = sheetForMonth(prevMonth);

  const expenseGroups = groups.filter((g) => !g.is_income);
  const incomeGroup = groups.find((g) => g.is_income);
  const incomeCats = categories.filter((c) => incomeGroup && c.group === incomeGroup.id);

  // ── Buffered (SQL cell) ──
  ss.createDynamic(sheet, envelopeBudget.buffered, {
    dependencies: [],
    run: () => {
      // Batch path during init/ensureMonthRange (see warm-cache.ts).
      const cached = warmBuffered(month);
      if (cached !== undefined) return cached;

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
    const group = groups.find((g) => g.id === cat.group);
    if (!group || group.is_income) continue;
    createCategory(ss, cat, month);
  }

  // ── Per-group: groupSpent for ALL groups (income + expense) ──
  for (const group of groups) {
    const groupCats = categories.filter((c) => c.group === group.id);
    ss.createDynamic(sheet, envelopeBudget.groupSpent(group.id), {
      dependencies: groupCats.map((c) => envelopeBudget.catSpent(c.id)),
      run: (...vals) => safeNumber(vals.reduce((sum: number, v) => sum + num(v), 0)),
    });
  }

  // ── Per-group: groupBudgeted/groupBalance for expense groups only ──
  for (const group of expenseGroups) {
    const groupCats = categories.filter((c) => c.group === group.id);

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
        const g = groups.find((grp) => grp.id === c.group);
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

export { getBudgetRange } from "@/core/server/budget/base";

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

/**
 * The three group aggregates a category feeds, paired with the cell of its own
 * that feeds each. Upstream keeps the same trio inside `handleCategoryChange`.
 */
function groupEdges(groupId: string, catId: string): [string, string][] {
  return [
    [envelopeBudget.groupSpent(groupId), envelopeBudget.catSpent(catId)],
    [envelopeBudget.groupBudgeted(groupId), envelopeBudget.catBudgeted(catId)],
    [envelopeBudget.groupBalance(groupId), envelopeBudget.catBalance(catId)],
  ];
}

function addDeps(ss: Spreadsheet, sheet: string, groupId: string, catId: string): void {
  for (const [aggregate, input] of groupEdges(groupId, catId)) {
    ss.addDependencies(sheet, aggregate, [input]);
  }
}

function removeDeps(ss: Spreadsheet, sheet: string, groupId: string, catId: string): void {
  for (const [aggregate, input] of groupEdges(groupId, catId)) {
    ss.removeDependencies(sheet, aggregate, [input]);
  }
}

/**
 * Keep the sheet in step with a category appearing, disappearing or moving
 * group — incrementally, instead of rebuilding every month.
 *
 * Faithful to upstream's three branches, including its asymmetry: deleting a
 * category only unwires its aggregate edges, it does NOT delete the cells.
 * They linger, disconnected, until the next full build. Envelope has no
 * `hidden` branch — hidden categories stay in their group's totals (only
 * tracking hides them).
 */
export function handleCategoryChange(
  ss: Spreadsheet,
  months: string[],
  oldValue: { cat_group?: unknown; tombstone?: unknown } | undefined,
  newValue: Category & { tombstone?: boolean },
): void {
  const id = newValue.id;
  const wasAlive = oldValue ? oldValue.tombstone === 0 || oldValue.tombstone === false : false;
  const isAlive = !newValue.tombstone;
  const oldGroup = typeof oldValue?.cat_group === "string" ? oldValue.cat_group : null;

  if (oldValue && wasAlive && !isAlive) {
    for (const month of months) {
      removeDeps(ss, sheetForMonth(month), newValue.group, id);
    }
    return;
  }

  if (isAlive && (!oldValue || !wasAlive)) {
    // No blank month like upstream's createBlankCategory: our engine reads a
    // missing cell as 0, so the carryover chain starts on its own.
    for (const month of months) {
      const sheet = sheetForMonth(month);
      const prevSheet = sheetForMonth(addMonths(month, -1));

      createCategory(ss, newValue, month);
      addDeps(ss, sheet, newValue.group, id);

      ss.addDependencies(sheet, envelopeBudget.lastMonthOverspent, [
        `${prevSheet}!${envelopeBudget.catBalance(id)}`,
        `${prevSheet}!${envelopeBudget.catCarryover(id)}`,
      ]);

      if (newValue.is_income) {
        ss.addDependencies(sheet, envelopeBudget.bufferedAuto, [
          envelopeBudget.catSpent(id),
          envelopeBudget.catCarryover(id),
        ]);
      }
    }
    return;
  }

  if (oldGroup && oldGroup !== newValue.group) {
    for (const month of months) {
      const sheet = sheetForMonth(month);
      removeDeps(ss, sheet, oldGroup, id);
      addDeps(ss, sheet, newValue.group, id);
    }
  }
}

/** The month totals a group feeds, paired with the group cell that feeds each. */
function monthEdges(groupId: string): [string, string][] {
  return [
    [envelopeBudget.totalBudgeted, envelopeBudget.groupBudgeted(groupId)],
    [envelopeBudget.totalBalance, envelopeBudget.groupBalance(groupId)],
  ];
}

/**
 * Keep the month totals in step with a group appearing or disappearing.
 * Income groups are excluded, matching the build: their money is income, not
 * budgeted spend.
 */
export function handleCategoryGroupChange(
  ss: Spreadsheet,
  months: string[],
  oldValue: { tombstone?: unknown } | undefined,
  newValue: CategoryGroup & { tombstone?: boolean },
): void {
  if (newValue.is_income) return;

  const wasAlive = oldValue ? oldValue.tombstone === 0 || oldValue.tombstone === false : false;
  const isAlive = !newValue.tombstone;

  if (oldValue && wasAlive && !isAlive) {
    for (const month of months) {
      const sheet = sheetForMonth(month);
      for (const [total, input] of monthEdges(newValue.id)) {
        ss.removeDependencies(sheet, total, [input]);
      }
    }
    return;
  }

  if (isAlive && (!oldValue || !wasAlive)) {
    for (const month of months) {
      const sheet = sheetForMonth(month);
      // The group's own aggregates start empty; categories wire themselves in
      // as they arrive, via handleCategoryChange.
      ss.createDynamic(sheet, envelopeBudget.groupSpent(newValue.id), {
        dependencies: [],
        run: (...vals) => safeNumber(vals.reduce((sum: number, v) => sum + num(v), 0)),
      });
      ss.createDynamic(sheet, envelopeBudget.groupBudgeted(newValue.id), {
        dependencies: [],
        run: (...vals) => safeNumber(vals.reduce((sum: number, v) => sum + num(v), 0)),
      });
      ss.createDynamic(sheet, envelopeBudget.groupBalance(newValue.id), {
        dependencies: [],
        run: (...vals) => safeNumber(vals.reduce((sum: number, v) => sum + num(v), 0)),
      });

      for (const [total, input] of monthEdges(newValue.id)) {
        ss.addDependencies(sheet, total, [input]);
      }
    }
  }
}
