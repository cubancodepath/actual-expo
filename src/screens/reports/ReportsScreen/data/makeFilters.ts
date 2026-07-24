/**
 * makeReportFilters — builds the AQL filter array a report spreadsheet bakes
 * into its transaction query, from a widget's report conditions. Stands in for
 * upstream's `make-filters-from-conditions` handler, delegating to the faithful
 * `conditionsToAQL` port.
 *
 * Conditions with a `customName` are dropped (they are UI labels, not filters),
 * mirroring upstream's handler behaviour.
 *
 * `$regexp` conditions (matches / hasTags / hasAnyTag) compile fine here but
 * throw `RegexpUnsupportedError` in the expo-sqlite dialect when the query runs;
 * the owning widget catches that and falls back per-widget.
 */
import { conditionsToAQL } from "@/core/server/transactions/transaction-rules";
import type { RuleCondition } from "@/core/types/models";
import type { ObjectExpression } from "@/core/queries";

export type ReportFilters = {
  filters: ObjectExpression[];
  conditionsOpKey: "$and" | "$or";
};

export function makeReportFilters(
  conditions: RuleCondition[] | undefined,
  conditionsOp: "and" | "or" = "and",
): ReportFilters {
  const conditionsOpKey = conditionsOp === "or" ? "$or" : "$and";
  const active = (conditions ?? []).filter((c) => !(c as { customName?: unknown }).customName);

  // No conditions → no filters (compiler treats empty $and/$or as match-all).
  if (active.length === 0) {
    return { filters: [], conditionsOpKey };
  }

  const { filters } = conditionsToAQL(active);
  return { filters, conditionsOpKey };
}
