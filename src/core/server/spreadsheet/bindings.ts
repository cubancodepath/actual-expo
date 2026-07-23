/**
 * Budget cell name bindings.
 *
 * Ported from Actual Budget's desktop-client/src/spreadsheet/bindings.ts.
 * Defines the naming convention for all budget spreadsheet cells.
 *
 * Divergence: upstream keeps this file app-side (desktop-client). It lives in
 * core here because the port's cell creation (server/budget/envelope.ts,
 * tracking.ts) names cells through it — core must not import app modules.
 */

export { sheetForMonth } from "@/core/shared/months";

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
  bufferedAuto: "buffered-auto",
  bufferedSelected: "buffered-selected",

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

/**
 * Tracking/report budget cell names.
 * Ported from Actual Budget's desktop-client/src/spreadsheet/bindings.ts
 * (report-budget variant). Per-category/per-group names reuse the exact
 * same naming convention as envelope (same underlying prefixes, e.g.
 * "budget-<id>", "sum-amount-<id>"), so those are aliased rather than
 * redefined. Tracking mode has no to-budget/buffered/from-last-month
 * concept at all — those cells simply don't exist on a tracking sheet.
 */
export const trackingBudget = {
  // ---- Summary-level (one per month) ----
  totalBudgeted: envelopeBudget.totalBudgeted, // NOT negated in tracking mode (see tracking.ts)
  totalSpent: envelopeBudget.totalSpent,
  totalIncome: envelopeBudget.totalIncome,
  totalLeftover: envelopeBudget.totalBalance, // same cell name: "total-leftover"
  totalBudgetIncome: "total-budget-income",
  totalSaved: "total-saved",
  realSaved: "real-saved",

  // ---- Group-level (one per group per month) ----
  groupBudgeted: envelopeBudget.groupBudgeted,
  groupSpent: envelopeBudget.groupSpent,
  groupBalance: envelopeBudget.groupBalance,

  // ---- Category-level (one per category per month) ----
  catBudgeted: envelopeBudget.catBudgeted,
  catSpent: envelopeBudget.catSpent,
  catBalance: envelopeBudget.catBalance,
  catCarryover: envelopeBudget.catCarryover,
  spentWithCarryover: field("spent-with-carryover"),
};
