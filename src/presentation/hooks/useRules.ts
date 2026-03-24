/**
 * useRules — reactive rules via liveQuery.
 * Parses JSON conditions/actions and instantiates Rule class instances.
 * Invalid rules are silently skipped (matching loot-core behavior).
 */

import { useMemo } from "react";
import { q } from "@core/queries";
import { useLiveQuery } from "./useQuery";
import { Rule } from "@core/rules/rule";
import { RuleError } from "@core/rules/errors";
import type { RuleStage } from "@core/rules/types";

// Internal→public field mapping (same as index.ts)
const INTERNAL_TO_PUBLIC: Record<string, string> = {
  acct: "account",
  description: "payee",
  imported_description: "imported_payee",
  transferred_id: "transfer_id",
  isParent: "is_parent",
  isChild: "is_child",
};

function fromInternalField(item: Record<string, unknown>): Record<string, unknown> {
  if (item.field && typeof item.field === "string" && INTERNAL_TO_PUBLIC[item.field]) {
    return { ...item, field: INTERNAL_TO_PUBLIC[item.field] };
  }
  return item;
}

function safeParseJson(str: unknown): unknown[] {
  if (!str || typeof str !== "string") return [];
  try {
    const parsed = JSON.parse(str);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item: Record<string, unknown>) => fromInternalField(item));
  } catch {
    return [];
  }
}

export function useRules() {
  const { data: rows, isLoading } = useLiveQuery<Record<string, unknown>>(
    () => q("rules").filter({ $and: [{ conditions: { $ne: null } }, { actions: { $ne: null } }] }),
    [],
  );

  const rules = useMemo<Rule[]>(() => {
    const result: Rule[] = [];
    for (const row of rows ?? []) {
      try {
        const conditions = safeParseJson(row.conditions);
        const actions = safeParseJson(row.actions);

        if (conditions.length === 0 && actions.length === 0) continue;

        const rule = new Rule({
          id: row.id as string,
          stage: ((row.stage as string) ?? null) as RuleStage,
          conditionsOp: ((row.conditions_op as string) ?? "and") as "and" | "or",
          conditions: conditions as Array<{
            op: string;
            field: string;
            value: unknown;
            options?: Record<string, unknown>;
          }>,
          actions: actions as Array<{
            op: string;
            field?: string;
            value: unknown;
            options?: Record<string, unknown>;
          }>,
        });
        result.push(rule);
      } catch (e) {
        if (e instanceof RuleError) {
          console.warn(`[useRules] Skipping invalid rule ${row.id}: ${e.message}`);
        } else {
          console.warn(`[useRules] Unexpected error for rule ${row.id}:`, e);
        }
      }
    }
    return result;
  }, [rows]);

  return { rules, isLoading };
}
