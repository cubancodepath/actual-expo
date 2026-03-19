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

import { Spreadsheet, type CellValue } from "./spreadsheet";
import { sheetForMonth, envelopeBudget } from "./bindings";
import { runQuery, first, firstSync } from "../db";
import { monthToInt, currentMonth, intToStr } from "../lib/date";
import { ALIVE_TX_FILTER } from "../db/filters";
import { getCategories, getCategoryGroups } from "../categories";
import type { Category, CategoryGroup } from "../categories/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function num(v: CellValue): number {
  return typeof v === "number" ? v : 0;
}

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
  const prevMonth = getPrevMonth(month);
  const prevSheet = sheetForMonth(prevMonth);
  const monthInt = monthToInt(month);
  const startDate = monthInt * 100 + 1;
  const endDate = monthInt * 100 + 31;

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
  for (const cat of categories) {
    ss.createDynamic(sheet, envelopeBudget.catSpent(cat.id), {
      dependencies: [],
      run: () => {
        const row = firstSync<{ total: number }>(
          `SELECT SUM(t.amount) AS total
           FROM transactions t
           LEFT JOIN category_mapping cm ON cm.id = t.category
           LEFT JOIN accounts a ON a.id = t.acct
           WHERE ${ALIVE_TX_FILTER} AND t.date >= ? AND t.date <= ? AND a.offbudget = 0
             AND COALESCE(cm.transferId, t.category) = ?`,
          [startDate, endDate, cat.id],
        );
        return row?.total ?? 0;
      },
    });
  }

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
        return num(budgetedVal) + num(spentVal) + (prevCo ? num(prevBalance) : num(prevBalancePos));
      },
    });

    ss.createDynamic(sheet, envelopeBudget.catBalancePos(cat.id), {
      dependencies: [envelopeBudget.catBalance(cat.id)],
      run: (balance) => Math.max(0, num(balance)),
    });

    const goalInfo = cat.goal_def ? inferGoalFromDef(cat.goal_def) : null;
    ss.createStatic(sheet, envelopeBudget.catGoal(cat.id), goalInfo?.amount ?? 0);
    ss.createStatic(sheet, envelopeBudget.catLongGoal(cat.id), goalInfo?.longGoal ?? false);
  }

  // ── Per-group: groupSpent for ALL groups (income + expense) ──
  for (const group of groups) {
    const groupCats = categories.filter((c) => c.cat_group === group.id);
    ss.createDynamic(sheet, envelopeBudget.groupSpent(group.id), {
      dependencies: groupCats.map((c) => envelopeBudget.catSpent(c.id)),
      run: (...vals) => vals.reduce((sum: number, v) => sum + num(v), 0),
    });
  }

  // ── Per-group: groupBudgeted/groupBalance for expense groups only ──
  for (const group of expenseGroups) {
    const groupCats = categories.filter((c) => c.cat_group === group.id);

    ss.createDynamic(sheet, envelopeBudget.groupBudgeted(group.id), {
      dependencies: groupCats.map((c) => envelopeBudget.catBudgeted(c.id)),
      run: (...vals) => vals.reduce((sum: number, v) => sum + num(v), 0),
    });

    ss.createDynamic(sheet, envelopeBudget.groupBalance(group.id), {
      dependencies: groupCats.map((c) => envelopeBudget.catBalance(c.id)),
      run: (...vals) => vals.reduce((sum: number, v) => sum + num(v), 0),
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
    run: (...vals) => -vals.reduce((sum: number, v) => sum + num(v), 0),
  });

  ss.createDynamic(sheet, envelopeBudget.totalSpent, {
    dependencies: expenseGroups.map((g) => envelopeBudget.groupSpent(g.id)),
    run: (...vals) => vals.reduce((sum: number, v) => sum + num(v), 0),
  });

  ss.createDynamic(sheet, envelopeBudget.totalBalance, {
    dependencies: expenseGroups.map((g) => envelopeBudget.groupBalance(g.id)),
    run: (...vals) => vals.reduce((sum: number, v) => sum + num(v), 0),
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
      return total;
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
    run: (prevToBudget, prevBuffered) => num(prevToBudget) + num(prevBuffered),
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
      return penalty;
    },
  });

  // ── Final: incomeAvailable + toBudget ──
  ss.createDynamic(sheet, envelopeBudget.incomeAvailable, {
    dependencies: [envelopeBudget.totalIncome, envelopeBudget.fromLastMonth],
    run: (income, fromLast) => num(income) + num(fromLast),
  });

  ss.createDynamic(sheet, envelopeBudget.toBudget, {
    dependencies: [
      envelopeBudget.incomeAvailable,
      envelopeBudget.lastMonthOverspent,
      envelopeBudget.totalBudgeted,
      envelopeBudget.bufferedSelected,
    ],
    run: (available, lastOverspent, totalBudgeted, buffered) =>
      num(available) + num(lastOverspent) + num(totalBudgeted) - num(buffered),
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getPrevMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  if (m === 1) return `${y - 1}-12`;
  return `${y}-${String(m - 1).padStart(2, "0")}`;
}

/** Infer goal amount from goal_def JSON. */
function inferGoalFromDef(goalDef: string | null): { amount: number; longGoal: boolean } | null {
  if (!goalDef) return null;
  try {
    const templates = JSON.parse(goalDef);
    if (!Array.isArray(templates) || templates.length === 0) return null;
    const t = templates[0];
    if (t.type === "simple") {
      return { amount: Math.round((t.monthly ?? 0) * 100), longGoal: false };
    }
    if (t.type === "by" || t.type === "spend") {
      return { amount: Math.round((t.amount ?? 0) * 100), longGoal: t.type === "by" };
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Multi-month loading
// ---------------------------------------------------------------------------

export async function getBudgetRange(): Promise<{ start: string; end: string; months: string[] }> {
  const row = await first<{ d: number | null }>(
    "SELECT MIN(date) as d FROM transactions WHERE tombstone = 0",
  );

  const today = currentMonth();
  let startMonth: string;

  if (row?.d) {
    const dateStr = intToStr(row.d);
    if (dateStr) {
      startMonth = subMonths(dateStr.slice(0, 7), 3);
    } else {
      startMonth = subMonths(today, 3);
    }
  } else {
    startMonth = subMonths(today, 3);
  }

  const endMonth = addMonths(today, 12);

  return {
    start: startMonth,
    end: endMonth,
    months: monthRange(startMonth, endMonth),
  };
}

/**
 * Create budget cells for ALL months in the budget range.
 * Wraps everything in a single transaction so topological sort runs once.
 */
export async function createAllBudgetCells(ss: Spreadsheet): Promise<void> {
  const { months } = await getBudgetRange();
  const [cats, groups] = await Promise.all([getCategories(), getCategoryGroups()]);

  ss.startTransaction();
  for (const month of months) {
    await createBudgetCells(ss, month, cats, groups);
  }
  ss.endTransaction();
}

// ---------------------------------------------------------------------------
// Month math helpers
// ---------------------------------------------------------------------------

function subMonths(month: string, n: number): string {
  let [y, m] = month.split("-").map(Number);
  m -= n;
  while (m <= 0) {
    y--;
    m += 12;
  }
  return `${y}-${String(m).padStart(2, "0")}`;
}

function addMonths(month: string, n: number): string {
  let [y, m] = month.split("-").map(Number);
  m += n;
  while (m > 12) {
    y++;
    m -= 12;
  }
  return `${y}-${String(m).padStart(2, "0")}`;
}

function monthRange(start: string, end: string): string[] {
  const months: string[] = [];
  let current = start;
  while (current <= end) {
    months.push(current);
    current = addMonths(current, 1);
  }
  return months;
}
