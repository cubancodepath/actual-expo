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
import { runQuery } from "../db";
import { monthToInt } from "../lib/date";
import { ALIVE_TX_FILTER } from "../db/filters";
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
  const startDate = monthInt;
  const endDate = monthToInt(getEndOfMonth(month));

  // ── Load budget rows from DB ──
  const budgetRows = await runQuery<{
    category: string;
    amount: number;
    carryover: number;
  }>("SELECT category, amount, carryover FROM zero_budgets WHERE month = ?", [monthInt]);

  const budgetMap = new Map<string, { amount: number; carryover: boolean }>();
  for (const r of budgetRows) {
    budgetMap.set(r.category, { amount: r.amount, carryover: r.carryover === 1 });
  }

  // ── Load spent amounts per category ──
  const spentRows = await runQuery<{ category: string; total: number }>(
    `SELECT COALESCE(cm.transferId, t.category) AS category, SUM(t.amount) AS total
     FROM transactions t
     LEFT JOIN category_mapping cm ON cm.id = t.category
     LEFT JOIN accounts a ON a.id = t.acct
     WHERE ${ALIVE_TX_FILTER} AND t.date >= ? AND t.date <= ? AND a.offbudget = 0
     GROUP BY category`,
    [startDate, endDate],
  );
  const spentMap = new Map<string, number>();
  for (const r of spentRows) {
    if (r.category) spentMap.set(r.category, r.total);
  }

  // ── Load buffered amount ──
  const bufferedRow = await runQuery<{ buffered: number }>(
    "SELECT buffered FROM zero_budget_months WHERE id = ?",
    [monthInt],
  );
  const bufferedAmount = bufferedRow[0]?.buffered ?? 0;

  // ── Load income ──
  const incomeRow = await runQuery<{ total: number }>(
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
  const totalIncome = incomeRow[0]?.total ?? 0;

  // ── Create cells ──
  ss.startTransaction();

  // Buffered
  ss.createStatic(sheet, envelopeBudget.buffered, bufferedAmount);

  // Income
  ss.createStatic(sheet, envelopeBudget.totalIncome, totalIncome);

  // Per-category cells
  const expenseGroups = groups.filter((g) => !g.is_income);

  for (const cat of categories) {
    const group = groups.find((g) => g.id === cat.cat_group);
    if (!group || group.is_income) continue; // skip income categories

    const budget = budgetMap.get(cat.id);
    const budgeted = budget?.amount ?? 0;
    const spent = spentMap.get(cat.id) ?? 0;
    const carryover = budget?.carryover ?? false;

    // Static: user-set budget amount
    ss.createStatic(sheet, envelopeBudget.catBudgeted(cat.id), budgeted);

    // Static: spent amount (from transactions)
    ss.createStatic(sheet, envelopeBudget.catSpent(cat.id), spent);

    // Static: carryover flag
    ss.createStatic(sheet, envelopeBudget.catCarryover(cat.id), carryover);

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
  ss.createDynamic(sheet, envelopeBudget.fromLastMonth, {
    dependencies: [
      `${prevSheet}!${envelopeBudget.toBudget}`,
      `${prevSheet}!${envelopeBudget.buffered}`,
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
      envelopeBudget.buffered,
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
