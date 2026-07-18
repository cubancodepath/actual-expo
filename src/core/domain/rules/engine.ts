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
import { rankRules } from "./rule-utils";
import { execActionsWithSplits } from "./splitActions";

/**
 * Run all rules against a transaction in ranked order.
 * Returns a new transaction object with all applicable rules applied.
 */
export function runRules(
  rules: Rule[],
  transaction: Record<string, unknown>,
): Record<string, unknown> {
  const ranked = rankRules(rules);
  let result = { ...transaction };
  for (const rule of ranked) {
    result = rule.apply(result);
  }
  return result;
}

/**
 * Like runRules, but split-aware: a matching rule with `set-split-amount`
 * actions produces `subtransactions`. Used by schedule previews (the default
 * runRules stays non-split for the posting/import/form paths).
 */
export function runRulesWithSplits(
  rules: Rule[],
  transaction: Record<string, unknown>,
): Record<string, unknown> {
  const ranked = rankRules(rules);
  let result = { ...transaction };
  for (const rule of ranked) {
    if (rule.evalConditions(result)) {
      result = execActionsWithSplits(rule.actions, result);
    }
  }
  return result;
}
