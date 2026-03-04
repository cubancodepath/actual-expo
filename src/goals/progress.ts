import { parseGoalDef } from './index';
import type { BudgetCategory } from '../budgets/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProgressSegment = { text: string } | { amount: number };

// ---------------------------------------------------------------------------
// Format helper
// ---------------------------------------------------------------------------

function formatMonth(yyyymm: string): string {
  const [y, m] = yyyymm.split('-').map(Number);
  const date = new Date(y, m - 1);
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * Build structured progress segments for a budget category.
 * Returns an array of text and amount segments that the UI renders
 * using `<Text>` for labels and `<Amount>` for monetary values.
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

  const goalMet = cat.balance >= cat.goal && cat.goal > 0;
  const remaining = cat.goal - cat.balance;

  switch (primary.type) {
    case 'goal':
      if (goalMet) {
        return [
          { text: 'Goal of ' },
          { amount: cat.goal },
          { text: ' reached' },
        ];
      }
      return [
        { amount: remaining },
        { text: ' more to reach ' },
        { amount: cat.goal },
      ];

    case 'simple':
      if (goalMet) {
        return [
          { text: 'Funded ' },
          { amount: cat.budgeted },
          { text: '  ·  Spent ' },
          { amount: absSpent },
        ];
      }
      if (absSpent > cat.budgeted && cat.budgeted > 0) {
        return [
          { amount: absSpent - cat.budgeted },
          { text: ' overspent of ' },
          { amount: cat.budgeted },
        ];
      }
      return [
        { text: 'Spent ' },
        { amount: absSpent },
        { text: ' of ' },
        { amount: cat.budgeted },
      ];

    case 'by':
      if (goalMet) {
        return [
          { text: 'Funded ' },
          { amount: cat.goal },
        ];
      }
      return [
        { amount: remaining },
        { text: ` needed by ${formatMonth(primary.month)}` },
      ];

    case 'spend':
      return [
        { text: 'Spent ' },
        { amount: absSpent },
        { text: ' of ' },
        { amount: cat.goal },
        { text: ` through ${formatMonth(primary.month)}` },
      ];

    default:
      // average, copy, periodic, percentage, remainder, refill, limit
      if (goalMet) {
        return [
          { text: 'Funded ' },
          { amount: cat.goal },
        ];
      }
      return [
        { text: 'Spent ' },
        { amount: absSpent },
        { text: ' of ' },
        { amount: cat.goal },
        { text: ' budgeted' },
      ];
  }
}
