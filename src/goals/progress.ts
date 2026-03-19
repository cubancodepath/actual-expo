import { parseGoalDef } from "./parse";
import { isGoalFunded } from "./progressBar";
import type { BudgetCategory } from "../budgets/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProgressSegment = { key: string } | { amount: number };

// ---------------------------------------------------------------------------
// Funded helpers
// ---------------------------------------------------------------------------

/** Spending-aware funded messages — shows spending progress or available balance. */
function fundedSegments(cat: BudgetCategory): ProgressSegment[] {
  const absSpent = Math.abs(cat.spent);
  if (absSpent === 0) {
    return [
      { key: "budget:progress.budgeted" },
      { amount: cat.balance },
      { key: "budget:progress.available" },
    ];
  }
  return [
    { key: "budget:progress.spent" },
    { amount: absSpent },
    { key: "budget:progress.of" },
    { amount: cat.budgeted },
  ];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * Build structured progress segments for a budget category.
 * Returns an array of translation keys and amount segments that the UI renders
 * using `t(seg.key)` for labels and `<Amount>` for monetary values.
 *
 * Messages complement the spending progress bar:
 *
 * No goal:
 *   "No spending"
 *   "Spent [x]"
 *
 * Savings goals (#goal):
 *   "Fully funded"
 *   "[balance] of [goal] saved"
 *
 * Monthly goals (funded):
 *   "Budgeted. [available] available"
 *   "Spent [x] of [budgeted]"
 *
 * Monthly goals (underfunded):
 *   "[x] more needed this month"
 *   "[x] more needed by [date]"
 *
 * Limit goals:
 *   "Spent [x] of [y] limit"
 *   "Limit reached. Spent [x]"
 */
export function getGoalProgress(cat: BudgetCategory): ProgressSegment[] {
  const templates = parseGoalDef(cat.goalDef);
  const primary = templates[0];
  const absSpent = Math.abs(cat.spent);

  // No goal — just show spent
  if (!primary || cat.goal == null) {
    if (absSpent === 0) {
      return [{ key: "budget:progress.noSpending" }];
    }
    return [{ key: "budget:progress.spent" }, { amount: absSpent }];
  }

  const funded = isGoalFunded(cat);

  const remaining = cat.longGoal ? cat.goal - cat.balance : cat.goal - cat.budgeted;

  switch (primary.type) {
    // #goal — balance target (savings goal, no date)
    case "goal":
      if (funded) {
        return [{ key: "budget:progress.funded" }];
      }
      return [
        { amount: Math.max(cat.balance, 0) },
        { key: "budget:progress.of" },
        { amount: cat.goal },
        { key: "budget:progress.saved" },
      ];

    // #template N — fixed monthly amount, refill, or pure cap
    case "simple": {
      // Pure spending cap: monthly: 0 + limit → show limit-style text
      if (primary.monthly === 0 && primary.limit) {
        if (absSpent === 0) return [{ key: "budget:progress.funded" }];
        if (absSpent === cat.goal!) return [{ key: "budget:progress.fullySpent" }];
        if (absSpent > cat.goal!)
          return [
            { key: "budget:progress.overspent" },
            { amount: absSpent },
            { key: "budget:progress.of" },
            { amount: cat.goal! },
          ];
        return [
          { key: "budget:progress.fundedSpent" },
          { amount: absSpent },
          { key: "budget:progress.of" },
          { amount: cat.goal! },
        ];
      }
      // Refill or fixed monthly: funded/needed
      if (funded) {
        if (absSpent === 0) return [{ key: "budget:progress.funded" }];
        if (absSpent === cat.budgeted) return [{ key: "budget:progress.fullySpent" }];
        if (absSpent > cat.budgeted)
          return [
            { key: "budget:progress.overspent" },
            { amount: absSpent },
            { key: "budget:progress.of" },
            { amount: cat.budgeted },
          ];
        return [
          { key: "budget:progress.fundedSpent" },
          { amount: absSpent },
          { key: "budget:progress.of" },
          { amount: cat.budgeted },
        ];
      }
      return [{ amount: remaining }, { key: "budget:progress.moreNeededThisMonth" }];
    }

    // #template N by YYYY-MM — sinking fund
    case "by":
      if (funded) {
        return [{ key: "budget:progress.onTrack" }];
      }
      return [{ amount: remaining }, { key: "budget:progress.moreNeededThisMonth" }];

    // #template N by YYYY-MM spend from YYYY-MM
    case "spend":
      if (funded) {
        return [{ key: "budget:progress.onTrack" }];
      }
      return [{ amount: remaining }, { key: "budget:progress.moreNeededThisMonth" }];

    // Spending limit types
    case "limit":
    case "refill": {
      if (absSpent === 0) return [{ key: "budget:progress.funded" }];
      if (absSpent === cat.goal!) return [{ key: "budget:progress.fullySpent" }];
      if (absSpent > cat.goal!)
        return [
          { key: "budget:progress.overspent" },
          { amount: absSpent },
          { key: "budget:progress.of" },
          { amount: cat.goal! },
        ];
      return [
        { key: "budget:progress.fundedSpent" },
        { amount: absSpent },
        { key: "budget:progress.of" },
        { amount: cat.goal! },
      ];
    }

    // average, copy, periodic, percentage, remainder
    default:
      if (funded) {
        return fundedSegments(cat);
      }
      return [{ amount: remaining }, { key: "budget:progress.moreNeededThisMonth" }];
  }
}

/**
 * Plain-text version of goal progress for accessibility labels.
 * Formats amounts as dollar values (e.g. "$50.00").
 * Requires a translation function to resolve keys.
 */
export function getGoalProgressLabel(cat: BudgetCategory, t: (key: string) => string): string {
  return getGoalProgress(cat)
    .map((seg) => ("key" in seg ? t(seg.key) : `$${(Math.abs(seg.amount) / 100).toFixed(2)}`))
    .join("");
}
