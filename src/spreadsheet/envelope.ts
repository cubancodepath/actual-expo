/**
 * Budget formula definitions for the envelope budgeting system.
 *
 * Ported from Actual Budget's server/budget/envelope.ts.
 * Defines how each budget cell is computed from its dependencies.
 *
 * Call `createBudgetCells(sheet, month, categories, groups)` to set up
 * all cells for a month. The spreadsheet engine handles recomputation.
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
// Load budget data from DB into spreadsheet cells
// ---------------------------------------------------------------------------

/**
 * Create all budget cells for a given month and populate with DB data.
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

  // All budget data cells are now dynamic (sync SQL queries on recompute).
  // No pre-loading needed — cells re-query via triggerBudgetChanges.

  // ── Create cells ──
  ss.startTransaction();

  // Buffered (dynamic — sync SQL)
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

  // Income (dynamic — runs sync SQL on recompute)
  ss.createDynamic(sheet, envelopeBudget.totalIncome, {
    dependencies: [],
    run: () => {
      const row = firstSync<{ total: number }>(
        `SELECT SUM(t.amount) AS total
         FROM transactions t
         LEFT JOIN category_mapping cm ON cm.id = t.category
         LEFT JOIN categories c ON COALESCE(cm.transferId, t.category) = c.id
         LEFT JOIN category_groups g ON g.id = c.cat_group
         LEFT JOIN accounts a ON a.id = t.acct
         WHERE ${ALIVE_TX_FILTER} AND t.date >= ? AND t.date <= ?
           AND a.offbudget = 0 AND g.is_income = 1`,
        [startDate, endDate],
      );
      return row?.total ?? 0;
    },
  });

  // Per-category cells
  const expenseGroups = groups.filter((g) => !g.is_income);
  const incomeGroup = groups.find((g) => g.is_income);
  const incomeCats = categories.filter((c) => incomeGroup && c.cat_group === incomeGroup.id);

  for (const cat of categories) {
    const group = groups.find((g) => g.id === cat.cat_group);
    if (!group || group.is_income) continue; // skip income categories

    // Dynamic: budget amount (sync SQL — recomputes on triggerBudgetChanges)
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

    // Dynamic: spent amount (sync SQL — recomputes on triggerBudgetChanges)
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

    // Dynamic: carryover flag (sync SQL)
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

    // Dynamic: balance (leftover) = budgeted + spent + carryIn
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

    // Dynamic: positive balance (for non-carryover rollover)
    ss.createDynamic(sheet, envelopeBudget.catBalancePos(cat.id), {
      dependencies: [envelopeBudget.catBalance(cat.id)],
      run: (balance) => Math.max(0, num(balance)),
    });

    // Goal (static for now)
    const goalInfo = cat.goal_def ? inferGoalFromDef(cat.goal_def) : null;
    ss.createStatic(sheet, envelopeBudget.catGoal(cat.id), goalInfo?.amount ?? 0);
    ss.createStatic(sheet, envelopeBudget.catLongGoal(cat.id), goalInfo?.longGoal ?? false);
  }

  // Per-group cells
  for (const group of expenseGroups) {
    const groupCats = categories.filter((c) => c.cat_group === group.id);

    ss.createDynamic(sheet, envelopeBudget.groupBudgeted(group.id), {
      dependencies: groupCats.map((c) => envelopeBudget.catBudgeted(c.id)),
      run: (...vals) => vals.reduce((sum: number, v) => sum + num(v), 0),
    });

    ss.createDynamic(sheet, envelopeBudget.groupSpent(group.id), {
      dependencies: groupCats.map((c) => envelopeBudget.catSpent(c.id)),
      run: (...vals) => vals.reduce((sum: number, v) => sum + num(v), 0),
    });

    ss.createDynamic(sheet, envelopeBudget.groupBalance(group.id), {
      dependencies: groupCats.map((c) => envelopeBudget.catBalance(c.id)),
      run: (...vals) => vals.reduce((sum: number, v) => sum + num(v), 0),
    });
  }

  // Summary cells
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

  // from-last-month: previous month's to-budget + previous month's buffered
  // buffered-auto: sum of income amounts with carryover flag
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

  // buffered-selected: manual if set, else auto
  ss.createDynamic(sheet, envelopeBudget.bufferedSelected, {
    dependencies: [envelopeBudget.buffered, envelopeBudget.bufferedAuto],
    run: (manual, auto) => (num(manual) !== 0 ? num(manual) : num(auto)),
  });

  ss.createDynamic(sheet, envelopeBudget.fromLastMonth, {
    dependencies: [
      `${prevSheet}!${envelopeBudget.toBudget}`,
      `${prevSheet}!${envelopeBudget.bufferedSelected}`,
    ],
    run: (prevToBudget, prevBuffered) => num(prevToBudget) + num(prevBuffered),
  });

  // last-month-overspent: sum of negative balances from prev month for cats WITHOUT carryover
  ss.createDynamic(sheet, envelopeBudget.lastMonthOverspent, {
    dependencies: categories
      .filter((c) => {
        const g = groups.find((g) => g.id === c.cat_group);
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
        const carryover = vals[i + 1] === true || vals[i + 1] === 1;
        if (balance < 0 && !carryover) {
          penalty += balance;
        }
      }
      return penalty;
    },
  });

  // available-funds: total income + from-last-month
  ss.createDynamic(sheet, envelopeBudget.incomeAvailable, {
    dependencies: [envelopeBudget.totalIncome, envelopeBudget.fromLastMonth],
    run: (income, fromLast) => num(income) + num(fromLast),
  });

  // to-budget: available-funds + last-month-overspent + total-budgeted - buffered
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

  ss.endTransaction();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getPrevMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  if (m === 1) return `${y - 1}-12`;
  return `${y}-${String(m - 1).padStart(2, "0")}`;
}

function getEndOfMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return `${month}-${String(lastDay).padStart(2, "0")}`;
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
// Multi-month loading (like Actual's createAllBudgets)
// ---------------------------------------------------------------------------

/**
 * Calculate the range of months that need budget cells.
 * From (earliest transaction - 3 months) to (current month + 12 months).
 */
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
 * This builds the full chain of dependencies so toBudget computes correctly.
 */
export async function createAllBudgetCells(ss: Spreadsheet): Promise<void> {
  const { months } = await getBudgetRange();
  const [cats, groups] = await Promise.all([getCategories(), getCategoryGroups()]);

  // Create cells for all months in a single transaction
  // so the topological sort runs once at the end
  ss.startTransaction();
  for (const month of months) {
    await createBudgetCellsInTransaction(ss, month, cats, groups);
  }
  ss.endTransaction();
}

/**
 * Like createBudgetCells but without its own transaction (caller manages it).
 */
async function createBudgetCellsInTransaction(
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

  // Buffered (dynamic — sync SQL)
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

  // Income (dynamic — runs sync SQL on recompute)
  ss.createDynamic(sheet, envelopeBudget.totalIncome, {
    dependencies: [],
    run: () => {
      const row = firstSync<{ total: number }>(
        `SELECT SUM(t.amount) AS total
         FROM transactions t
         LEFT JOIN category_mapping cm ON cm.id = t.category
         LEFT JOIN categories c ON COALESCE(cm.transferId, t.category) = c.id
         LEFT JOIN category_groups g ON g.id = c.cat_group
         LEFT JOIN accounts a ON a.id = t.acct
         WHERE ${ALIVE_TX_FILTER} AND t.date >= ? AND t.date <= ?
           AND a.offbudget = 0 AND g.is_income = 1`,
        [startDate, endDate],
      );
      return row?.total ?? 0;
    },
  });

  const expenseGroups = groups.filter((g) => !g.is_income);
  const incomeGroup = groups.find((g) => g.is_income);
  const incomeCats = categories.filter((c) => incomeGroup && c.cat_group === incomeGroup.id);

  // ── Per-category cells ──
  // Step 1: Create sum-amount (spent) for ALL categories (income + expense) — dynamic with sync SQL
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

  // Step 2: Create budget/carryover/balance cells ONLY for expense categories
  for (const cat of categories) {
    const group = groups.find((g) => g.id === cat.cat_group);
    if (!group || group.is_income) continue;

    // Dynamic: budget amount (sync SQL)
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

    // Dynamic: carryover flag (sync SQL)
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

  // ── Per-group cells ──
  // Step 3: Create group-sum-amount for ALL groups (income + expense)
  for (const group of groups) {
    const groupCats = categories.filter((c) => c.cat_group === group.id);
    ss.createDynamic(sheet, envelopeBudget.groupSpent(group.id), {
      dependencies: groupCats.map((c) => envelopeBudget.catSpent(c.id)),
      run: (...vals) => vals.reduce((sum: number, v) => sum + num(v), 0),
    });
  }

  // Step 4: Create group-budget and group-balance ONLY for expense groups
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

  // Step 5: total-income = alias of income group's sum-amount
  if (incomeGroup) {
    ss.createDynamic(sheet, envelopeBudget.totalIncome, {
      dependencies: [envelopeBudget.groupSpent(incomeGroup.id)],
      run: (amount) => num(amount),
    });
  } else {
    ss.createStatic(sheet, envelopeBudget.totalIncome, 0);
  }

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

  // buffered-auto: sum of income amounts with carryover flag
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

  // buffered-selected: manual if set, else auto
  ss.createDynamic(sheet, envelopeBudget.bufferedSelected, {
    dependencies: [envelopeBudget.buffered, envelopeBudget.bufferedAuto],
    run: (manual, auto) => (num(manual) !== 0 ? num(manual) : num(auto)),
  });

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
