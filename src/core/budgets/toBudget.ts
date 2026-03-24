/**
 * Shared "To Budget" calculation — used by both computeToBudget() and getBudgetMonth().
 *
 * toBudget = cumulativeIncome - cumulativeBudgeted - bufferedSelected + overspendingPenalty
 */

import { runQuery, first } from "../db";
import type { ZeroBudgetRow, CategoryGroupRow, CategoryRow } from "../db/types";
import { ALIVE_TX_FILTER } from "../db/filters";
import { computeCarryoverChain } from "./index";

export type ToBudgetInputs = {
  month: string;
  monthInt: number;
  /** Pre-loaded groups (avoids re-query when called from getBudgetMonth) */
  groups?: CategoryGroupRow[];
  /** Pre-loaded categories (avoids re-query when called from getBudgetMonth) */
  categories?: CategoryRow[];
  /** Pre-loaded current month's budget rows */
  budgetRows?: ZeroBudgetRow[];
  /** Pre-loaded current month's spending map (categoryId → amount) */
  currentSpendingMap?: Map<string, number>;
};

export type ToBudgetResult = {
  toBudget: number;
  buffered: number;
  cumulativeIncome: number;
  cumulativeBudgeted: number;
  overspendingPenalty: number;
};

export async function computeToBudgetFull(inputs: ToBudgetInputs): Promise<ToBudgetResult> {
  const { month, monthInt } = inputs;
  const endDate = monthInt * 100 + 31;

  // Load groups/categories if not provided
  const groups =
    inputs.groups ??
    (await runQuery<CategoryGroupRow>("SELECT * FROM category_groups WHERE tombstone = 0"));
  const categories =
    inputs.categories ??
    (await runQuery<CategoryRow>("SELECT * FROM categories WHERE tombstone = 0"));

  const groupMap = new Map(groups.map((g) => [g.id, g]));

  // Expense category IDs
  const expenseCatIds = categories
    .filter((c) => {
      const g = groupMap.get(c.cat_group);
      return g && g.is_income === 0;
    })
    .map((c) => c.id);

  // Cumulative income through end of month
  const cumulativeIncomeRow = await first<{ total: number }>(
    `SELECT COALESCE(SUM(t.amount), 0) AS total
     FROM transactions t
     LEFT JOIN category_mapping cm ON cm.id = t.category
     JOIN categories c  ON c.id = COALESCE(cm.transferId, t.category) AND c.tombstone = 0
     JOIN accounts a    ON a.id = t.acct AND a.offbudget = 0
     JOIN category_groups g ON g.id = c.cat_group AND g.is_income = 1
     WHERE ${ALIVE_TX_FILTER}
       AND t.date <= ?`,
    [endDate],
  );

  // Cumulative budgeted through current month
  const cumulativeBudgetedRow = await first<{ total: number }>(
    `SELECT COALESCE(SUM(zb.amount), 0) AS total
     FROM zero_budgets zb
     JOIN categories c ON c.id = zb.category AND c.tombstone = 0
     JOIN category_groups g ON g.id = c.cat_group AND g.is_income = 0
     WHERE zb.month <= ?`,
    [monthInt],
  );

  // Overspending penalty from carryover chain
  const { overspendingPenalty } = await computeCarryoverChain(monthInt, expenseCatIds);

  // Buffered: manual hold or auto (income cats with carryover)
  const bufferedRow = await first<{ buffered: number }>(
    "SELECT buffered FROM zero_budget_months WHERE id = ?",
    [month],
  );
  const manualBuffered = bufferedRow?.buffered ?? 0;

  let bufferedAuto = 0;
  if (manualBuffered === 0) {
    // Load budget rows + spending map if not provided
    const budgetRows =
      inputs.budgetRows ??
      (await runQuery<ZeroBudgetRow>("SELECT * FROM zero_budgets WHERE month = ?", [monthInt]));
    const carryoverMap = new Map(budgetRows.map((r) => [r.category, r.carryover === 1]));

    let currentMap: Map<string, number>;
    if (inputs.currentSpendingMap) {
      currentMap = inputs.currentSpendingMap;
    } else {
      const startDate = monthInt * 100 + 1;
      const currentMonthRows = await runQuery<{ category: string; amount: number }>(
        `SELECT COALESCE(cm.transferId, t.category) AS category, SUM(t.amount) AS amount
         FROM transactions t
         LEFT JOIN category_mapping cm ON cm.id = t.category
         JOIN accounts a ON t.acct = a.id AND a.offbudget = 0
         WHERE ${ALIVE_TX_FILTER}
           AND t.date >= ? AND t.date <= ?
           AND t.category IS NOT NULL
         GROUP BY COALESCE(cm.transferId, t.category)`,
        [startDate, endDate],
      );
      currentMap = new Map(currentMonthRows.map((r) => [r.category, r.amount]));
    }

    const incomeCatIds = categories
      .filter((c) => {
        const g = groupMap.get(c.cat_group);
        return g && g.is_income === 1;
      })
      .map((c) => c.id);

    for (const catId of incomeCatIds) {
      const coFlag = carryoverMap.get(catId) ?? false;
      if (coFlag) {
        bufferedAuto += currentMap.get(catId) ?? 0;
      }
    }
  }

  const buffered = manualBuffered !== 0 ? manualBuffered : bufferedAuto;
  const cumulativeIncome = cumulativeIncomeRow?.total ?? 0;
  const cumulativeBudgeted = cumulativeBudgetedRow?.total ?? 0;
  const toBudget = cumulativeIncome - cumulativeBudgeted - buffered + overspendingPenalty;

  return { toBudget, buffered, cumulativeIncome, cumulativeBudgeted, overspendingPenalty };
}
