/**
 * Transient batch cache for the spreadsheet's leaf SQL cells.
 *
 * Building budget cells runs, per month × category, ~5 synchronous one-row
 * queries (`firstSync`) on the JS thread — thousands of blocking round-trips
 * for a budget with history. During `initSpreadsheet`/`ensureMonthRange` the
 * same data is prefetched here with a handful of GROUPED async queries and the
 * leaf `run()` closures read from these maps instead. Outside those windows
 * the cache is inactive and every cell falls back to its own `firstSync` —
 * recomputes triggered by sync/mutations behave exactly as before.
 *
 * Correctness contract (guarded by chunkedInit.test.ts / warmCache.test.ts):
 * each accessor must return exactly what the cell's own query would. The
 * grouped spent query reuses the cell's WHERE (`ALIVE_TX_FILTER`, on-budget,
 * date bounds, category_mapping COALESCE) verbatim — only the GROUP BY is new.
 * `undefined` from an accessor means "month not covered, run your own query";
 * a covered month with no row returns the same default the cell would compute.
 */
import { runQuery } from "@/core/db";
import { ALIVE_TX_FILTER } from "@/core/db/filters";
import { monthToInt } from "@/core/shared/months";

type BudgetRow = {
  amount: number | null;
  carryover: number | null;
  goal: number | null;
  long_goal: number | null;
};

let active = false;
let coveredStart = 0; // monthInt, inclusive
let coveredEnd = 0;
let spentByMonthCat = new Map<string, number>();
let zeroBudgetRows = new Map<string, BudgetRow>();
let reflectBudgetRows = new Map<string, BudgetRow>();
let bufferedByMonth = new Map<string, number>();

const key = (monthInt: number, catId: string) => `${monthInt}|${catId}`;

/** Prefetch all leaf-cell data for [startMonth, endMonth] ("YYYY-MM"). */
export async function warmSpreadsheetCache(startMonth: string, endMonth: string): Promise<void> {
  const startInt = monthToInt(startMonth);
  const endInt = monthToInt(endMonth);
  const startDate = startInt * 100 + 1;
  const endDate = endInt * 100 + 31;

  const [spentRows, zeroRows, reflectRows, bufferedRows] = await Promise.all([
    runQuery<{ m: number; cat: string; total: number | null }>(
      `SELECT t.date / 100 AS m, COALESCE(cm.transferId, t.category) AS cat, SUM(t.amount) AS total
       FROM transactions t
       LEFT JOIN category_mapping cm ON cm.id = t.category
       LEFT JOIN accounts a ON a.id = t.acct
       WHERE ${ALIVE_TX_FILTER} AND t.date >= ? AND t.date <= ? AND a.offbudget = 0
       GROUP BY t.date / 100, COALESCE(cm.transferId, t.category)`,
      [startDate, endDate],
    ),
    runQuery<{ month: number; category: string } & BudgetRow>(
      "SELECT month, category, amount, carryover, goal, long_goal FROM zero_budgets WHERE month >= ? AND month <= ?",
      [startInt, endInt],
    ),
    runQuery<{ month: number; category: string } & BudgetRow>(
      "SELECT month, category, amount, carryover, goal, long_goal FROM reflect_budgets WHERE month >= ? AND month <= ?",
      [startInt, endInt],
    ),
    runQuery<{ id: string; buffered: number | null }>(
      "SELECT id, buffered FROM zero_budget_months",
    ),
  ]);

  spentByMonthCat = new Map();
  for (const row of spentRows) {
    if (row.cat != null) spentByMonthCat.set(key(row.m, row.cat), row.total ?? 0);
  }
  zeroBudgetRows = new Map();
  for (const row of zeroRows) zeroBudgetRows.set(key(row.month, row.category), row);
  reflectBudgetRows = new Map();
  for (const row of reflectRows) reflectBudgetRows.set(key(row.month, row.category), row);
  bufferedByMonth = new Map();
  for (const row of bufferedRows) bufferedByMonth.set(row.id, row.buffered ?? 0);

  coveredStart = startInt;
  coveredEnd = endInt;
  active = true;
}

/** Deactivate and release — call in `finally` after the build completes. */
export function clearSpreadsheetWarmCache(): void {
  active = false;
  spentByMonthCat = new Map();
  zeroBudgetRows = new Map();
  reflectBudgetRows = new Map();
  bufferedByMonth = new Map();
}

function covered(monthInt: number): boolean {
  return active && monthInt >= coveredStart && monthInt <= coveredEnd;
}

/** Month total for a category (sum-amount cell), or undefined if not covered. */
export function warmSpent(monthInt: number, catId: string): number | undefined {
  if (!covered(monthInt)) return undefined;
  return spentByMonthCat.get(key(monthInt, catId)) ?? 0;
}

/** zero_budgets row; `null` = covered month with no row; `undefined` = not covered. */
export function warmZeroBudget(monthInt: number, catId: string): BudgetRow | null | undefined {
  if (!covered(monthInt)) return undefined;
  return zeroBudgetRows.get(key(monthInt, catId)) ?? null;
}

/** reflect_budgets row; same contract as {@link warmZeroBudget}. */
export function warmReflectBudget(monthInt: number, catId: string): BudgetRow | null | undefined {
  if (!covered(monthInt)) return undefined;
  return reflectBudgetRows.get(key(monthInt, catId)) ?? null;
}

/** zero_budget_months.buffered for "YYYY-MM", or undefined if not covered. */
export function warmBuffered(month: string): number | undefined {
  if (!covered(monthToInt(month))) return undefined;
  return bufferedByMonth.get(month) ?? 0;
}
