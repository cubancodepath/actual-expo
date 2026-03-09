import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock DB module before importing engine
vi.mock('../db', () => ({
  first: vi.fn(),
  runQuery: vi.fn(),
}));

import { first, runQuery } from '../db';
import {
  amountToInteger,
  integerToAmount,
  getSpentForMonth,
  calculateGoal,
  type GoalContext,
} from './engine';
import type {
  SimpleTemplate,
  GoalTemplate,
  ByTemplate,
  AverageTemplate,
  CopyTemplate,
  PeriodicTemplate,
  SpendTemplate,
  PercentageTemplate,
  RemainderTemplate,
  LimitTemplate,
  Template,
} from './types';

const mockFirst = vi.mocked(first);
const mockRunQuery = vi.mocked(runQuery);

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ctx(overrides?: Partial<GoalContext>): GoalContext {
  return { fromLastMonth: 0, previouslyBudgeted: 0, ...overrides };
}

// ═══════════════════════════════════════════════════════════════════════════
// Amount conversion
// ═══════════════════════════════════════════════════════════════════════════

describe('amountToInteger / integerToAmount', () => {
  it('converts display to cents', () => {
    expect(amountToInteger(12.50)).toBe(1250);
    expect(amountToInteger(0)).toBe(0);
    expect(amountToInteger(100)).toBe(10000);
  });

  it('converts cents to display', () => {
    expect(integerToAmount(1250)).toBe(12.50);
    expect(integerToAmount(0)).toBe(0);
    expect(integerToAmount(10000)).toBe(100);
  });

  it('handles rounding', () => {
    expect(amountToInteger(12.345)).toBe(1235); // rounds
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// calculateGoal — simple template
// ═══════════════════════════════════════════════════════════════════════════

describe('calculateGoal — simple monthly', () => {
  it('budgets the monthly amount', async () => {
    const templates: Template[] = [
      { type: 'simple', monthly: 200, priority: 0, directive: 'template' },
    ];
    const result = await calculateGoal('cat-1', '2026-03', templates, ctx());
    expect(result.budgeted).toBe(20000);
    expect(result.goal).toBe(20000);
    expect(result.longGoal).toBe(false);
  });

  it('fractional monthly amount', async () => {
    const templates: Template[] = [
      { type: 'simple', monthly: 49.99, priority: 0, directive: 'template' },
    ];
    const result = await calculateGoal('cat-1', '2026-03', templates, ctx());
    expect(result.budgeted).toBe(4999);
  });
});

describe('calculateGoal — simple refill (no monthly, with limit)', () => {
  it('refills up to limit minus carryover', async () => {
    const templates: Template[] = [
      { type: 'simple', limit: { amount: 500, hold: false, period: 'monthly' }, priority: 0, directive: 'template' },
    ];
    const result = await calculateGoal('cat-1', '2026-03', templates, ctx({ fromLastMonth: 30000 }));
    expect(result.budgeted).toBe(20000); // 50000 - 30000
    expect(result.longGoal).toBe(true);
  });

  it('already at limit', async () => {
    const templates: Template[] = [
      { type: 'simple', limit: { amount: 500, hold: false, period: 'monthly' }, priority: 0, directive: 'template' },
    ];
    const result = await calculateGoal('cat-1', '2026-03', templates, ctx({ fromLastMonth: 50000 }));
    expect(result.budgeted).toBe(0);
  });

  it('over limit', async () => {
    const templates: Template[] = [
      { type: 'simple', limit: { amount: 500, hold: false, period: 'monthly' }, priority: 0, directive: 'template' },
    ];
    const result = await calculateGoal('cat-1', '2026-03', templates, ctx({ fromLastMonth: 60000 }));
    expect(result.budgeted).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// calculateGoal — #goal (balance target only)
// ═══════════════════════════════════════════════════════════════════════════

describe('calculateGoal — #goal', () => {
  it('preserves existing budget, sets goal and longGoal', async () => {
    const templates: Template[] = [
      { type: 'goal', amount: 5000, directive: 'goal' },
    ];
    const result = await calculateGoal('cat-1', '2026-03', templates, ctx({ previouslyBudgeted: 15000 }));
    expect(result.budgeted).toBe(15000); // does not change budgeted
    expect(result.goal).toBe(500000);
    expect(result.longGoal).toBe(true);
  });

  it('with zero previous budget', async () => {
    const templates: Template[] = [
      { type: 'goal', amount: 1000, directive: 'goal' },
    ];
    const result = await calculateGoal('cat-1', '2026-03', templates, ctx());
    expect(result.budgeted).toBe(0);
    expect(result.goal).toBe(100000);
    expect(result.longGoal).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// calculateGoal — goal + simple (combined)
// ═══════════════════════════════════════════════════════════════════════════

describe('calculateGoal — goal + simple combined', () => {
  it('uses simple for budgeted, goal from #goal', async () => {
    const templates: Template[] = [
      { type: 'goal', amount: 5000, directive: 'goal' },
      { type: 'simple', monthly: 200, priority: 0, directive: 'template' },
    ];
    const result = await calculateGoal('cat-1', '2026-03', templates, ctx());
    expect(result.budgeted).toBe(20000); // from simple
    expect(result.goal).toBe(500000);     // from goal
    expect(result.longGoal).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// calculateGoal — by (sinking fund)
// ═══════════════════════════════════════════════════════════════════════════

describe('calculateGoal — by (sinking fund)', () => {
  it('divides target by months remaining', async () => {
    // $1200 by 2026-12, month=2026-03, fromLastMonth=0 → 10 months → 12000/month
    const templates: Template[] = [
      { type: 'by', amount: 1200, month: '2026-12', priority: 0, directive: 'template' },
    ];
    const result = await calculateGoal('cat-1', '2026-03', templates, ctx());
    expect(result.budgeted).toBe(12000);
    expect(result.longGoal).toBe(false);
  });

  it('subtracts fromLastMonth before dividing', async () => {
    // $1200 by 2026-12, month=2026-03, fromLastMonth=$600 → (120000-60000)/10 = 6000
    const templates: Template[] = [
      { type: 'by', amount: 1200, month: '2026-12', priority: 0, directive: 'template' },
    ];
    const result = await calculateGoal('cat-1', '2026-03', templates, ctx({ fromLastMonth: 60000 }));
    expect(result.budgeted).toBe(6000);
  });

  it('already at target → budgets 0', async () => {
    const templates: Template[] = [
      { type: 'by', amount: 1200, month: '2026-12', priority: 0, directive: 'template' },
    ];
    const result = await calculateGoal('cat-1', '2026-03', templates, ctx({ fromLastMonth: 120000 }));
    expect(result.budgeted).toBe(0);
  });

  it('target month in past, no repeat → negative result (engine quirk)', async () => {
    // When target is past and no repeat, numMonths is negative.
    // runBy divides by (numMonths+1) which is negative → negative budget.
    // This is pre-existing behavior from Actual's engine.
    const templates: Template[] = [
      { type: 'by', amount: 1200, month: '2025-06', priority: 0, directive: 'template' },
    ];
    const result = await calculateGoal('cat-1', '2026-03', templates, ctx());
    // (120000 - 0) / (-9 + 1) = -15000
    expect(result.budgeted).toBe(-15000);
  });

  it('target in past with annual repeat → advances and calculates', async () => {
    // target 2025-06, annual → 2026-06, month=2026-03 → 3 months → (120000-0)/4 = 30000
    const templates: Template[] = [
      { type: 'by', amount: 1200, month: '2025-06', annual: true, repeat: 1, priority: 0, directive: 'template' },
    ];
    const result = await calculateGoal('cat-1', '2026-03', templates, ctx());
    expect(result.budgeted).toBe(30000);
  });

  it('same month as target → full remaining in one month', async () => {
    // target 2026-03, month=2026-03 → 0 diff → numMonths+1=1 → full amount
    const templates: Template[] = [
      { type: 'by', amount: 600, month: '2026-03', priority: 0, directive: 'template' },
    ];
    const result = await calculateGoal('cat-1', '2026-03', templates, ctx());
    expect(result.budgeted).toBe(60000);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// calculateGoal — average
// ═══════════════════════════════════════════════════════════════════════════

describe('calculateGoal — average', () => {
  it('averages spent over N months', async () => {
    // 3 months: -10000, -20000, -30000 → avg = -20000 → budget 20000
    mockFirst.mockResolvedValueOnce({ spent: -10000 })  // month -1
             .mockResolvedValueOnce({ spent: -20000 })  // month -2
             .mockResolvedValueOnce({ spent: -30000 }); // month -3

    const templates: Template[] = [
      { type: 'average', numMonths: 3, priority: 0, directive: 'template' },
    ];
    const result = await calculateGoal('cat-1', '2026-03', templates, ctx());
    expect(result.budgeted).toBe(20000);
  });

  it('with percent adjustment (+10%)', async () => {
    mockFirst.mockResolvedValueOnce({ spent: -10000 })
             .mockResolvedValueOnce({ spent: -10000 })
             .mockResolvedValueOnce({ spent: -10000 });

    const templates: Template[] = [
      { type: 'average', numMonths: 3, adjustment: 10, adjustmentType: 'percent', priority: 0, directive: 'template' },
    ];
    const result = await calculateGoal('cat-1', '2026-03', templates, ctx());
    expect(result.budgeted).toBe(11000); // 10000 * 1.10
  });

  it('with fixed adjustment (+$50)', async () => {
    mockFirst.mockResolvedValueOnce({ spent: -10000 })
             .mockResolvedValueOnce({ spent: -10000 })
             .mockResolvedValueOnce({ spent: -10000 });

    const templates: Template[] = [
      { type: 'average', numMonths: 3, adjustment: 50, adjustmentType: 'fixed', priority: 0, directive: 'template' },
    ];
    const result = await calculateGoal('cat-1', '2026-03', templates, ctx());
    expect(result.budgeted).toBe(15000); // 10000 + 5000
  });

  it('no spending history → budgets 0', async () => {
    mockFirst.mockResolvedValue({ spent: 0 });

    const templates: Template[] = [
      { type: 'average', numMonths: 3, priority: 0, directive: 'template' },
    ];
    const result = await calculateGoal('cat-1', '2026-03', templates, ctx());
    expect(result.budgeted).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// calculateGoal — copy
// ═══════════════════════════════════════════════════════════════════════════

describe('calculateGoal — copy', () => {
  it('copies budget from N months ago', async () => {
    mockFirst.mockResolvedValueOnce({ amount: 25000 }); // getBudgetedForMonth

    const templates: Template[] = [
      { type: 'copy', lookBack: 2, priority: 0, directive: 'template' },
    ];
    const result = await calculateGoal('cat-1', '2026-03', templates, ctx());
    expect(result.budgeted).toBe(25000);
  });

  it('no budget in past month → 0', async () => {
    mockFirst.mockResolvedValueOnce(null);

    const templates: Template[] = [
      { type: 'copy', lookBack: 1, priority: 0, directive: 'template' },
    ];
    const result = await calculateGoal('cat-1', '2026-03', templates, ctx());
    expect(result.budgeted).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// calculateGoal — periodic
// ═══════════════════════════════════════════════════════════════════════════

describe('calculateGoal — periodic', () => {
  it('monthly occurrence', async () => {
    const templates: Template[] = [
      { type: 'periodic', amount: 50, period: { period: 'month', amount: 1 }, priority: 0, directive: 'template' },
    ];
    const result = await calculateGoal('cat-1', '2026-03', templates, ctx());
    expect(result.budgeted).toBe(5000);
  });

  it('every 2 months, not in this month → 0', async () => {
    // Starting Jan 2026, every 2 months → Jan, Mar, May...
    // For Feb 2026 → no occurrence
    const templates: Template[] = [
      {
        type: 'periodic', amount: 100,
        period: { period: 'month', amount: 2 },
        starting: '2026-01-01',
        priority: 0, directive: 'template',
      },
    ];
    const result = await calculateGoal('cat-1', '2026-02', templates, ctx());
    expect(result.budgeted).toBe(0);
  });

  it('every 2 months, in this month', async () => {
    const templates: Template[] = [
      {
        type: 'periodic', amount: 100,
        period: { period: 'month', amount: 2 },
        starting: '2026-01-01',
        priority: 0, directive: 'template',
      },
    ];
    const result = await calculateGoal('cat-1', '2026-03', templates, ctx());
    expect(result.budgeted).toBe(10000);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// calculateGoal — spend
// ═══════════════════════════════════════════════════════════════════════════

describe('calculateGoal — spend', () => {
  it('distributes remaining across months', async () => {
    // $600 by 2026-06, from 2026-01, current=2026-03
    // Already budgeted in Jan + Feb: mockFirst returns 10000 each = 20000
    // Remaining: 60000 - 20000 = 40000, months left including current: 4 → 10000/month
    mockFirst.mockResolvedValueOnce({ amount: 10000 })  // Jan
             .mockResolvedValueOnce({ amount: 10000 }); // Feb

    const templates: Template[] = [
      { type: 'spend', amount: 600, month: '2026-06', from: '2026-01', priority: 0, directive: 'template' },
    ];
    const result = await calculateGoal('cat-1', '2026-03', templates, ctx());
    expect(result.budgeted).toBe(10000);
  });

  it('target fully funded → 0', async () => {
    mockFirst.mockResolvedValueOnce({ amount: 30000 })
             .mockResolvedValueOnce({ amount: 30000 });

    const templates: Template[] = [
      { type: 'spend', amount: 600, month: '2026-06', from: '2026-01', priority: 0, directive: 'template' },
    ];
    const result = await calculateGoal('cat-1', '2026-03', templates, ctx());
    expect(result.budgeted).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// calculateGoal — percentage
// ═══════════════════════════════════════════════════════════════════════════

describe('calculateGoal — percentage', () => {
  it('10% of all income', async () => {
    // Mock getIncomeForMonth — queries all income categories
    mockFirst.mockResolvedValueOnce({ total: 500000 }); // all income = $5000

    const templates: Template[] = [
      { type: 'percentage', percent: 10, previous: false, category: 'all-income', priority: 0, directive: 'template' },
    ];
    const result = await calculateGoal('cat-1', '2026-03', templates, ctx());
    expect(result.budgeted).toBe(50000); // 10% of 500000
  });

  it('percentage of previous month income', async () => {
    mockFirst.mockResolvedValueOnce({ total: 400000 });

    const templates: Template[] = [
      { type: 'percentage', percent: 20, previous: true, category: 'all-income', priority: 0, directive: 'template' },
    ];
    const result = await calculateGoal('cat-1', '2026-03', templates, ctx());
    expect(result.budgeted).toBe(80000); // 20% of 400000
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// calculateGoal — remainder
// ═══════════════════════════════════════════════════════════════════════════

describe('calculateGoal — remainder', () => {
  it('pass 1: returns hasRemainder marker', async () => {
    const templates: Template[] = [
      { type: 'remainder', weight: 2, directive: 'template' },
    ];
    const result = await calculateGoal('cat-1', '2026-03', templates, ctx());
    expect(result.hasRemainder).toBe(true);
    expect(result.remainderWeight).toBe(2);
    expect(result.budgeted).toBe(0);
  });

  it('pass 2: distributes proportionally by weight', async () => {
    const templates: Template[] = [
      { type: 'remainder', weight: 3, directive: 'template' },
    ];
    const result = await calculateGoal('cat-1', '2026-03', templates, ctx({
      remainderBudget: 90000, // $900 available
      totalWeight: 9,          // total weight across all remainder cats
    }));
    // 3/9 * 90000 = 30000
    expect(result.budgeted).toBe(30000);
  });

  it('pass 2 with limit', async () => {
    const templates: Template[] = [
      { type: 'remainder', weight: 1, limit: { amount: 100, hold: false, period: 'monthly' }, directive: 'template' },
    ];
    const result = await calculateGoal('cat-1', '2026-03', templates, ctx({
      remainderBudget: 50000,
      totalWeight: 1,
      fromLastMonth: 5000,
    }));
    // 1/1 * 50000 = 50000, but limit is 10000, and fromLastMonth is 5000
    // So capped: min(50000, 10000 - 5000) = 5000
    expect(result.budgeted).toBe(5000);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// calculateGoal — limit capping
// ═══════════════════════════════════════════════════════════════════════════

describe('calculateGoal — limit capping', () => {
  it('simple + limit: caps at limit', async () => {
    const templates: Template[] = [
      { type: 'simple', monthly: 500, priority: 0, directive: 'template' },
      { type: 'limit', amount: 300, hold: false, period: 'monthly', directive: 'template' },
    ];
    const result = await calculateGoal('cat-1', '2026-03', templates, ctx());
    expect(result.budgeted).toBe(30000); // capped at limit
  });

  it('simple + limit: under limit', async () => {
    const templates: Template[] = [
      { type: 'simple', monthly: 200, priority: 0, directive: 'template' },
      { type: 'limit', amount: 300, hold: false, period: 'monthly', directive: 'template' },
    ];
    const result = await calculateGoal('cat-1', '2026-03', templates, ctx());
    expect(result.budgeted).toBe(20000); // under limit, no capping
  });

  it('limit with fromLastMonth: reduces available room', async () => {
    const templates: Template[] = [
      { type: 'simple', monthly: 500, priority: 0, directive: 'template' },
      { type: 'limit', amount: 300, hold: false, period: 'monthly', directive: 'template' },
    ];
    const result = await calculateGoal('cat-1', '2026-03', templates, ctx({ fromLastMonth: 20000 }));
    // Limit = 30000, fromLastMonth = 20000, so room = 10000
    expect(result.budgeted).toBe(10000);
  });

  it('limit already met by fromLastMonth', async () => {
    const templates: Template[] = [
      { type: 'simple', monthly: 500, priority: 0, directive: 'template' },
      { type: 'limit', amount: 300, hold: false, period: 'monthly', directive: 'template' },
    ];
    const result = await calculateGoal('cat-1', '2026-03', templates, ctx({ fromLastMonth: 30000 }));
    expect(result.budgeted).toBe(0);
  });

  it('simple with inline limit', async () => {
    const templates: Template[] = [
      { type: 'simple', monthly: 500, limit: { amount: 300, hold: false, period: 'monthly' }, priority: 0, directive: 'template' },
    ];
    const result = await calculateGoal('cat-1', '2026-03', templates, ctx());
    expect(result.budgeted).toBe(30000); // capped at inline limit
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// calculateGoal — priority ordering
// ═══════════════════════════════════════════════════════════════════════════

describe('calculateGoal — priority', () => {
  it('processes lower priority first', async () => {
    // Two simple templates at different priorities — both contribute
    const templates: Template[] = [
      { type: 'simple', monthly: 100, priority: 1, directive: 'template' },
      { type: 'simple', monthly: 200, priority: 0, directive: 'template' },
    ];
    const result = await calculateGoal('cat-1', '2026-03', templates, ctx());
    // Both are summed: 10000 + 20000 = 30000
    expect(result.budgeted).toBe(30000);
  });

  it('limit caps across priorities', async () => {
    const templates: Template[] = [
      { type: 'simple', monthly: 200, priority: 0, directive: 'template' },
      { type: 'simple', monthly: 200, priority: 1, directive: 'template' },
      { type: 'limit', amount: 300, hold: false, period: 'monthly', directive: 'template' },
    ];
    const result = await calculateGoal('cat-1', '2026-03', templates, ctx());
    // Priority 0: 20000, Priority 1: would add 20000 but limit=30000, so capped at 10000 more
    expect(result.budgeted).toBe(30000);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// calculateGoal — refill template
// ═══════════════════════════════════════════════════════════════════════════

describe('calculateGoal — refill', () => {
  it('refills to companion limit', async () => {
    const templates: Template[] = [
      { type: 'refill', priority: 0, directive: 'template' },
      { type: 'limit', amount: 500, hold: false, period: 'monthly', directive: 'template' },
    ];
    const result = await calculateGoal('cat-1', '2026-03', templates, ctx({ fromLastMonth: 30000 }));
    expect(result.budgeted).toBe(20000); // 50000 - 30000
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// getSpentForMonth (exported helper)
// ═══════════════════════════════════════════════════════════════════════════

describe('getSpentForMonth', () => {
  it('returns spent amount from DB', async () => {
    mockFirst.mockResolvedValueOnce({ spent: -15000 });
    const result = await getSpentForMonth('cat-1', '2026-03');
    expect(result).toBe(-15000);
  });

  it('returns 0 when no transactions', async () => {
    mockFirst.mockResolvedValueOnce(null);
    const result = await getSpentForMonth('cat-1', '2026-03');
    expect(result).toBe(0);
  });
});
