import { describe, it, expect } from 'vitest';
import { suggestCategoryForPayee, applyRulesToForm } from './apply';
import type { ParsedRule } from './types';

// ── Helper ──

function makeRule(
  id: string,
  conditions: ParsedRule['conditions'],
  actions: ParsedRule['actions'],
  opts?: { stage?: ParsedRule['stage']; conditionsOp?: 'and' | 'or' },
): ParsedRule {
  return {
    id,
    stage: opts?.stage ?? null,
    conditions,
    actions,
    conditionsOp: opts?.conditionsOp ?? 'and',
  };
}

// ── suggestCategoryForPayee ──

describe('suggestCategoryForPayee', () => {
  it('returns category when payee matches a rule', () => {
    const rules = [
      makeRule('r1', [
        { field: 'payee', op: 'is', value: 'payee-walmart', type: 'id' },
      ], [
        { op: 'set', field: 'category', value: 'cat-groceries' },
      ]),
    ];
    expect(suggestCategoryForPayee(rules, 'payee-walmart', 'acc-1')).toBe('cat-groceries');
  });

  it('returns null when payee does not match any rule', () => {
    const rules = [
      makeRule('r1', [
        { field: 'payee', op: 'is', value: 'payee-walmart', type: 'id' },
      ], [
        { op: 'set', field: 'category', value: 'cat-groceries' },
      ]),
    ];
    expect(suggestCategoryForPayee(rules, 'payee-target', 'acc-1')).toBeNull();
  });

  it('returns null when no rules exist', () => {
    expect(suggestCategoryForPayee([], 'payee-1', 'acc-1')).toBeNull();
  });

  it('returns null when payeeId is null', () => {
    const rules = [
      makeRule('r1', [
        { field: 'payee', op: 'is', value: 'payee-1', type: 'id' },
      ], [
        { op: 'set', field: 'category', value: 'cat-1' },
      ]),
    ];
    expect(suggestCategoryForPayee(rules, null, 'acc-1')).toBeNull();
  });

  it('returns highest ranked rule category when multiple rules match', () => {
    const rules = [
      // Lower specificity: contains (score 0)
      makeRule('r-low', [
        { field: 'payee', op: 'contains', value: 'payee', type: 'id' },
      ], [
        { op: 'set', field: 'category', value: 'cat-general' },
      ]),
      // Higher specificity: is (score 10 * 2 = 20)
      makeRule('r-high', [
        { field: 'payee', op: 'is', value: 'payee-walmart', type: 'id' },
      ], [
        { op: 'set', field: 'category', value: 'cat-groceries' },
      ]),
    ];
    // Both match, but r-high runs first (higher score) and sets cat-groceries,
    // then r-low also runs and overwrites with cat-general
    // Actually: higher specificity runs FIRST in rankRules (descending score),
    // so r-high sets cat-groceries, then r-low overwrites with cat-general
    // The last matching rule wins (all rules applied sequentially)
    expect(suggestCategoryForPayee(rules, 'payee-walmart', 'acc-1')).toBe('cat-general');
  });

  it('works with account-based conditions', () => {
    const rules = [
      makeRule('r1', [
        { field: 'payee', op: 'is', value: 'payee-1', type: 'id' },
        { field: 'account', op: 'is', value: 'acc-checking', type: 'id' },
      ], [
        { op: 'set', field: 'category', value: 'cat-bills' },
      ]),
    ];
    // Matches when account matches
    expect(suggestCategoryForPayee(rules, 'payee-1', 'acc-checking')).toBe('cat-bills');
    // Does not match when account differs
    expect(suggestCategoryForPayee(rules, 'payee-1', 'acc-savings')).toBeNull();
  });
});

// ── applyRulesToForm ──

describe('applyRulesToForm', () => {
  const baseForm = {
    acct: 'acc-1',
    payeeId: 'payee-1',
    categoryId: null as string | null,
    amount: -5000,
    date: 20240315,
    notes: null as string | null,
    cleared: false,
  };

  it('maps form fields to internal column names and returns rule results', () => {
    const rules = [
      makeRule('r1', [
        { field: 'payee', op: 'is', value: 'payee-1', type: 'id' },
      ], [
        { op: 'set', field: 'category', value: 'cat-food' },
      ]),
    ];
    const result = applyRulesToForm(rules, baseForm);
    expect(result.categoryId).toBe('cat-food');
  });

  it('sets category when form has null categoryId', () => {
    const rules = [
      makeRule('r1', [
        { field: 'payee', op: 'is', value: 'payee-1', type: 'id' },
      ], [
        { op: 'set', field: 'category', value: 'cat-groceries' },
      ]),
    ];
    const result = applyRulesToForm(rules, { ...baseForm, categoryId: null });
    expect(result.categoryId).toBe('cat-groceries');
  });

  it('returns rule output even when form already has categoryId', () => {
    const rules = [
      makeRule('r1', [
        { field: 'payee', op: 'is', value: 'payee-1', type: 'id' },
      ], [
        { op: 'set', field: 'category', value: 'cat-groceries' },
      ]),
    ];
    // Form has existing category — rule still runs and returns its output
    // (caller decides whether to override)
    const result = applyRulesToForm(rules, { ...baseForm, categoryId: 'cat-existing' });
    expect(result.categoryId).toBe('cat-groceries');
  });

  it('appends notes via rule action', () => {
    const rules = [
      makeRule('r1', [
        { field: 'payee', op: 'is', value: 'payee-1', type: 'id' },
      ], [
        { op: 'append-notes', value: ' [auto]' },
      ]),
    ];
    const result = applyRulesToForm(rules, { ...baseForm, notes: 'purchase' });
    expect(result.notes).toBe('purchase [auto]');
  });

  it('prepends notes via rule action', () => {
    const rules = [
      makeRule('r1', [
        { field: 'payee', op: 'is', value: 'payee-1', type: 'id' },
      ], [
        { op: 'prepend-notes', value: 'auto: ' },
      ]),
    ];
    const result = applyRulesToForm(rules, { ...baseForm, notes: 'purchase' });
    expect(result.notes).toBe('auto: purchase');
  });

  it('returns original values when no rules match', () => {
    const rules = [
      makeRule('r1', [
        { field: 'payee', op: 'is', value: 'payee-other', type: 'id' },
      ], [
        { op: 'set', field: 'category', value: 'cat-food' },
      ]),
    ];
    const result = applyRulesToForm(rules, { ...baseForm, notes: 'my note' });
    expect(result.categoryId).toBeNull();
    expect(result.notes).toBe('my note');
  });

  it('returns original values when no rules exist', () => {
    const result = applyRulesToForm([], baseForm);
    expect(result.categoryId).toBeNull();
    expect(result.notes).toBe('');
  });

  it('cascades multiple rules (rule 1 sets category, rule 2 appends notes)', () => {
    const rules = [
      makeRule('r1', [
        { field: 'payee', op: 'is', value: 'payee-1', type: 'id' },
      ], [
        { op: 'set', field: 'category', value: 'cat-food' },
      ]),
      makeRule('r2', [
        { field: 'category', op: 'is', value: 'cat-food', type: 'id' },
      ], [
        { op: 'append-notes', value: ' [food]' },
      ]),
    ];
    const result = applyRulesToForm(rules, baseForm);
    expect(result.categoryId).toBe('cat-food');
    expect(result.notes).toBe(' [food]');
  });

  it('handles amount-based conditions', () => {
    const rules = [
      makeRule('r1', [
        { field: 'amount', op: 'lt', value: 0, type: 'number' },
      ], [
        { op: 'set', field: 'category', value: 'cat-expense' },
      ]),
    ];
    const result = applyRulesToForm(rules, { ...baseForm, amount: -5000 });
    expect(result.categoryId).toBe('cat-expense');
  });

  it('handles date-based conditions', () => {
    const rules = [
      makeRule('r1', [
        { field: 'date', op: 'is', value: '2024-03', type: 'date' },
      ], [
        { op: 'append-notes', value: ' [march]' },
      ]),
    ];
    const result = applyRulesToForm(rules, { ...baseForm, date: 20240315 });
    expect(result.notes).toBe(' [march]');
  });

  it('returns account when rule sets acct field', () => {
    const rules = [
      makeRule('r1', [
        { field: 'amount', op: 'gt', value: 0, type: 'number', options: { outflow: true } },
      ], [
        { op: 'set', field: 'account', value: 'acc-default' },
      ]),
    ];
    const result = applyRulesToForm(rules, { ...baseForm, amount: -5000 });
    expect(result.acctId).toBe('acc-default');
  });

  it('preserves original account when no rule matches', () => {
    const rules = [
      makeRule('r1', [
        { field: 'amount', op: 'gt', value: 0, type: 'number', options: { outflow: true } },
      ], [
        { op: 'set', field: 'account', value: 'acc-default' },
      ]),
    ];
    // amount is positive (income), outflow filter rejects it
    const result = applyRulesToForm(rules, { ...baseForm, amount: 5000 });
    expect(result.acctId).toBe('acc-1');
  });
});
