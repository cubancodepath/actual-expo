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
