/**
 * Bridge between transaction form data and the rules engine.
 *
 * Translates form field names (payeeId, categoryId) to internal DB
 * column names (description, category) that the engine expects,
 * then extracts results back into form-friendly shape.
 */

import type { ParsedRule } from './types';
import { runRules } from './engine';

export type TransactionFormData = {
  acct: string | null;
  payeeId: string | null;
  categoryId: string | null;
  amount: number;
  date: number;
  notes: string | null;
  cleared: boolean;
};

export type RuleResult = {
  acctId: string | null;
  categoryId: string | null;
  notes: string | null;
};

/**
 * Run rules against form data and return the resulting field values.
 */
export function applyRulesToForm(
  rules: ParsedRule[],
  form: TransactionFormData,
): RuleResult {
  const txn: Record<string, unknown> = {
    acct: form.acct,
    description: form.payeeId,
    category: form.categoryId,
    amount: form.amount,
    date: form.date,
    notes: form.notes ?? '',
    cleared: form.cleared,
  };

  const result = runRules(rules, txn);

  return {
    acctId: (result.acct as string | null) ?? null,
    categoryId: (result.category as string | null) ?? null,
    notes: (result.notes as string | null) ?? null,
  };
}

/**
 * Suggest a category based on payee selection.
 * Builds a minimal transaction with just the payee and runs rules
 * to see if any rule sets a category for this payee.
 */
export function suggestCategoryForPayee(
  rules: ParsedRule[],
  payeeId: string | null,
  acctId: string | null,
): string | null {
  if (!payeeId) return null;

  const txn: Record<string, unknown> = {
    description: payeeId,
    acct: acctId,
    category: null,
    amount: 0,
    date: 0,
    notes: '',
    cleared: false,
  };

  const result = runRules(rules, txn);
  return (result.category as string | null) ?? null;
}
