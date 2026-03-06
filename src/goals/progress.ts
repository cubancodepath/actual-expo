import { parseGoalDef } from './index';
import type { BudgetCategory } from '../budgets/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProgressSegment = { text: string } | { amount: number };

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------

function formatMonth(yyyymm: string): string {
  const [y, m] = yyyymm.split('-').map(Number);
  const date = new Date(y, m - 1);
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function formatDay(yyyymm: string): string {
  const [, m] = yyyymm.split('-').map(Number);
  // "by the 1st" of next month
  const date = new Date(2000, m - 1, 1);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ---------------------------------------------------------------------------
// Funded helpers
// ---------------------------------------------------------------------------

/** Common "Funded" messages when goal is met. */
function fundedSegments(cat: BudgetCategory): ProgressSegment[] {
  const absSpent = Math.abs(cat.spent);
  if (absSpent === 0) {
    return [{ text: 'Funded. Nothing spent yet' }];
  }
  return [
    { text: 'Funded. Spent ' },
    { amount: absSpent },
    { text: ' of ' },
    { amount: cat.goal! },
  ];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * Build structured progress segments for a budget category.
 * Returns an array of text and amount segments that the UI renders
 * using `<Text>` for labels and `<Amount>` for monetary values.
 *
 * Messages follow Actual Budget conventions:
 *
 * Funded:
 *   "Funded. Nothing spent yet"
 *   "Funded. Spent [x] of [y]"
 *   "Fully funded"
 *
 * Needed:
 *   "[x] more needed by [date]"
 *   "[x] more needed this month"
 *   "[x] left to budget"
 */
export function getGoalProgress(cat: BudgetCategory): ProgressSegment[] {
  const templates = parseGoalDef(cat.goalDef);
  const primary = templates[0];
  const absSpent = Math.abs(cat.spent);

  // No goal — just show spent
  if (!primary || cat.goal == null) {
    if (absSpent === 0) {
      return [{ text: 'No spending' }];
    }
    return [
      { text: 'Spent ' },
      { amount: absSpent },
    ];
  }

  // Determine if funded:
  // - longGoal (#goal): balance-based → funded when balance >= goal
  // - templates: budgeted-based → funded when budgeted >= goal
  const funded = cat.longGoal
    ? cat.balance >= cat.goal && cat.goal > 0
    : cat.budgeted >= cat.goal && cat.goal > 0;

  const remaining = cat.longGoal
    ? cat.goal - cat.balance
    : cat.goal - cat.budgeted;

  switch (primary.type) {
    // #goal — balance target (savings goal, no date)
    case 'goal':
      if (funded) {
        return [{ text: 'Fully funded' }];
      }
      return [
        { amount: remaining },
        { text: ' left to budget' },
      ];

    // #template N — fixed monthly amount, refill, or pure cap
    case 'simple': {
      // Pure spending cap: monthly: 0 + limit → show limit-style text
      if (primary.monthly === 0 && primary.limit) {
        if (absSpent === 0) return [{ text: 'Nothing spent of ' }, { amount: cat.goal! }, { text: ' limit' }];
        if (absSpent >= cat.goal!) return [{ text: 'Limit reached. Spent ' }, { amount: absSpent }];
        return [{ text: 'Spent ' }, { amount: absSpent }, { text: ' of ' }, { amount: cat.goal! }, { text: ' limit' }];
      }
      // Refill: no monthly + limit → balance-based (funded/needed)
      if (funded) {
        return fundedSegments(cat);
      }
      return [
        { amount: remaining },
        { text: ' more needed this month' },
      ];
    }

    // #template N by YYYY-MM — sinking fund
    case 'by':
      if (funded) {
        return fundedSegments(cat);
      }
      return [
        { amount: remaining },
        { text: ` more needed by ${formatDay(primary.month)}` },
      ];

    // #template N by YYYY-MM spend from YYYY-MM
    case 'spend':
      if (funded) {
        return fundedSegments(cat);
      }
      return [
        { amount: remaining },
        { text: ` more needed by ${formatMonth(primary.month)}` },
      ];

    // Spending limit types
    case 'limit':
    case 'refill': {
      if (absSpent === 0) return [{ text: 'Nothing spent of ' }, { amount: cat.goal! }, { text: ' limit' }];
      if (absSpent >= cat.goal!) return [{ text: 'Limit reached. Spent ' }, { amount: absSpent }];
      return [{ text: 'Spent ' }, { amount: absSpent }, { text: ' of ' }, { amount: cat.goal! }, { text: ' limit' }];
    }

    // average, copy, periodic, percentage, remainder
    default:
      if (funded) {
        return fundedSegments(cat);
      }
      return [
        { amount: remaining },
        { text: ' more needed this month' },
      ];
  }
}
