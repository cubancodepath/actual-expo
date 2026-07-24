/**
 * makeReportFilters — builds the AQL filter array a report spreadsheet bakes
 * into its transaction query, from a widget's report conditions. Stands in for
 * upstream's `make-filters-from-conditions` handler.
 *
 * This codebase deliberately does not port `conditionsToAQL` (the flat AQL
 * compiler can't express `$regexp` or dotted ref-paths like `account.offbudget`;
 * see `core/server/forecast/forecast-filters.ts`, which matches conditions
 * in-memory instead). Widgets with report conditions are converted here only for
 * the subset the compiler supports; unsupported conditions are handled per-widget
 * (in-memory) as those widgets land.
 *
 * For now: widgets with no conditions (net-worth, cash-flow defaults) get an
 * empty filter set, which the compiler treats as "match everything".
 */
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

  // Conditions present: converted per-widget as those widgets land. Until then
  // the widget's card is responsible for its own condition handling.
  throw new Error("makeReportFilters: report conditions not yet supported for this widget");
}
