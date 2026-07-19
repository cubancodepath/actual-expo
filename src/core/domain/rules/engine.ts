/**
 * Rule evaluation engine — thin wrapper around Rule class instances.
 *
 * This module provides backward-compatible functions that work with
 * Rule class instances (the new approach) while keeping the same API
 * surface for apply.ts and useTransactionForm.ts.
 */

export { Rule } from "./rule";
export { rankRules, migrateIds, iterateIds } from "./rule-utils";
export { RuleIndexer } from "./rule-indexer";

import type { Rule } from "./rule";
import { rankRules, fastSetMerge } from "./rule-utils";
import { RuleIndexer } from "./rule-indexer";
import { execActionsWithSplits } from "./splitActions";

/**
 * Narrow the rule set to those that could apply to `transaction`, then rank
 * them. Mirrors upstream's runRules: a payee indexer + an imported_payee
 * firstchar indexer return the rules keyed on the transaction's values plus the
 * wildcard rules (those without such a condition); their union is the candidate
 * set. This never drops a rule that could match — each returned rule's
 * conditions are still evaluated in apply()/evalConditions — so it is a pure
 * optimization of the linear scan.
 */
function getApplicableRankedRules(rules: Rule[], transaction: Record<string, unknown>): Rule[] {
  const firstcharIndexer = new RuleIndexer({ field: "imported_payee", method: "firstchar" });
  const payeeIndexer = new RuleIndexer({ field: "payee" });
  for (const rule of rules) {
    firstcharIndexer.index(rule);
    payeeIndexer.index(rule);
  }
  const applicable = fastSetMerge(
    firstcharIndexer.getApplicableRules(transaction),
    payeeIndexer.getApplicableRules(transaction),
  );
  return rankRules([...applicable]);
}

/**
 * Run all applicable rules against a transaction in ranked order.
 * Returns a new transaction object with all applicable rules applied.
 */
export function runRules(
  rules: Rule[],
  transaction: Record<string, unknown>,
): Record<string, unknown> {
  const ranked = getApplicableRankedRules(rules, transaction);
  let result = { ...transaction };
  for (const rule of ranked) {
    result = rule.apply(result);
  }
  return result;
}

/**
 * Like runRules, but split-aware: a matching rule with `set-split-amount`
 * actions produces `subtransactions`. Used by schedule previews and the
 * system-generated posting path.
 */
export function runRulesWithSplits(
  rules: Rule[],
  transaction: Record<string, unknown>,
): Record<string, unknown> {
  const ranked = getApplicableRankedRules(rules, transaction);
  let result = { ...transaction };
  for (const rule of ranked) {
    if (rule.evalConditions(result)) {
      result = execActionsWithSplits(rule.actions, result);
    }
  }
  return result;
}
