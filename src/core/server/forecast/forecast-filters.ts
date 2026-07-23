/**
 * Report-filter matching for the forecast. Upstream (forecast-filters.ts)
 * converts report conditions to AQL (`conditionsToAQL`) and applies them both in
 * the DB query and via an in-memory `matchesAQLFilter` evaluator. Our rules
 * `Condition` class ALREADY parses and evaluates a condition against a
 * transaction object (`.eval(txn)`) — the exact in-memory matcher — so we reuse
 * it instead of duplicating the AQL machinery. Same matching behavior.
 *
 * The same matcher is applied to posted transactions and to synthetic schedule
 * occurrences, both shaped as rules-style txn objects.
 *
 * Efficiency note (equivalent today, revisit later): upstream pushes the report
 * filter into the SQL query for POSTED transactions (SQLite filters natively;
 * fewer rows cross into JS), while we fetch all account transactions and filter
 * in JS. With no `conditions` caller yet and bounded per-account histories on
 * mobile, these are effectively equal (ours skips the AQL compile). FUTURE
 * OPTIMIZATION — if report filters get a UI AND accounts have huge histories,
 * port `conditionsToAQL` to filter posted txns in SQL and keep `Condition.eval`
 * for the synthetic occurrences (a hybrid: DB-side for posted, in-memory for
 * occurrences, which can't be filtered in the DB).
 *
 * Known gap vs upstream (report filters have no caller in the app yet): the
 * `category IS null` special-case (which upstream also requires not-transfer /
 * not-parent) is not expanded.
 */
import { Condition } from "@/core/domain/rules/condition";
import { getAccountRestrictionMode } from "./forecast-accounts";
import type { RuleCondition } from "@/core/types/models";

export type ForecastFilter = {
  match: (txn: Record<string, unknown>) => boolean;
  plainConditions: RuleCondition[];
  resolvedConditionsOp: "and" | "or";
  canRestrictAccounts: boolean;
};

export function buildForecastFilter(
  conditions?: RuleCondition[],
  conditionsOp?: "and" | "or",
): ForecastFilter {
  const resolvedConditionsOp = conditionsOp ?? "and";
  const plainConditions = (conditions ?? []).filter(
    (c) => !(c as { customName?: unknown }).customName,
  );

  const built: Condition[] = [];
  for (const c of plainConditions) {
    try {
      built.push(new Condition(c.op, c.field, c.value, c.options as Record<string, unknown>));
    } catch {
      // Invalid condition — skip (mirrors upstream's conditionsToAQL try/catch).
    }
  }

  const match = (txn: Record<string, unknown>): boolean => {
    if (built.length === 0) return true;
    return resolvedConditionsOp === "or"
      ? built.some((c) => c.eval(txn))
      : built.every((c) => c.eval(txn));
  };

  return {
    match,
    plainConditions,
    resolvedConditionsOp,
    canRestrictAccounts: getAccountRestrictionMode(plainConditions, resolvedConditionsOp),
  };
}
