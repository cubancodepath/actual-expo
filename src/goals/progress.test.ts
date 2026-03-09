import { describe, it, expect } from 'vitest';
import { getGoalProgress, getGoalProgressLabel, type ProgressSegment } from './progress';
import type { BudgetCategory } from '../budgets/types';
import type { Template } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCat(overrides: Partial<BudgetCategory> & { goalDef?: string | null }): BudgetCategory {
  return {
    id: 'cat-1',
    name: 'Test',
    budgeted: 0,
    spent: 0,
    balance: 0,
    carryIn: 0,
    carryover: false,
    goal: null,
    longGoal: false,
    goalDef: null,
    hidden: false,
    ...overrides,
  };
}

function toGoalDef(templates: Template[]): string {
  return JSON.stringify(templates);
}

function expectSegments(actual: ProgressSegment[], expected: ProgressSegment[]) {
  expect(actual).toEqual(expected);
}

// ---------------------------------------------------------------------------
// No goal
// ---------------------------------------------------------------------------

describe('getGoalProgress — no goal', () => {
  it('no spending', () => {
    expectSegments(getGoalProgress(makeCat({})), [{ text: 'No spending' }]);
  });

  it('has spending', () => {
    expectSegments(
      getGoalProgress(makeCat({ spent: -5000 })),
      [{ text: 'Spent ' }, { amount: 5000 }],
    );
  });
});

// ---------------------------------------------------------------------------
// #goal (balance target)
// ---------------------------------------------------------------------------

describe('getGoalProgress — #goal (balance target)', () => {
  const goalDef = toGoalDef([{ type: 'goal', amount: 5000, directive: 'goal' }]);

  it('fully funded', () => {
    expectSegments(
      getGoalProgress(makeCat({ goal: 500000, longGoal: true, balance: 500000, goalDef })),
      [{ text: 'Funded' }],
    );
  });

  it('overfunded', () => {
    expectSegments(
      getGoalProgress(makeCat({ goal: 500000, longGoal: true, balance: 600000, goalDef })),
      [{ text: 'Funded' }],
    );
  });

  it('partially funded', () => {
    expectSegments(
      getGoalProgress(makeCat({ goal: 500000, longGoal: true, balance: 100000, goalDef })),
      [{ amount: 100000 }, { text: ' of ' }, { amount: 500000 }, { text: ' saved' }],
    );
  });

  it('zero balance', () => {
    expectSegments(
      getGoalProgress(makeCat({ goal: 500000, longGoal: true, balance: 0, goalDef })),
      [{ amount: 0 }, { text: ' of ' }, { amount: 500000 }, { text: ' saved' }],
    );
  });

  it('negative balance shows zero', () => {
    expectSegments(
      getGoalProgress(makeCat({ goal: 500000, longGoal: true, balance: -5000, goalDef })),
      [{ amount: 0 }, { text: ' of ' }, { amount: 500000 }, { text: ' saved' }],
    );
  });
});

// ---------------------------------------------------------------------------
// simple monthly
// ---------------------------------------------------------------------------

describe('getGoalProgress — simple monthly', () => {
  const goalDef = toGoalDef([{ type: 'simple', monthly: 200, priority: 0, directive: 'template' }]);

  it('fully funded, no spending', () => {
    expectSegments(
      getGoalProgress(makeCat({ goal: 20000, budgeted: 20000, balance: 20000, goalDef })),
      [{ text: 'Funded' }],
    );
  });

  it('fully funded, some spending', () => {
    expectSegments(
      getGoalProgress(makeCat({ goal: 20000, budgeted: 20000, spent: -5000, balance: 15000, goalDef })),
      [{ text: 'Funded. Spent ' }, { amount: 5000 }, { text: ' of ' }, { amount: 20000 }],
    );
  });

  it('fully funded, all spent (fully spent)', () => {
    expectSegments(
      getGoalProgress(makeCat({ goal: 20000, budgeted: 20000, spent: -20000, balance: 0, goalDef })),
      [{ text: 'Fully Spent' }],
    );
  });

  it('fully funded, overspent', () => {
    expectSegments(
      getGoalProgress(makeCat({ goal: 20000, budgeted: 20000, spent: -25000, balance: -5000, goalDef })),
      [{ text: 'Overspent. Spent ' }, { amount: 25000 }, { text: ' of ' }, { amount: 20000 }],
    );
  });

  it('underfunded', () => {
    expectSegments(
      getGoalProgress(makeCat({ goal: 20000, budgeted: 10000, balance: 10000, goalDef })),
      [{ amount: 10000 }, { text: ' more needed this month' }],
    );
  });

  it('not budgeted at all', () => {
    expectSegments(
      getGoalProgress(makeCat({ goal: 20000, budgeted: 0, balance: 0, goalDef })),
      [{ amount: 20000 }, { text: ' more needed this month' }],
    );
  });
});

// ---------------------------------------------------------------------------
// simple pure spending cap (monthly: 0 + limit)
// ---------------------------------------------------------------------------

describe('getGoalProgress — simple spending cap', () => {
  const goalDef = toGoalDef([{
    type: 'simple', monthly: 0, limit: { amount: 300, hold: false, period: 'monthly' as const },
    priority: 0, directive: 'template',
  }]);

  it('nothing spent', () => {
    expectSegments(
      getGoalProgress(makeCat({ goal: 30000, budgeted: 0, spent: 0, goalDef })),
      [{ text: 'Funded' }],
    );
  });

  it('some spent, under limit', () => {
    expectSegments(
      getGoalProgress(makeCat({ goal: 30000, budgeted: 0, spent: -10000, goalDef })),
      [{ text: 'Funded. Spent ' }, { amount: 10000 }, { text: ' of ' }, { amount: 30000 }],
    );
  });

  it('limit reached', () => {
    expectSegments(
      getGoalProgress(makeCat({ goal: 30000, budgeted: 0, spent: -30000, goalDef })),
      [{ text: 'Fully Spent' }],
    );
  });

  it('over limit', () => {
    expectSegments(
      getGoalProgress(makeCat({ goal: 30000, budgeted: 0, spent: -40000, goalDef })),
      [{ text: 'Overspent. Spent ' }, { amount: 40000 }, { text: ' of ' }, { amount: 30000 }],
    );
  });
});

// ---------------------------------------------------------------------------
// by (sinking fund)
// ---------------------------------------------------------------------------

describe('getGoalProgress — by (sinking fund)', () => {
  const goalDef = toGoalDef([{
    type: 'by', amount: 1200, month: '2026-12', priority: 0, directive: 'template',
  }]);

  it('on track', () => {
    expectSegments(
      getGoalProgress(makeCat({ goal: 12000, budgeted: 12000, balance: 12000, goalDef })),
      [{ text: 'On track' }],
    );
  });

  it('underfunded', () => {
    expectSegments(
      getGoalProgress(makeCat({ goal: 12000, budgeted: 5000, balance: 5000, goalDef })),
      [{ amount: 7000 }, { text: ' more needed this month' }],
    );
  });
});

// ---------------------------------------------------------------------------
// spend
// ---------------------------------------------------------------------------

describe('getGoalProgress — spend', () => {
  const goalDef = toGoalDef([{
    type: 'spend', amount: 600, month: '2026-06', from: '2026-01', priority: 0, directive: 'template',
  }]);

  it('on track', () => {
    expectSegments(
      getGoalProgress(makeCat({ goal: 10000, budgeted: 10000, balance: 10000, goalDef })),
      [{ text: 'On track' }],
    );
  });

  it('underfunded', () => {
    expectSegments(
      getGoalProgress(makeCat({ goal: 10000, budgeted: 3000, balance: 3000, goalDef })),
      [{ amount: 7000 }, { text: ' more needed this month' }],
    );
  });
});

// ---------------------------------------------------------------------------
// limit / refill
// ---------------------------------------------------------------------------

describe('getGoalProgress — limit', () => {
  const goalDef = toGoalDef([{
    type: 'limit', amount: 400, hold: false, period: 'monthly' as const, directive: 'template',
  }]);

  it('nothing spent', () => {
    expectSegments(
      getGoalProgress(makeCat({ goal: 40000, spent: 0, goalDef })),
      [{ text: 'Funded' }],
    );
  });

  it('under limit', () => {
    expectSegments(
      getGoalProgress(makeCat({ goal: 40000, spent: -15000, goalDef })),
      [{ text: 'Funded. Spent ' }, { amount: 15000 }, { text: ' of ' }, { amount: 40000 }],
    );
  });

  it('at limit', () => {
    expectSegments(
      getGoalProgress(makeCat({ goal: 40000, spent: -40000, goalDef })),
      [{ text: 'Fully Spent' }],
    );
  });

  it('over limit', () => {
    expectSegments(
      getGoalProgress(makeCat({ goal: 40000, spent: -50000, goalDef })),
      [{ text: 'Overspent. Spent ' }, { amount: 50000 }, { text: ' of ' }, { amount: 40000 }],
    );
  });
});

describe('getGoalProgress — refill', () => {
  const goalDef = toGoalDef([{ type: 'refill', priority: 0, directive: 'template' }]);

  it('nothing spent', () => {
    expectSegments(
      getGoalProgress(makeCat({ goal: 50000, spent: 0, goalDef })),
      [{ text: 'Funded' }],
    );
  });
});

// ---------------------------------------------------------------------------
// default cases (average, copy, periodic, percentage, remainder)
// ---------------------------------------------------------------------------

describe('getGoalProgress — default (average/copy/periodic/percentage)', () => {
  const goalDef = toGoalDef([{
    type: 'average', numMonths: 3, priority: 0, directive: 'template',
  }]);

  it('funded, no spending', () => {
    expectSegments(
      getGoalProgress(makeCat({ goal: 15000, budgeted: 15000, balance: 15000, goalDef })),
      [{ text: 'Budgeted. ' }, { amount: 15000 }, { text: ' available' }],
    );
  });

  it('funded, with spending', () => {
    expectSegments(
      getGoalProgress(makeCat({ goal: 15000, budgeted: 15000, spent: -3000, balance: 12000, goalDef })),
      [{ text: 'Spent ' }, { amount: 3000 }, { text: ' of ' }, { amount: 15000 }],
    );
  });

  it('underfunded', () => {
    expectSegments(
      getGoalProgress(makeCat({ goal: 15000, budgeted: 5000, balance: 5000, goalDef })),
      [{ amount: 10000 }, { text: ' more needed this month' }],
    );
  });
});

// ---------------------------------------------------------------------------
// Edge: goal is null (goalDef exists but goal indicator not set)
// ---------------------------------------------------------------------------

describe('getGoalProgress — goalDef present but goal null', () => {
  const goalDef = toGoalDef([{
    type: 'average', numMonths: 3, priority: 0, directive: 'template',
  }]);

  it('falls back to no-goal path', () => {
    expectSegments(
      getGoalProgress(makeCat({ goal: null, goalDef })),
      [{ text: 'No spending' }],
    );
  });
});

// ---------------------------------------------------------------------------
// getGoalProgressLabel (accessibility)
// ---------------------------------------------------------------------------

describe('getGoalProgressLabel', () => {
  it('returns plain text for no-goal', () => {
    expect(getGoalProgressLabel(makeCat({}))).toBe('No spending');
  });

  it('formats amounts as dollars', () => {
    const goalDef = toGoalDef([{ type: 'goal', amount: 5000, directive: 'goal' }]);
    expect(
      getGoalProgressLabel(makeCat({ goal: 500000, longGoal: true, balance: 100000, goalDef })),
    ).toBe('$1000.00 of $5000.00 saved');
  });

  it('returns funded label', () => {
    const goalDef = toGoalDef([{ type: 'goal', amount: 5000, directive: 'goal' }]);
    expect(
      getGoalProgressLabel(makeCat({ goal: 500000, longGoal: true, balance: 500000, goalDef })),
    ).toBe('Funded');
  });
});
