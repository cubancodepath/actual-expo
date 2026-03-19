/**
 * Budget cell name bindings.
 *
 * Ported from Actual Budget's desktop-client/src/spreadsheet/bindings.ts.
 * Defines the naming convention for all budget spreadsheet cells.
 */

/** Sheet name for a given month: "budget2026-03" */
export function sheetForMonth(month: string): string {
  return `budget${month}`;
}

/** Parameterized field generator */
function field(prefix: string) {
  return (id: string) => `${prefix}-${id}`;
}

/**
 * Envelope budget cell names.
 * Each function returns the cell name (without sheet prefix).
 * Use with sheetForMonth: `resolveName(sheetForMonth("2026-03"), envelopeBudget.catBudgeted("catId"))`
 */
export const envelopeBudget = {
  // ---- Summary-level (one per month) ----
  toBudget: "to-budget",
  totalBudgeted: "total-budgeted",
  totalSpent: "total-spent",
  totalBalance: "total-leftover",
  totalIncome: "total-income",
  incomeAvailable: "available-funds",
  fromLastMonth: "from-last-month",
  lastMonthOverspent: "last-month-overspent",
  buffered: "buffered",

  // ---- Group-level (one per group per month) ----
  groupBudgeted: field("group-budget"),
  groupSpent: field("group-sum-amount"),
  groupBalance: field("group-leftover"),

  // ---- Category-level (one per category per month) ----
  catBudgeted: field("budget"),
  catSpent: field("sum-amount"),
  catBalance: field("leftover"),
  catBalancePos: field("leftover-pos"),
  catCarryover: field("carryover"),
  catGoal: field("goal"),
  catLongGoal: field("long-goal"),
};
