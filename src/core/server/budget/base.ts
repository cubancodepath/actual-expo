/**
 * Budget-type-agnostic cell building — the parts the envelope (envelope.ts)
 * and tracking (tracking.ts) formula sets share, plus the month range every
 * build works over. Upstream's `server/budget/base.ts` holds the same things.
 *
 * Keep this module a leaf: sheet.ts imports it to drive a build, so importing
 * sheet.ts back (as the old resetBudgetCache did) would close a cycle.
 */

import type { Spreadsheet, CellValue } from "@/core/server/spreadsheet/spreadsheet";
import { sheetForMonth, envelopeBudget } from "@/core/server/spreadsheet/bindings";
import { firstSync, first, runQuerySync } from "@/core/server/db";
import { monthToInt, currentMonth, intToStr, addMonths } from "@/core/shared/months";
import { ALIVE_TX_FILTER } from "@/core/server/db/filters";
import { warmSpent } from "@/core/server/spreadsheet/warm-cache";
import type { Category, CategoryGroup } from "@/core/types/models";
// base ↔ envelope/tracking is circular, exactly as upstream has it: the engines
// import the shared cell builders from here, and the dispatcher below needs
// their per-engine handlers. Safe because every use is inside a function.
import {
  handleCategoryChange as envelopeHandleCategoryChange,
  handleCategoryGroupChange as envelopeHandleCategoryGroupChange,
} from "./envelope";
import {
  handleCategoryChange as trackingHandleCategoryChange,
  handleCategoryGroupChange as trackingHandleCategoryGroupChange,
} from "./tracking";

export function num(v: CellValue): number {
  return typeof v === "number" ? v : 0;
}

function monthRange(start: string, end: string): string[] {
  const months: string[] = [];
  let current = start;
  while (current <= end) {
    months.push(current);
    current = addMonths(current, 1);
  }
  return months;
}

/**
 * The [start, end] month range to build budget cells for, and the list of
 * months in between. Independent of budget type (envelope vs tracking) —
 * based purely on transaction history and today's date.
 */
export async function getBudgetRange(): Promise<{
  start: string;
  end: string;
  months: string[];
}> {
  const row = await first<{ d: number | null }>(
    "SELECT MIN(date) as d FROM transactions WHERE tombstone = 0",
  );

  const today = currentMonth();
  let startMonth: string;

  if (row?.d) {
    const dateStr = intToStr(row.d);
    startMonth = dateStr ? addMonths(dateStr.slice(0, 7), -3) : addMonths(today, -3);
  } else {
    startMonth = addMonths(today, -3);
  }

  // On mobile we default to a tighter initial range (3 before → 3 ahead)
  // to reduce startup time. Cells for earlier/later months are created
  // on demand via ensureMonthRange() when the user navigates to them.
  const endMonth = addMonths(today, 3);

  return {
    start: startMonth,
    end: endMonth,
    months: monthRange(startMonth, endMonth),
  };
}

/**
 * Per-category "sum-amount-<id>" SQL cell — total spent/received in the
 * month, for ALL categories (income + expense). Identical query and cell
 * name in both envelope and tracking mode (upstream: budget/base.ts
 * createCategory). Must stay a leaf cell (dependencies: []) — it's the one
 * triggerBudgetChanges marks dirty directly via the "sum-amount-" prefix
 * index entry (see spreadsheet.ts's QUERYABLE_PREFIXES).
 */
export function createSpentCells(ss: Spreadsheet, month: string, categories: Category[]): void {
  const sheet = sheetForMonth(month);
  const monthInt = monthToInt(month);
  const startDate = monthInt * 100 + 1;
  const endDate = monthInt * 100 + 31;

  for (const cat of categories) {
    ss.createDynamic(sheet, envelopeBudget.catSpent(cat.id), {
      dependencies: [],
      run: () => {
        // Batch path during init/ensureMonthRange (see warm-cache.ts).
        const cached = warmSpent(monthInt, cat.id);
        if (cached !== undefined) return cached;

        const row = firstSync<{ total: number }>(
          `SELECT SUM(t.amount) AS total
           FROM transactions t
           LEFT JOIN category_mapping cm ON cm.id = t.category
           LEFT JOIN accounts a ON a.id = t.acct
           WHERE ${ALIVE_TX_FILTER} AND t.date >= ? AND t.date <= ? AND a.offbudget = 0
             AND COALESCE(cm.transferId, t.category) = ?`,
          [startDate, endDate, cat.id],
        );
        return row?.total ?? 0;
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Cell invalidation — port of upstream's budget/base.ts dispatcher
// ---------------------------------------------------------------------------
//
// Given the rows as they were before a sync batch and as they are after it,
// work out which cells changed meaning. Upstream reaches the live spreadsheet
// through `sheet.get()`; we take it as a parameter instead, because sheet.ts
// imports THIS module to drive a build and importing it back would close a
// cycle (see the docblock at the top). Same reason envelope.ts/tracking.ts take
// `ss` — it's the house pattern, not a new one.

/** `dataset → rowId → row`, the shape both snapshots come in. */
type DataMap = Record<string, Record<string, Record<string, unknown>>>;

/**
 * Datasets whose rows can change what a budget cell evaluates to. Single source
 * of truth — both mutation paths (local `sendMessages`, incoming `fullSync`)
 * check it before doing any of this work.
 */
export const BUDGET_TABLES = new Set([
  "zero_budgets",
  "reflect_budgets",
  "zero_budget_months",
  "transactions",
  "accounts",
  "category_mapping",
  "categories", // handleCategoryChange wires a new/removed category into its group
  "category_groups", // handleCategoryGroupChange wires a group into the month totals
  "preferences", // watched for the budgetType row — see triggerStructuralChanges
]);

type Row = Record<string, unknown>;

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

/** The category fields the cell builders need, out of a raw DB row. */
function rowToCategory(r: Row): Category & { tombstone?: boolean } {
  return {
    id: String(r.id),
    name: String(r.name ?? ""),
    group: String(r.cat_group ?? ""),
    is_income: r.is_income === 1,
    hidden: r.hidden === 1,
    sort_order: typeof r.sort_order === "number" ? r.sort_order : null,
    goal_def: (r.goal_def as string | null) ?? null,
    tombstone: r.tombstone === 1,
  };
}

/** The group fields the cell builders need, out of a raw DB row. */
function rowToGroup(r: Row): CategoryGroup & { tombstone?: boolean } {
  return {
    id: String(r.id),
    name: String(r.name ?? ""),
    is_income: r.is_income === 1,
    hidden: r.hidden === 1,
    sort_order: typeof r.sort_order === "number" ? r.sort_order : null,
    tombstone: r.tombstone === 1,
  };
}

/** Field names whose value differs between two snapshots of the same row. */
function changedFields(oldRow: Row | undefined, newRow: Row): Set<string> {
  const changed = new Set<string>();
  for (const key of Object.keys(newRow)) {
    if (!oldRow || oldRow[key] !== newRow[key]) changed.add(key);
  }
  return changed;
}

/** YYYYMM (as int or string) → "YYYY-MM", the form sheet names are keyed on. */
function monthOfInt(month: unknown): string | null {
  const s = String(month);
  return /^\d{6}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4)}` : null;
}

/** Dates are stored as YYYYMMDD ints, so the month is just the leading 6. */
function monthOfDate(date: unknown): string | null {
  if (typeof date !== "number") return null;
  return monthOfInt(Math.trunc(date / 100));
}

export function getBudgetType(ss: Spreadsheet): "envelope" | "tracking" {
  return ss.meta().budgetType ?? "envelope";
}

/**
 * A transaction's spend lands in exactly one cell: its category, in its month.
 * Called twice per changed transaction — once with the old row, once with the
 * new — so a transaction that moved month or category clears the cell it left
 * as well as the one it landed in.
 */
function handleTransactionChange(ss: Spreadsheet, transaction: Row, changed: Set<string>): void {
  const relevant =
    changed.has("date") ||
    changed.has("acct") ||
    changed.has("amount") ||
    changed.has("category") ||
    changed.has("tombstone") ||
    changed.has("isParent");
  if (!relevant) return;

  const month = monthOfDate(transaction.date);
  const category = str(transaction.category);
  if (!month || !category) return;

  ss.recompute(sheetForMonth(month), `sum-amount-${category}`);
}

/**
 * Which category a transaction's spend is attributed to. Both ends of the move
 * are recomputed: where it used to land and where it lands now. A brand-new
 * category maps to itself, so both ends are the same id and it has no cells
 * yet — which is why creating one costs nothing.
 */
function handleCategoryMappingChange(
  ss: Spreadsheet,
  months: string[],
  oldValue: Row | undefined,
  newValue: Row,
): void {
  for (const month of months) {
    const sheet = sheetForMonth(month);
    const oldTransfer = oldValue && str(oldValue.transferId);
    if (oldTransfer) ss.recompute(sheet, `sum-amount-${oldTransfer}`);
    const newTransfer = str(newValue.transferId);
    if (newTransfer) ss.recompute(sheet, `sum-amount-${newTransfer}`);
  }
}

/**
 * An account going on/off budget changes whether its transactions count toward
 * the budget at all — so every category it has ever been spent on is stale.
 * Only those categories, though: a full sweep is what used to block the thread.
 */
function handleAccountChange(
  ss: Spreadsheet,
  months: string[],
  oldValue: Row | undefined,
  newValue: Row,
): void {
  if (oldValue && oldValue.offbudget === newValue.offbudget) return;

  const rows = runQuerySync<{ category: string | null }>(
    `SELECT DISTINCT(category) AS category FROM transactions WHERE acct = ?`,
    [String(newValue.id)],
  );

  for (const month of months) {
    const sheet = sheetForMonth(month);
    for (const row of rows) {
      if (row.category) ss.recompute(sheet, `sum-amount-${row.category}`);
    }
  }
}

// Divergence from upstream, and the reason these two recompute instead of
// `set()`: upstream's budget/carryover/goal/buffered cells are STATIC, written
// from the row that just changed. Ours are dynamic leaf cells that read the row
// back themselves (see `createBudgetCells` — `firstSync` over zero_budgets),
// which is what lets the warm cache seed them. So the row is already on disk by
// the time we get here, and all these handlers have to do is mark it stale.

/** The month's carry-in buffer. */
function handleBudgetMonthChange(ss: Spreadsheet, budget: Row): void {
  const id = str(budget.id);
  if (!id) return;
  ss.recompute(sheetForMonth(id), "buffered");
}

/**
 * A budgeted amount — same four fields the cold build seeds, and the symmetry
 * between the two is load-bearing.
 */
function handleBudgetChange(ss: Spreadsheet, budget: Row): void {
  const category = str(budget.category);
  const month = monthOfInt(budget.month);
  if (!category || !month) return;

  const sheet = sheetForMonth(month);
  ss.recompute(sheet, `budget-${category}`);
  ss.recompute(sheet, `carryover-${category}`);
  ss.recompute(sheet, `goal-${category}`);
  ss.recompute(sheet, `long-goal-${category}`);
}

/**
 * Route each changed row to the handler that knows which cells it invalidates.
 * Wrapped in one transaction so a batch produces a single recompute pass.
 *
 * Divergence from upstream, deliberate: `categories` and `category_groups` are
 * not handled here yet — they still go through sheet.ts's structural refresh.
 * Porting `handleCategoryChange` needs mutable dependency edges in the engine,
 * which is its own piece of work.
 */
export function triggerBudgetChanges(
  ss: Spreadsheet,
  oldValues: DataMap,
  newValues: DataMap,
  months: string[],
): void {
  ss.startTransaction();
  try {
    for (const [table, rows] of Object.entries(newValues)) {
      const old = oldValues[table];

      for (const [id, newValue] of Object.entries(rows)) {
        const oldValue = old?.[id];

        if (table === "zero_budget_months") {
          handleBudgetMonthChange(ss, newValue);
        } else if (table === "zero_budgets" || table === "reflect_budgets") {
          handleBudgetChange(ss, newValue);
        } else if (table === "transactions") {
          const changed = changedFields(oldValue, newValue);
          if (oldValue) handleTransactionChange(ss, oldValue, changed);
          handleTransactionChange(ss, newValue, changed);
        } else if (table === "category_mapping") {
          handleCategoryMappingChange(ss, months, oldValue, newValue);
        } else if (table === "accounts") {
          handleAccountChange(ss, months, oldValue, newValue);
        } else if (table === "categories") {
          const handle =
            getBudgetType(ss) === "tracking"
              ? trackingHandleCategoryChange
              : envelopeHandleCategoryChange;
          handle(ss, months, oldValue, rowToCategory(newValue));
        } else if (table === "category_groups") {
          const handle =
            getBudgetType(ss) === "tracking"
              ? trackingHandleCategoryGroupChange
              : envelopeHandleCategoryGroupChange;
          handle(ss, months, oldValue, rowToGroup(newValue));
        }
      }
    }
  } finally {
    ss.endTransaction();
  }
}
