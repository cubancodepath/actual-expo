import { describe, it, expect, vi, beforeAll } from 'vitest';

// Mock modules that transitively import native dependencies (via format → privacyStore)
vi.mock('../stores/privacyStore', () => ({
  usePrivacyStore: { getState: () => ({ privacyMode: false }) },
}));

import { setCurrencyConfig } from '../lib/format';
import { describeTemplate } from './describe';

// Set up currency symbol so formatted amounts include "$"
// applyCurrencyStyling wraps with LTR marks: \u202A$\u202C
const $ = '\u202A$\u202C';

beforeAll(() => {
  setCurrencyConfig({ symbol: '$', position: 'before', spaceBetween: false });
});
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
  RefillTemplate,
  LimitTemplate,
} from './types';

describe('describeTemplate', () => {
  it('simple monthly', () => {
    const t: SimpleTemplate = { type: 'simple', monthly: 200, priority: 0, directive: 'template' };
    expect(describeTemplate(t)).toBe(`Budget ${$}200.00 monthly`);
  });

  it('simple monthly with limit', () => {
    const t: SimpleTemplate = {
      type: 'simple',
      monthly: 200,
      limit: { amount: 500, hold: false, period: 'monthly' },
      priority: 0,
      directive: 'template',
    };
    expect(describeTemplate(t)).toBe(`Budget ${$}200.00 monthly (up to ${$}500.00)`);
  });

  it('simple with no monthly', () => {
    const t: SimpleTemplate = { type: 'simple', priority: 0, directive: 'template' };
    expect(describeTemplate(t)).toBe('Budget monthly');
  });

  it('goal (balance target)', () => {
    const t: GoalTemplate = { type: 'goal', amount: 5000, directive: 'goal' };
    expect(describeTemplate(t)).toBe(`Reach ${$}5,000.00 balance`);
  });

  it('by (sinking fund)', () => {
    const t: ByTemplate = { type: 'by', amount: 1200, month: '2026-12', priority: 0, directive: 'template' };
    expect(describeTemplate(t)).toBe(`Save ${$}1,200.00 by Dec 2026`);
  });

  it('by with annual repeat', () => {
    const t: ByTemplate = {
      type: 'by', amount: 600, month: '2026-06', annual: true, repeat: 1, priority: 0, directive: 'template',
    };
    expect(describeTemplate(t)).toBe(`Save ${$}600.00 by Jun 2026 (repeats annually)`);
  });

  it('by with monthly repeat', () => {
    const t: ByTemplate = {
      type: 'by', amount: 300, month: '2026-09', repeat: 3, priority: 0, directive: 'template',
    };
    expect(describeTemplate(t)).toBe(`Save ${$}300.00 by Sep 2026 (every 3 months)`);
  });

  it('average', () => {
    const t: AverageTemplate = { type: 'average', numMonths: 3, priority: 0, directive: 'template' };
    expect(describeTemplate(t)).toBe('Average of last 3 months');
  });

  it('average with percent adjustment', () => {
    const t: AverageTemplate = {
      type: 'average', numMonths: 6, adjustment: 10, adjustmentType: 'percent', priority: 0, directive: 'template',
    };
    expect(describeTemplate(t)).toBe('Average of last 6 months (+10%)');
  });

  it('average with negative fixed adjustment', () => {
    const t: AverageTemplate = {
      type: 'average', numMonths: 3, adjustment: -50, adjustmentType: 'fixed', priority: 0, directive: 'template',
    };
    expect(describeTemplate(t)).toBe('Average of last 3 months (-50)');
  });

  it('copy', () => {
    const t: CopyTemplate = { type: 'copy', lookBack: 1, priority: 0, directive: 'template' };
    expect(describeTemplate(t)).toBe('Copy budget from 1 month ago');
  });

  it('copy multiple months', () => {
    const t: CopyTemplate = { type: 'copy', lookBack: 3, priority: 0, directive: 'template' };
    expect(describeTemplate(t)).toBe('Copy budget from 3 months ago');
  });

  it('periodic monthly', () => {
    const t: PeriodicTemplate = {
      type: 'periodic', amount: 50, period: { period: 'month', amount: 1 }, priority: 0, directive: 'template',
    };
    expect(describeTemplate(t)).toBe(`Budget ${$}50.00 every month`);
  });

  it('periodic every 2 weeks', () => {
    const t: PeriodicTemplate = {
      type: 'periodic', amount: 100, period: { period: 'week', amount: 2 }, priority: 0, directive: 'template',
    };
    expect(describeTemplate(t)).toBe(`Budget ${$}100.00 every 2 weeks`);
  });

  it('spend', () => {
    const t: SpendTemplate = {
      type: 'spend', amount: 600, month: '2026-06', from: '2026-01', priority: 0, directive: 'template',
    };
    expect(describeTemplate(t)).toBe(`Spend ${$}600.00 by Jun 2026`);
  });

  it('percentage', () => {
    const t: PercentageTemplate = {
      type: 'percentage', percent: 10, previous: false, category: 'all-income', priority: 0, directive: 'template',
    };
    expect(describeTemplate(t)).toBe('Budget 10% of income');
  });

  it('percentage of previous month', () => {
    const t: PercentageTemplate = {
      type: 'percentage', percent: 5, previous: true, category: 'all-income', priority: 0, directive: 'template',
    };
    expect(describeTemplate(t)).toBe("Budget 5% of last month's income");
  });

  it('remainder weight 1 (default)', () => {
    const t: RemainderTemplate = { type: 'remainder', weight: 1, directive: 'template' };
    expect(describeTemplate(t)).toBe('Fill with remaining budget');
  });

  it('remainder weight 2', () => {
    const t: RemainderTemplate = { type: 'remainder', weight: 2, directive: 'template' };
    expect(describeTemplate(t)).toBe('Fill with remaining budget (weight: 2)');
  });

  it('refill', () => {
    const t: RefillTemplate = { type: 'refill', priority: 0, directive: 'template' };
    expect(describeTemplate(t)).toBe('Refill to limit');
  });

  it('limit monthly', () => {
    const t: LimitTemplate = {
      type: 'limit', amount: 400, hold: false, period: 'monthly', directive: 'template',
    };
    expect(describeTemplate(t)).toBe(`Limit: ${$}400.00 monthly`);
  });

  it('limit monthly with hold', () => {
    const t: LimitTemplate = {
      type: 'limit', amount: 400, hold: true, period: 'monthly', directive: 'template',
    };
    expect(describeTemplate(t)).toBe(`Limit: ${$}400.00 monthly, hold`);
  });
});
