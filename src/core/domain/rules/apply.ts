/**
 * Bridge between transaction form data and the rules engine.
 *
 * Translates form field names (payeeId, categoryId) to public rule
 * field names (payee, category) that the Condition class expects,
 * then extracts results back into form-friendly shape.
 */

import type { Rule } from "./rule";
import { runRules } from "./engine";

/** Convert integer date (e.g. 20240315) to ISO string "2024-03-15". */
function intDateToString(d: number): string {
  if (!d) return "";
  const s = String(d);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

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
export function applyRulesToForm(rules: Rule[], form: TransactionFormData): RuleResult {
  // Build transaction using public rule field names (the Condition class uses these)
  const txn: Record<string, unknown> = {
    account: form.acct,
    payee: form.payeeId,
    category: form.categoryId,
    amount: form.amount,
    date: intDateToString(form.date),
    notes: form.notes ?? "",
    cleared: form.cleared,
  };

  const result = runRules(rules, txn);

  return {
    acctId: (result.account as string | null) ?? null,
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
  rules: Rule[],
  payeeId: string | null,
  acctId: string | null,
): string | null {
  if (!payeeId) return null;

  const txn: Record<string, unknown> = {
    payee: payeeId,
    account: acctId,
    category: null,
    amount: 0,
    date: "",
    notes: "",
    cleared: false,
  };

  const result = runRules(rules, txn);
  return (result.category as string | null) ?? null;
}

/**
 * Apply rules to a transaction with full enrichment (async).
 *
 * This is the full pipeline matching loot-core's runRules():
 * 1. Enrich with payee_name, account object, category_name, balance
 * 2. Run all rules in ranked order
 * 3. Finalize: create new payees, remove temp fields
 *
 * Use this for save-time rule application (not form-level).
 */
export async function applyRulesEnriched(
  rules: Rule[],
  txn: Record<string, unknown>,
  opts?: { skipBalance?: boolean },
): Promise<Record<string, unknown>> {
  // Lazy import to avoid pulling in DB/payee dependencies in unit test contexts
  const { prepareTransactionForRules, finalizeTransactionForRules } = await import("./prepare");
  const enriched = await prepareTransactionForRules(txn, opts);
  const result = runRules(rules, enriched);
  return finalizeTransactionForRules(result);
}
