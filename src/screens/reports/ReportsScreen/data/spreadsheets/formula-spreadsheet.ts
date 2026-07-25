/**
 * Formula spreadsheet — read-only port of desktop-client's
 * `useFormulaExecution`. Evaluates a Formula widget's `=…` expression against
 * the Hermes-safe formula engine and returns a single number or string.
 *
 * The evaluation is a 3-pass / 2-prefetch dance, because Actual's custom
 * functions (QUERY, QUERY_COUNT, QUERY_EXTRACT_*, BUDGET_QUERY) are two-phase:
 * a pass records which named queries the formula asks for, we prefetch their
 * data, then re-evaluate with the data in place. BUDGET_QUERY composes on top of
 * QUERY_EXTRACT_*, so it needs a second collect/prefetch round.
 *
 * Mechanical substitutions vs upstream:
 *  - `send('make-filters-from-conditions')` → `makeReportFilters`
 *  - `send('query', …)`                     → `aqlQuery`
 *  - `send('get-categories')`               → `getCategories` / `getCategoriesGrouped`
 *  - `send('envelope-budget-month')`        → `getBudgetMonth` (per-category cents
 *      are already computed by the budget engine, so balance dimensions read
 *      `carryIn` / `balance` directly instead of re-simulating carryover)
 */

import { HyperFormula } from "hyperformula";

import { q } from "@/lib/queries";
import { aqlQuery } from "@/core/server/aql";
import { getCategories, getCategoriesGrouped } from "@/core/server/budget";
import { getBudgetMonth } from "@/core/server/budget/actions";
import { bootstrapFormulas } from "@/core/shared/formulas/bootstrap";
import {
  createBudgetQueryPrefetchKey,
  type BudgetQueryRequest,
  type FormulaQueryContext,
} from "@/core/shared/formulas/customFunctions";
import * as monthUtils from "@/core/shared/monthUtils";
import { integerToAmount } from "@/core/shared/util";
import type { RuleCondition } from "@/core/types/models";
import type { TimeFrame } from "@/core/types/models/dashboard";
import { calculateTimeRange } from "../reportRanges";
import { makeReportFilters } from "../makeFilters";

export type QueryConfig = {
  conditions?: RuleCondition[];
  conditionsOp?: "and" | "or";
  timeFrame?: TimeFrame;
};
export type QueriesMap = Record<string, QueryConfig>;

export type FormulaData = { result: number | string | null; error: string | null };

const DATE_FORMATS = ["DD/MM/YYYY", "YYYY-MM-DD", "YYYY/MM/DD"];

function isEngineError(value: unknown): value is { type: string; message?: string } {
  return !!value && typeof value === "object" && "type" in value;
}

/** One throwaway engine per evaluation pass, matching upstream. */
function evaluateWithContext(
  formula: string,
  context: FormulaQueryContext,
  throwOnError: boolean,
): number | string | null {
  const hf = HyperFormula.buildEmpty({
    licenseKey: "gpl-v3",
    language: "enUS",
    dateFormats: DATE_FORMATS,
    context: { formulaQuery: context },
  });
  try {
    const sheetId = hf.getSheetId(hf.addSheet("Sheet1"));
    if (sheetId === undefined) throw new Error("Failed to create sheet");
    hf.setCellContents({ sheet: sheetId, col: 0, row: 0 }, [[formula]]);
    const cell = hf.getCellValue({ sheet: sheetId, col: 0, row: 0 });
    if (isEngineError(cell)) {
      if (throwOnError) throw new Error(`Formula error: ${cell.message || cell.type}`);
      return null;
    }
    return cell as number | string;
  } finally {
    hf.destroy();
  }
}

function createContext(): Required<FormulaQueryContext> {
  return {
    queryNames: new Set(),
    queryCountNames: new Set(),
    queryExtractCategoryNames: new Set(),
    queryExtractTimeframeStartNames: new Set(),
    queryExtractTimeframeEndNames: new Set(),
    budgetQueryRequests: new Map(),
    querySumPrefetch: new Map(),
    queryCountPrefetch: new Map(),
    queryExtractCategoriesPrefetch: new Map(),
    queryExtractTimeframeStartPrefetch: new Map(),
    queryExtractTimeframeEndPrefetch: new Map(),
    budgetQueryPrefetch: new Map(),
    budgetQueryErrors: new Map(),
  };
}

// ── Query → AQL ──────────────────────────────────────────────────────────────

function buildTransactionQuery(config: QueryConfig) {
  const { filters, conditionsOpKey } = makeReportFilters(
    config.conditions,
    config.conditionsOp ?? "and",
  );

  let query = q("transactions");

  if (config.timeFrame?.mode) {
    const [start, end] = calculateTimeRange(config.timeFrame, undefined, monthUtils.currentDay());
    query = query.filter({
      $and: [
        { date: { $gte: monthUtils.firstDayOfMonth(start) } },
        { date: { $lte: monthUtils.lastDayOfMonth(end) } },
      ],
    });
  }

  if (filters.length > 0) {
    query = query.filter({ [conditionsOpKey]: filters });
  }

  return query;
}

async function fetchQuerySum(config: QueryConfig): Promise<number> {
  try {
    const query = buildTransactionQuery(config).select([{ amount: { $sum: "$amount" } }]);
    const { data } = await aqlQuery<Array<{ amount: number }>>(query);
    return integerToAmount(data[0]?.amount ?? 0, 2);
  } catch (err) {
    console.error("[formula] query sum failed:", err);
    return 0;
  }
}

async function fetchQueryCount(config: QueryConfig): Promise<number> {
  try {
    const query = buildTransactionQuery(config).select([{ count: { $count: "*" } }]);
    const { data } = await aqlQuery<Array<{ count: number }>>(query);
    return data[0]?.count ?? 0;
  } catch (err) {
    console.error("[formula] query count failed:", err);
    return 0;
  }
}

// ── Category extraction (QUERY_EXTRACT_CATEGORIES) ────────────────────────────

function categoryConditions(conditions: RuleCondition[]): RuleCondition[] {
  return conditions.filter(
    (c) =>
      !(c as { customName?: unknown }).customName &&
      (c.field === "category" || c.field === "category_group"),
  );
}

async function extractCategories(name: string, queries: QueriesMap): Promise<string[]> {
  const config = queries[name];
  if (!config) return [];

  const conditions = categoryConditions(config.conditions ?? []);
  const categories = await getCategories();

  if (conditions.length === 0) {
    return categories.filter((c) => !c.is_income && !c.hidden).map((c) => c.id);
  }

  const groups = await getCategoriesGrouped();
  const groupNameById = new Map(groups.map((g) => [g.id, g.name]));

  const perCondition = conditions.map((cond) => {
    const matching = categories.filter((cat) => {
      const key = cond.field === "category_group" ? cat.group : cat.id;
      const text = cond.field === "category_group" ? (groupNameById.get(key) ?? key) : cat.name;
      const value = cond.value;
      switch (cond.op) {
        case "is":
          return value === key;
        case "isNot":
          return value !== key;
        case "oneOf":
          return Array.isArray(value) && value.includes(key);
        case "notOneOf":
          return Array.isArray(value) && !value.includes(key);
        case "contains":
          return text.toLowerCase().includes(String(value).toLowerCase());
        case "doesNotContain":
          return !text.toLowerCase().includes(String(value).toLowerCase());
        case "matches":
          try {
            return new RegExp(String(value), "i").test(text);
          } catch {
            return false;
          }
        default:
          return false;
      }
    });
    return new Set(matching.map((c) => c.id));
  });

  if ((config.conditionsOp ?? "and") === "or") {
    return Array.from(new Set(perCondition.flatMap((s) => Array.from(s))));
  }
  if (perCondition.length === 0) return [];
  return Array.from(perCondition[0]).filter((id) => perCondition.every((s) => s.has(id)));
}

function extractTimeframe(name: string, queries: QueriesMap, which: "start" | "end"): string {
  const config = queries[name];
  if (!config?.timeFrame) return monthUtils.currentMonth();
  const [start, end] = calculateTimeRange(config.timeFrame, undefined, monthUtils.currentDay());
  return which === "start" ? start : end;
}

// ── BUDGET_QUERY ─────────────────────────────────────────────────────────────

const BUDGET_DIMENSIONS = new Set(["budgeted", "spent", "balance_start", "balance_end", "goal"]);

async function monthCategoryMap(month: string) {
  const budget = await getBudgetMonth(month);
  const map = new Map<
    string,
    { budgeted: number; spent: number; balance: number; carryIn: number; goal: number }
  >();
  for (const group of budget.groups) {
    for (const cat of group.categories) {
      map.set(cat.id, {
        budgeted: cat.budgeted,
        spent: cat.spent,
        balance: cat.balance,
        carryIn: cat.carryIn,
        goal: cat.goal ?? 0,
      });
    }
  }
  return map;
}

async function fetchBudgetDimension(request: BudgetQueryRequest): Promise<number> {
  const dim = request.dimension.toLowerCase();
  if (!BUDGET_DIMENSIONS.has(dim)) {
    throw new Error(`Invalid BUDGET_QUERY dimension: ${request.dimension}`);
  }

  const months = monthUtils.rangeInclusive(request.startMonth, request.endMonth);
  if (months.length === 0) return 0;

  const sumField = async (
    pick: (c: { budgeted: number; spent: number; goal: number }) => number,
  ) => {
    let total = 0;
    for (const month of months) {
      const map = await monthCategoryMap(month);
      for (const catId of request.categoryIds) {
        const cat = map.get(catId);
        if (cat) total += pick(cat);
      }
    }
    return total;
  };

  if (dim === "budgeted") return integerToAmount(await sumField((c) => c.budgeted), 2);
  if (dim === "spent") return integerToAmount(await sumField((c) => c.spent), 2);
  if (dim === "goal") return integerToAmount(await sumField((c) => c.goal), 2);

  // balance_start = balance carried into the first month (carryIn);
  // balance_end   = balance at the end of the last month (includes activity).
  const targetMonth = dim === "balance_start" ? months[0] : months[months.length - 1];
  const map = await monthCategoryMap(targetMonth);
  let total = 0;
  for (const catId of request.categoryIds) {
    const cat = map.get(catId);
    if (cat) total += dim === "balance_start" ? cat.carryIn : cat.balance;
  }
  return integerToAmount(total, 2);
}

// ── Prefetch phases ──────────────────────────────────────────────────────────

async function prefetchQueries(ctx: Required<FormulaQueryContext>, queries: QueriesMap) {
  for (const name of ctx.queryNames) {
    const config = queries[name];
    ctx.querySumPrefetch.set(name, config ? await fetchQuerySum(config) : 0);
  }
  for (const name of ctx.queryCountNames) {
    const config = queries[name];
    ctx.queryCountPrefetch.set(name, config ? await fetchQueryCount(config) : 0);
  }
  for (const name of ctx.queryExtractCategoryNames) {
    ctx.queryExtractCategoriesPrefetch.set(name, await extractCategories(name, queries));
  }
  for (const name of ctx.queryExtractTimeframeStartNames) {
    ctx.queryExtractTimeframeStartPrefetch.set(name, extractTimeframe(name, queries, "start"));
  }
  for (const name of ctx.queryExtractTimeframeEndNames) {
    ctx.queryExtractTimeframeEndPrefetch.set(name, extractTimeframe(name, queries, "end"));
  }
}

async function prefetchBudgetQueries(ctx: Required<FormulaQueryContext>) {
  for (const [key, request] of ctx.budgetQueryRequests) {
    try {
      ctx.budgetQueryPrefetch.set(key, await fetchBudgetDimension(request));
      ctx.budgetQueryErrors.delete(key);
    } catch (err) {
      ctx.budgetQueryPrefetch.delete(key);
      ctx.budgetQueryErrors.set(key, err instanceof Error ? err.message : String(err));
    }
  }
  // Keys are recomputed on the final pass; keep the map for the plugin to read.
  void createBudgetQueryPrefetchKey;
}

// ── Public factory ───────────────────────────────────────────────────────────

export function formulaSpreadsheet(formula: string, queries: QueriesMap) {
  return async (setData: (data: FormulaData) => void) => {
    if (!formula || !formula.startsWith("=")) {
      setData({ result: null, error: "Formula must start with =" });
      return;
    }

    bootstrapFormulas();
    const ctx = createContext();

    try {
      // Pass 1 — collect QUERY / QUERY_COUNT / QUERY_EXTRACT_* names.
      evaluateWithContext(formula, ctx, false);
      await prefetchQueries(ctx, queries);

      // Pass 2 — re-evaluate so QUERY_EXTRACT_* resolve, collecting the now-correct
      // BUDGET_QUERY requests, then prefetch them.
      ctx.budgetQueryRequests.clear();
      evaluateWithContext(formula, ctx, false);
      await prefetchBudgetQueries(ctx);

      // Pass 3 — authoritative evaluation with every prefetch in place.
      const result = evaluateWithContext(formula, ctx, true);
      setData({ result, error: null });
    } catch (err) {
      setData({ result: null, error: err instanceof Error ? err.message : String(err) });
    }
  };
}
