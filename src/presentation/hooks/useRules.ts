/**
 * useRules — reactive rules via liveQuery.
 * Replaces useRulesStore for data reads.
 * Post-processes rows to parse JSON conditions/actions into ParsedRule.
 */

import { useMemo } from "react";
import { q } from "@/queries";
import { useLiveQuery } from "./useQuery";
import type { ParsedRule, RuleCondition, RuleAction, RuleStage } from "@/rules/types";

export function useRules() {
  const { data: rows, isLoading } = useLiveQuery<Record<string, unknown>>(
    () => q("rules").filter({ $and: [{ conditions: { $ne: null } }, { actions: { $ne: null } }] }),
    [],
  );

  const rules = useMemo<ParsedRule[]>(
    () =>
      (rows ?? []).map((row) => ({
        id: row.id as string,
        stage: ((row.stage as string) ?? null) as RuleStage,
        conditions: (row.conditions as RuleCondition[]) ?? [],
        actions: (row.actions as RuleAction[]) ?? [],
        conditionsOp: ((row.conditions_op as string) ?? "and") as "and" | "or",
      })),
    [rows],
  );

  return { rules, isLoading };
}
