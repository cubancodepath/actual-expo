import { describe, it, expect } from 'vitest';
import { parseGoalDef, inferGoalFromDef, templateToNoteLine, templatesToNoteText } from './parse';
import type {
  Template,
  SimpleTemplate,
  GoalTemplate,
  ByTemplate,
  AverageTemplate,
  CopyTemplate,
  PeriodicTemplate,
  SpendTemplate,
  PercentageTemplate,
  RemainderTemplate,
  RefillTemplate,
  LimitTemplate,
} from './types';

// ═══════════════════════════════════════════════════════════════════════════
// parseGoalDef
// ═══════════════════════════════════════════════════════════════════════════

describe('parseGoalDef', () => {
  it('returns [] for null', () => {
    expect(parseGoalDef(null)).toEqual([]);
  });

  it('returns [] for empty string', () => {
    expect(parseGoalDef('')).toEqual([]);
  });

  it('returns [] for invalid JSON', () => {
    expect(parseGoalDef('not json')).toEqual([]);
  });

  it('returns [] for non-array JSON', () => {
    expect(parseGoalDef('{"type":"goal"}')).toEqual([]);
  });

  it('returns [] for "[]"', () => {
    expect(parseGoalDef('[]')).toEqual([]);
  });

  it('parses a valid template array', () => {
    const templates: Template[] = [
      { type: 'simple', monthly: 200, priority: 0, directive: 'template' },
    ];
    expect(parseGoalDef(JSON.stringify(templates))).toEqual(templates);
  });

  it('parses multiple templates', () => {
    const templates: Template[] = [
      { type: 'simple', monthly: 100, priority: 0, directive: 'template' },
      { type: 'limit', amount: 500, hold: false, period: 'monthly', directive: 'template' },
    ];
    expect(parseGoalDef(JSON.stringify(templates))).toEqual(templates);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// inferGoalFromDef
// ═══════════════════════════════════════════════════════════════════════════

describe('inferGoalFromDef', () => {
  // -- null / empty --

  it('returns null for null goalDef', () => {
    expect(inferGoalFromDef(null)).toBeNull();
  });

  it('returns null for empty array', () => {
    expect(inferGoalFromDef('[]')).toBeNull();
  });

  // -- goal (balance target) --

  it('#goal returns full target as goal, longGoal true', () => {
    const def = JSON.stringify([{ type: 'goal', amount: 5000, directive: 'goal' }]);
    expect(inferGoalFromDef(def)).toEqual({ goal: 500000, longGoal: true });
  });

  it('#goal with fractional amount', () => {
    const def = JSON.stringify([{ type: 'goal', amount: 123.45, directive: 'goal' }]);
    expect(inferGoalFromDef(def)).toEqual({ goal: 12345, longGoal: true });
  });

  // -- simple --

  it('simple monthly', () => {
    const def = JSON.stringify([{ type: 'simple', monthly: 200, priority: 0, directive: 'template' }]);
    expect(inferGoalFromDef(def)).toEqual({ goal: 20000, longGoal: false });
  });

  it('simple monthly with limit → goal is limit amount', () => {
    const def = JSON.stringify([{
      type: 'simple', monthly: 200,
      limit: { amount: 800, hold: false, period: 'monthly' },
      priority: 0, directive: 'template',
    }]);
    expect(inferGoalFromDef(def)).toEqual({ goal: 80000, longGoal: false });
  });

  it('simple refill (no monthly, with limit) → longGoal false (monthly refill)', () => {
    const def = JSON.stringify([{
      type: 'simple', limit: { amount: 500, hold: false, period: 'monthly' }, priority: 0, directive: 'template',
    }]);
    expect(inferGoalFromDef(def)).toEqual({ goal: 50000, longGoal: false });
  });

  it('simple pure cap (monthly: 0 + limit) → longGoal false', () => {
    const def = JSON.stringify([{
      type: 'simple', monthly: 0, limit: { amount: 300, hold: false, period: 'monthly' }, priority: 0, directive: 'template',
    }]);
    expect(inferGoalFromDef(def)).toEqual({ goal: 30000, longGoal: false });
  });

  it('simple with no monthly and no limit → null', () => {
    const def = JSON.stringify([{ type: 'simple', priority: 0, directive: 'template' }]);
    expect(inferGoalFromDef(def)).toBeNull();
  });

  // -- by (sinking fund) --

  it('by returns null without month arg', () => {
    const def = JSON.stringify([{
      type: 'by', amount: 1200, month: '2026-12', priority: 0, directive: 'template',
    }]);
    expect(inferGoalFromDef(def)).toBeNull();
  });

  it('by basic: divides evenly', () => {
    // $1200 by 2026-12, current month 2026-03 → 10 months → $120/month
    const def = JSON.stringify([{
      type: 'by', amount: 1200, month: '2026-12', priority: 0, directive: 'template',
    }]);
    expect(inferGoalFromDef(def, '2026-03')).toEqual({ goal: 12000, longGoal: false });
  });

  it('by with carryIn subtracts existing balance', () => {
    // $1200 by 2026-12, month=2026-03, carryIn=$600 → (120000-60000)/10 = 6000
    const def = JSON.stringify([{
      type: 'by', amount: 1200, month: '2026-12', priority: 0, directive: 'template',
    }]);
    expect(inferGoalFromDef(def, '2026-03', 60000)).toEqual({ goal: 6000, longGoal: false });
  });

  it('by with carryIn exceeding target → null', () => {
    const def = JSON.stringify([{
      type: 'by', amount: 1200, month: '2026-12', priority: 0, directive: 'template',
    }]);
    expect(inferGoalFromDef(def, '2026-03', 130000)).toBeNull();
  });

  it('by with carryIn exactly at target → null', () => {
    const def = JSON.stringify([{
      type: 'by', amount: 1200, month: '2026-12', priority: 0, directive: 'template',
    }]);
    expect(inferGoalFromDef(def, '2026-03', 120000)).toBeNull();
  });

  it('by target in past, no repeat → null', () => {
    const def = JSON.stringify([{
      type: 'by', amount: 1200, month: '2025-06', priority: 0, directive: 'template',
    }]);
    expect(inferGoalFromDef(def, '2026-03')).toBeNull();
  });

  it('by target in past, annual repeat → advances target', () => {
    // target 2025-06, annual repeat → advances to 2026-06
    // 2026-03 to 2026-06 = 3 months → $1200/4 = $300/month = 30000 cents
    const def = JSON.stringify([{
      type: 'by', amount: 1200, month: '2025-06', annual: true, repeat: 1, priority: 0, directive: 'template',
    }]);
    expect(inferGoalFromDef(def, '2026-03')).toEqual({ goal: 30000, longGoal: false });
  });

  it('by same month as target → full amount needed', () => {
    // target 2026-03, current 2026-03 → 0 months diff → numMonths+1=1 → full amount
    const def = JSON.stringify([{
      type: 'by', amount: 600, month: '2026-03', priority: 0, directive: 'template',
    }]);
    expect(inferGoalFromDef(def, '2026-03')).toEqual({ goal: 60000, longGoal: false });
  });

  it('by with carryIn and repeating (carry reduces monthly)', () => {
    // target 2025-06, annual repeat → advances to 2026-06
    // 2026-03 to 2026-06 = 3 months → numMonths+1=4
    // $1200 - $400 carryIn = $800 → $800/4 = $200/month = 20000 cents
    const def = JSON.stringify([{
      type: 'by', amount: 1200, month: '2025-06', annual: true, repeat: 1, priority: 0, directive: 'template',
    }]);
    expect(inferGoalFromDef(def, '2026-03', 40000)).toEqual({ goal: 20000, longGoal: false });
  });

  // -- periodic --

  it('periodic', () => {
    const def = JSON.stringify([{
      type: 'periodic', amount: 50, period: { period: 'month', amount: 1 }, priority: 0, directive: 'template',
    }]);
    expect(inferGoalFromDef(def)).toEqual({ goal: 5000, longGoal: false });
  });

  // -- limit --

  it('limit standalone', () => {
    const def = JSON.stringify([{
      type: 'limit', amount: 400, hold: false, period: 'monthly', directive: 'template',
    }]);
    expect(inferGoalFromDef(def)).toEqual({ goal: 40000, longGoal: false });
  });

  // -- refill --

  it('refill with companion limit', () => {
    const def = JSON.stringify([
      { type: 'refill', priority: 0, directive: 'template' },
      { type: 'limit', amount: 300, hold: false, period: 'monthly', directive: 'template' },
    ]);
    expect(inferGoalFromDef(def)).toEqual({ goal: 30000, longGoal: false });
  });

  it('refill with simple limit companion', () => {
    const def = JSON.stringify([
      { type: 'refill', priority: 0, directive: 'template' },
      { type: 'simple', limit: { amount: 250, hold: false, period: 'monthly' }, priority: 0, directive: 'template' },
    ]);
    expect(inferGoalFromDef(def)).toEqual({ goal: 25000, longGoal: false });
  });

  it('refill without any limit → null', () => {
    const def = JSON.stringify([{ type: 'refill', priority: 0, directive: 'template' }]);
    expect(inferGoalFromDef(def)).toBeNull();
  });

  // -- types that need DB (return null) --

  it.each(['average', 'copy', 'percentage', 'spend', 'remainder'] as const)(
    '%s returns null (needs DB)',
    (type) => {
      const templates: Record<string, Template> = {
        average: { type: 'average', numMonths: 3, priority: 0, directive: 'template' },
        copy: { type: 'copy', lookBack: 1, priority: 0, directive: 'template' },
        percentage: { type: 'percentage', percent: 10, previous: false, category: 'all-income', priority: 0, directive: 'template' },
        spend: { type: 'spend', amount: 600, month: '2026-06', from: '2026-01', priority: 0, directive: 'template' },
        remainder: { type: 'remainder', weight: 1, directive: 'template' },
      };
      expect(inferGoalFromDef(JSON.stringify([templates[type]]))).toBeNull();
    },
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// templateToNoteLine
// ═══════════════════════════════════════════════════════════════════════════

describe('templateToNoteLine', () => {
  it('simple monthly', () => {
    const t: SimpleTemplate = { type: 'simple', monthly: 200, priority: 0, directive: 'template' };
    expect(templateToNoteLine(t)).toBe('#template 200');
  });

  it('simple with higher priority', () => {
    const t: SimpleTemplate = { type: 'simple', monthly: 100, priority: 2, directive: 'template' };
    expect(templateToNoteLine(t)).toBe('#template-2 100');
  });

  it('simple with monthly and limit', () => {
    const t: SimpleTemplate = {
      type: 'simple', monthly: 200, limit: { amount: 500, hold: false, period: 'monthly' },
      priority: 0, directive: 'template',
    };
    expect(templateToNoteLine(t)).toBe('#template 200 up to 500');
  });

  it('simple refill (no monthly, with limit hold)', () => {
    const t: SimpleTemplate = {
      type: 'simple', limit: { amount: 300, hold: true, period: 'monthly' },
      priority: 0, directive: 'template',
    };
    expect(templateToNoteLine(t)).toBe('#template up to 300 hold');
  });

  it('goal', () => {
    const t: GoalTemplate = { type: 'goal', amount: 5000, directive: 'goal' };
    expect(templateToNoteLine(t)).toBe('#goal 5000');
  });

  it('by basic', () => {
    const t: ByTemplate = { type: 'by', amount: 1200, month: '2026-12', priority: 0, directive: 'template' };
    expect(templateToNoteLine(t)).toBe('#template 1200 by 2026-12');
  });

  it('by with annual repeat', () => {
    const t: ByTemplate = {
      type: 'by', amount: 600, month: '2026-06', annual: true, repeat: 1, priority: 0, directive: 'template',
    };
    expect(templateToNoteLine(t)).toBe('#template 600 by 2026-06 repeat every year');
  });

  it('by with monthly repeat', () => {
    const t: ByTemplate = {
      type: 'by', amount: 300, month: '2026-09', repeat: 6, priority: 0, directive: 'template',
    };
    expect(templateToNoteLine(t)).toBe('#template 300 by 2026-09 repeat every 6 months');
  });

  it('average', () => {
    const t: AverageTemplate = { type: 'average', numMonths: 3, priority: 0, directive: 'template' };
    expect(templateToNoteLine(t)).toBe('#template average 3 months');
  });

  it('average with percent increase', () => {
    const t: AverageTemplate = {
      type: 'average', numMonths: 6, adjustment: 10, adjustmentType: 'percent', priority: 0, directive: 'template',
    };
    expect(templateToNoteLine(t)).toBe('#template average 6 months [increase 10%]');
  });

  it('average with fixed decrease', () => {
    const t: AverageTemplate = {
      type: 'average', numMonths: 3, adjustment: -20, adjustmentType: 'fixed', priority: 0, directive: 'template',
    };
    expect(templateToNoteLine(t)).toBe('#template average 3 months [decrease 20]');
  });

  it('copy', () => {
    const t: CopyTemplate = { type: 'copy', lookBack: 2, priority: 0, directive: 'template' };
    expect(templateToNoteLine(t)).toBe('#template copy from 2 months ago');
  });

  it('periodic monthly', () => {
    const t: PeriodicTemplate = {
      type: 'periodic', amount: 50, period: { period: 'month', amount: 1 }, priority: 0, directive: 'template',
    };
    expect(templateToNoteLine(t)).toBe('#template 50 repeat every month');
  });

  it('periodic with starting date and limit', () => {
    const t: PeriodicTemplate = {
      type: 'periodic', amount: 100, period: { period: 'week', amount: 2 },
      starting: '2026-01-01',
      limit: { amount: 500, hold: false, period: 'monthly' },
      priority: 0, directive: 'template',
    };
    expect(templateToNoteLine(t)).toBe('#template 100 repeat every 2 weeks starting 2026-01-01 up to 500');
  });

  it('spend', () => {
    const t: SpendTemplate = {
      type: 'spend', amount: 600, month: '2026-06', from: '2026-01', priority: 0, directive: 'template',
    };
    expect(templateToNoteLine(t)).toBe('#template 600 by 2026-06 spend from 2026-01');
  });

  it('percentage of all income', () => {
    const t: PercentageTemplate = {
      type: 'percentage', percent: 10, previous: false, category: 'all-income', priority: 0, directive: 'template',
    };
    expect(templateToNoteLine(t)).toBe('#template 10% of all income');
  });

  it('percentage of previous specific category', () => {
    const t: PercentageTemplate = {
      type: 'percentage', percent: 5, previous: true, category: 'cat-123', priority: 0, directive: 'template',
    };
    expect(templateToNoteLine(t, 'Salary')).toBe('#template 5% of previous Salary');
  });

  it('remainder', () => {
    const t: RemainderTemplate = { type: 'remainder', weight: 1, directive: 'template' };
    expect(templateToNoteLine(t)).toBe('#template remainder');
  });

  it('remainder with weight', () => {
    const t: RemainderTemplate = { type: 'remainder', weight: 3, directive: 'template' };
    expect(templateToNoteLine(t)).toBe('#template remainder 3');
  });

  it('remainder with limit', () => {
    const t: RemainderTemplate = {
      type: 'remainder', weight: 1, limit: { amount: 200, hold: false, period: 'monthly' }, directive: 'template',
    };
    expect(templateToNoteLine(t)).toBe('#template remainder up to 200');
  });

  it('refill', () => {
    const t: RefillTemplate = { type: 'refill', priority: 0, directive: 'template' };
    expect(templateToNoteLine(t)).toBe('#template refill');
  });

  it('limit monthly', () => {
    const t: LimitTemplate = { type: 'limit', amount: 400, hold: false, period: 'monthly', directive: 'template' };
    expect(templateToNoteLine(t)).toBe('#template up to 400');
  });

  it('limit daily', () => {
    const t: LimitTemplate = { type: 'limit', amount: 20, hold: false, period: 'daily', directive: 'template' };
    expect(templateToNoteLine(t)).toBe('#template up to 20 per day');
  });

  it('limit weekly with start', () => {
    const t: LimitTemplate = {
      type: 'limit', amount: 100, hold: false, period: 'weekly', start: '2026-01-06', directive: 'template',
    };
    expect(templateToNoteLine(t)).toBe('#template up to 100 per week starting 2026-01-06');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// templatesToNoteText
// ═══════════════════════════════════════════════════════════════════════════

describe('templatesToNoteText', () => {
  it('single template', () => {
    const templates: Template[] = [
      { type: 'simple', monthly: 200, priority: 0, directive: 'template' },
    ];
    expect(templatesToNoteText(templates)).toBe('#template 200');
  });

  it('multiple templates joined by newlines', () => {
    const templates: Template[] = [
      { type: 'simple', monthly: 200, priority: 0, directive: 'template' },
      { type: 'limit', amount: 500, hold: false, period: 'monthly', directive: 'template' },
    ];
    expect(templatesToNoteText(templates)).toBe('#template 200\n#template up to 500');
  });

  it('resolves category names for percentage', () => {
    const templates: Template[] = [
      { type: 'percentage', percent: 10, previous: false, category: 'cat-abc', priority: 0, directive: 'template' },
    ];
    const names = new Map([['cat-abc', 'Salary']]);
    expect(templatesToNoteText(templates, names)).toBe('#template 10% of Salary');
  });
});
