import { parseGoalDef } from './parse';
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
  const date = new Date(2000, m - 1, 1);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ---------------------------------------------------------------------------
// Funded helpers
// ---------------------------------------------------------------------------

/** Spending-aware funded messages — shows spending progress or available balance. */
function fundedSegments(cat: BudgetCategory): ProgressSegment[] {
  const absSpent = Math.abs(cat.spent);
  if (absSpent === 0) {
    return [
      { text: 'Budgeted. ' },
      { amount: cat.balance },
      { text: ' available' },
    ];
  }
  return [
    { text: 'Spent ' },
    { amount: absSpent },
    { text: ' of ' },
    { amount: cat.budgeted },
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
        return [{ text: 'Funded' }];
      }
      return [
        { amount: Math.max(cat.balance, 0) },
        { text: ' of ' },
        { amount: cat.goal },
        { text: ' saved' },
      ];

    // #template N — fixed monthly amount, refill, or pure cap
    case 'simple': {
      // Pure spending cap: monthly: 0 + limit → show limit-style text
      if (primary.monthly === 0 && primary.limit) {
        if (absSpent === 0) return [{ text: 'Funded' }];
        if (absSpent === cat.goal!) return [{ text: 'Fully Spent' }];
        if (absSpent > cat.goal!) return [{ text: 'Overspent. Spent ' }, { amount: absSpent }, { text: ' of ' }, { amount: cat.goal! }];
        return [{ text: 'Funded. Spent ' }, { amount: absSpent }, { text: ' of ' }, { amount: cat.goal! }];
      }
      // Refill or fixed monthly: funded/needed
      if (funded) {
        if (absSpent === 0) return [{ text: 'Funded' }];
        if (absSpent === cat.budgeted) return [{ text: 'Fully Spent' }];
        if (absSpent > cat.budgeted) return [{ text: 'Overspent. Spent ' }, { amount: absSpent }, { text: ' of ' }, { amount: cat.budgeted }];
        return [{ text: 'Funded. Spent ' }, { amount: absSpent }, { text: ' of ' }, { amount: cat.budgeted }];
      }
      return [
        { amount: remaining },
        { text: ' more needed this month' },
      ];
    }

    // #template N by YYYY-MM — sinking fund
    case 'by':
      if (funded) {
        return [{ text: 'On track' }];
      }
      return [
        { amount: remaining },
        { text: ' more needed this month' },
      ];

    // #template N by YYYY-MM spend from YYYY-MM
    case 'spend':
      if (funded) {
        return [{ text: 'On track' }];
      }
      return [
        { amount: remaining },
        { text: ' more needed this month' },
      ];

    // Spending limit types
    case 'limit':
    case 'refill': {
      if (absSpent === 0) return [{ text: 'Funded' }];
      if (absSpent === cat.goal!) return [{ text: 'Fully Spent' }];
      if (absSpent > cat.goal!) return [{ text: 'Overspent. Spent ' }, { amount: absSpent }, { text: ' of ' }, { amount: cat.goal! }];
      return [{ text: 'Funded. Spent ' }, { amount: absSpent }, { text: ' of ' }, { amount: cat.goal! }];
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

/**
 * Plain-text version of goal progress for accessibility labels.
 * Formats amounts as dollar values (e.g. "$50.00").
 */
export function getGoalProgressLabel(cat: BudgetCategory): string {
  return getGoalProgress(cat)
    .map(seg =>
      'text' in seg ? seg.text : `$${(Math.abs(seg.amount) / 100).toFixed(2)}`,
    )
    .join('');
}
