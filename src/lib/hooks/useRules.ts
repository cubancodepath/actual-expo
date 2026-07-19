/**
 * useRules — reactive rules via liveQuery.
 *
 * Delegates parsing/instantiation to the domain `makeRule`, so these rules go
 * through the same field-expansion AND `migrateIds` id-projection as
 * `getRules()` — a rule written against a since-merged payee/category resolves
 * to the merge target here too (keeps `suggestCategoryForPayee`'s indexer keys
 * in the same id space as the lookup). Invalid rules are silently skipped.
 *
 * Limitation: this memo re-runs on rules-table changes, not on mapping-table
 * changes. In practice the merge/delete flows that change mappings also remount
 * the forms that consume this hook, so the projection is fresh on next mount.
 */

import { useMemo } from "react";
import { q } from "@/core/queries";
import { useLiveQuery } from "@/hooks/useQuery";
import { makeRule, type Rule } from "@/core/domain/rules";
import type { RuleRow } from "@/core/db/types";

export function useRules() {
  const { data: rows, isLoading } = useLiveQuery<Record<string, unknown>>(
    () => q("rules").filter({ $and: [{ conditions: { $ne: null } }, { actions: { $ne: null } }] }),
    [],
  );

  const rules = useMemo<Rule[]>(() => {
    const result: Rule[] = [];
    for (const row of rows ?? []) {
      const rule = makeRule(row as unknown as RuleRow);
      if (rule) result.push(rule);
    }
    return result;
  }, [rows]);

  return { rules, isLoading };
}
