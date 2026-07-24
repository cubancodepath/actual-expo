/**
 * Sync integration for the spreadsheet engine.
 *
 * Two refresh paths (matching loot-core's pattern):
 * 1. Granular: triggerBudgetChanges() marks SQL cells (deps=[]) dirty after
 *    transaction/budget mutations. Formula cells cascade automatically via
 *    the dependency graph.
 * 2. Structural: Full cell re-creation when categories/groups change.
 */

import { listen } from "@/core/sync/syncEvents";
import type { SyncMessage } from "@/core/sync/encoder";
import { getSpreadsheet } from "@/core/server/spreadsheet/globals";
import * as envelopeEngine from "@/core/server/budget/envelope";
import * as trackingEngine from "@/core/server/budget/tracking";
import { getCategories, getCategoryGroups } from "@/core/server/budget";
import { getBudgetType } from "@/core/server/preferences";
import { getBudgetRange } from "@/core/server/spreadsheet/util";
import {
  warmSpreadsheetCache,
  clearSpreadsheetWarmCache,
} from "@/core/server/spreadsheet/warm-cache";
import { addMonths } from "@/core/shared/months";

type BudgetEngine = {
  createBudgetCells: typeof envelopeEngine.createBudgetCells;
  createAllBudgetCells: typeof envelopeEngine.createAllBudgetCells;
};

/**
 * The active budget-type formula module (envelope.ts or tracking.ts) — both
 * export the same createBudgetCells/createAllBudgetCells contract, so every
 * call site here just needs to know which one to dispatch to for the
 * currently-open file.
 */
async function getEngine(): Promise<BudgetEngine> {
  const type = await getBudgetType();
  return type === "tracking" ? trackingEngine : envelopeEngine;
}

/** Timestamp of last initSpreadsheet — suppresses structural refresh cooldown. */
let lastInitTime = 0;
const INIT_COOLDOWN = 500; // ms — brief cooldown to prevent double-init, short enough for sync refresh

// The contiguous [start, end] month range currently built in the
// spreadsheet ("YYYY-MM" strings, compare lexicographically). Tracked so
// ensureMonthRange() can extend it without ever leaving a gap — budget
// cells depend on the immediately preceding month's cells (from-last-month,
// carryover chains), so every month between the old boundary and a newly
// requested month must be built in ascending order before it's usable.
let builtStart: string | null = null;
let builtEnd: string | null = null;
/** Which engine (envelope/tracking) built the current cells — see runStructuralRefresh. */
let lastEngine: BudgetEngine | null = null;

/** Months per init transaction — each chunk computes synchronously, then the
 * loop yields to the event loop so timers/renders/progress land in between. */
const INIT_CHUNK_MONTHS = 6;

/**
 * Initialize the spreadsheet with budget cells for all months.
 * Called during bootstrap in loadBudget().
 *
 * Divergence from `createAllBudgetCells` (which runs everything in ONE
 * transaction and stays for structural refreshes): months are built in
 * ascending chunks, each in its own transaction, with an event-loop yield
 * between chunks. Cell values are identical — months already build strictly
 * ascending, so every chunk's previous-month cells are computed before the
 * chunk that reads them (same invariant `buildMonthsAscending` relies on) —
 * but the JS thread is no longer blocked for the whole build, so the busy
 * overlay's message/progress can update and timers/touch handlers don't pile
 * up behind one multi-second span. `onProgress` reports built/total months
 * between chunks (core stays UI-free — the caller wires it to the overlay).
 */
export async function initSpreadsheet(
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const ss = getSpreadsheet();
  ss.clear();
  const engine = await getEngine();
  lastEngine = engine;

  const { start, end, months } = await getBudgetRange();
  const [cats, groups] = await Promise.all([getCategories(), getCategoryGroups()]);

  // Batch the leaf-cell reads: a handful of grouped queries replace the
  // thousands of per-cell synchronous ones while the cells compute.
  await warmSpreadsheetCache(start, end);
  try {
    for (let i = 0; i < months.length; i += INIT_CHUNK_MONTHS) {
      const chunk = months.slice(i, i + INIT_CHUNK_MONTHS);
      ss.startTransaction();
      try {
        for (const month of chunk) {
          await engine.createBudgetCells(ss, month, cats, groups);
        }
      } finally {
        ss.endTransaction();
      }

      const done = Math.min(i + INIT_CHUNK_MONTHS, months.length);
      onProgress?.(done, months.length);
      if (done < months.length) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
  } finally {
    clearSpreadsheetWarmCache();
  }

  builtStart = start;
  builtEnd = end;
  lastInitTime = Date.now();
}

/** Ascending walk from `from` to `to` (inclusive), building each month's cells in order. */
async function buildMonthsAscending(
  engine: BudgetEngine,
  ss: ReturnType<typeof getSpreadsheet>,
  from: string,
  to: string,
  cats: Awaited<ReturnType<typeof getCategories>>,
  groups: Awaited<ReturnType<typeof getCategoryGroups>>,
): Promise<void> {
  let cursor = from;
  while (cursor <= to) {
    await engine.createBudgetCells(ss, cursor, cats, groups);
    cursor = addMonths(cursor, 1);
  }
}

/**
 * Extend the built spreadsheet range to cover `month`, filling any gap in
 * ascending month order first. Call before reading budget cells for a month
 * that may be outside the initially-loaded (mobile-tightened) range — e.g.
 * on month-picker navigation — so distant months render real values instead
 * of silently reading 0 from missing prevSheet cells.
 */
export async function ensureMonthRange(month: string): Promise<void> {
  if (builtStart === null || builtEnd === null) return; // not initialized yet
  if (month >= builtStart && month <= builtEnd) return; // already built

  const [engine, cats, groups] = await Promise.all([
    getEngine(),
    getCategories(),
    getCategoryGroups(),
  ]);
  const ss = getSpreadsheet();

  // Batch the gap's leaf-cell reads (same batching as initSpreadsheet).
  const gapStart = month < builtStart ? month : addMonths(builtEnd, 1);
  const gapEnd = month > builtEnd ? month : addMonths(builtStart, -1);
  await warmSpreadsheetCache(gapStart, gapEnd);

  ss.startTransaction();
  try {
    if (month > builtEnd) {
      await buildMonthsAscending(engine, ss, addMonths(builtEnd, 1), month, cats, groups);
      builtEnd = month;
    } else if (month < builtStart) {
      // Walk forward from the new earliest month up to (but not including)
      // the old start, so each month's prevSheet is always already built
      // by the time it's needed.
      await buildMonthsAscending(engine, ss, month, addMonths(builtStart, -1), cats, groups);
      builtStart = month;
    }
  } finally {
    ss.endTransaction();
    clearSpreadsheetWarmCache();
  }
}

// ── Granular budget invalidation (ported from loot-core/budget/base.ts) ──

/**
 * Inspect CRDT messages and mark affected SQL cells (deps=[]) dirty.
 * Formula cells cascade automatically through the dependency graph:
 *   catSpent → groupSpent → totalIncome → incomeAvailable → toBudget
 *   catBudgeted → catBalance → groupBalance → totalBalance → toBudget
 */
export function triggerBudgetChanges(messages: SyncMessage[]): void {
  const ss = getSpreadsheet();
  const affectedCells = new Set<string>();

  // Determine which cell prefixes are affected by the messages
  let touchTransactions = false;
  let touchBudgets = false;
  let touchGoals = false;
  let touchMonths = false;
  // accounts.offbudget/closed/tombstone changes which categories' spending
  // counts toward "on budget" totals; category_mapping (category merges)
  // changes which category a transaction's spend is attributed to. Both
  // affect every "sum-amount-" cell's underlying query the same way a
  // transaction edit does (loot-core: handleAccountChange,
  // handleCategoryMappingChange). We don't track per-account/per-category
  // scope here — a conservative full "sum-amount-" invalidation is cheap
  // via the prefix index and these are rare operations.
  let touchAccountsOrMapping = false;

  for (const msg of messages) {
    if (msg.dataset === "transactions") {
      if (
        msg.column === "amount" ||
        msg.column === "category" ||
        msg.column === "date" ||
        msg.column === "acct" ||
        msg.column === "tombstone" ||
        msg.column === "isParent"
      ) {
        touchTransactions = true;
      }
    } else if (msg.dataset === "zero_budgets" || msg.dataset === "reflect_budgets") {
      if (msg.column === "amount" || msg.column === "carryover") {
        touchBudgets = true;
      } else if (msg.column === "goal" || msg.column === "long_goal") {
        touchGoals = true;
      }
    } else if (msg.dataset === "zero_budget_months") {
      touchMonths = true;
    } else if (msg.dataset === "accounts") {
      if (msg.column === "offbudget" || msg.column === "closed" || msg.column === "tombstone") {
        touchAccountsOrMapping = true;
      }
    } else if (msg.dataset === "category_mapping") {
      touchAccountsOrMapping = true;
    } else if (msg.dataset === "preferences" && msg.row === "budgetType") {
      // The entire formula set differs between envelope and tracking mode —
      // no amount of granular cell invalidation covers that, only a full
      // structural rebuild (upstream: base.ts reads getBudgetType() fresh
      // on every triggerBudgetChanges call for the same reason).
      if (!refreshing) runStructuralRefresh();
      else pendingRefresh = true;
    }
  }

  // O(1) lookup via prefix index — avoids O(N) cell iteration
  if (touchTransactions || touchAccountsOrMapping) {
    // "sum-amount-" cells cascade to: groupSpent → totalIncome → incomeAvailable → toBudget
    for (const name of ss.getCellsByPrefix("sum-amount-")) {
      affectedCells.add(name);
    }
  }
  if (touchBudgets) {
    // "budget-" and "carryover-" cascade to: catBalance → groupBalance → totals → toBudget
    for (const name of ss.getCellsByPrefix("budget-")) {
      affectedCells.add(name);
    }
    for (const name of ss.getCellsByPrefix("carryover-")) {
      affectedCells.add(name);
    }
  }
  if (touchGoals) {
    // "goal-" and "long-goal-" feed the category chip colour (funded/underfunded).
    // Separate prefixes: "long-goal-" does not start with "goal-".
    for (const name of ss.getCellsByPrefix("goal-")) {
      affectedCells.add(name);
    }
    for (const name of ss.getCellsByPrefix("long-goal-")) {
      affectedCells.add(name);
    }
  }
  if (touchMonths) {
    // "buffered" cascades to: bufferedSelected → toBudget
    for (const name of ss.getCellsByPrefix("buffered")) {
      affectedCells.add(name);
    }
  }

  if (__DEV__) {
    console.log(
      `[triggerBudgetChanges] ${affectedCells.size} cells to recompute from ${messages.length} messages`,
    );
  }

  if (affectedCells.size > 0) {
    ss.startTransaction();
    for (const name of affectedCells) {
      ss.recomputeResolved(name);
    }
    ss.endTransaction();
  }
}

// ── Structural refresh (categories/groups changed) ──

let refreshing = false;
let pendingRefresh = false;

async function runStructuralRefresh(): Promise<void> {
  refreshing = true;
  pendingRefresh = false;
  try {
    // Remember any range previously widened by ensureMonthRange() — a
    // structural rebuild only recreates the mobile-tightened default
    // range, so without this the new category's cells for a
    // previously-visited far month would silently go missing again.
    const prevStart = builtStart;
    const prevEnd = builtEnd;

    const ss = getSpreadsheet();
    const engine = await getEngine();
    if (engine !== lastEngine) {
      // Budget type changed since the last build — the entire formula set
      // differs (envelope vs tracking cell names/deps), so the old cells
      // must not linger. A plain categories/groups change reuses the same
      // engine and keeps the cheaper incremental (no-clear) rebuild below.
      ss.clear();
      lastEngine = engine;
    }
    // Same leaf-cell batching as initSpreadsheet (createAllBudgetCells builds
    // this exact range internally).
    const fullRange = await getBudgetRange();
    await warmSpreadsheetCache(fullRange.start, fullRange.end);
    let range: { start: string; end: string };
    try {
      range = await engine.createAllBudgetCells(ss);
    } finally {
      clearSpreadsheetWarmCache();
    }
    builtStart = range.start;
    builtEnd = range.end;

    if (prevStart !== null && prevEnd !== null) {
      if (prevStart < builtStart) await ensureMonthRange(prevStart);
      if (prevEnd > builtEnd) await ensureMonthRange(prevEnd);
    }
  } catch (err) {
    if (__DEV__) console.warn("[spreadsheet/sync] structural refresh failed:", err);
  } finally {
    refreshing = false;
    if (pendingRefresh) {
      runStructuralRefresh();
    }
  }
}

listen((event) => {
  if (!("tables" in event)) return;
  if (event.tables.includes("categories") || event.tables.includes("category_groups")) {
    // Not initialized yet (e.g. wizard seed before loadBudget) — the later
    // initSpreadsheet() builds all cells anyway, and firing async reads here
    // just races with other work on the shared connection.
    if (builtStart === null || builtEnd === null) return;

    // Skip structural refresh if we just initialized — cells are already fresh.
    // This prevents the post-open sync from triggering a massive re-render
    // that can reset Expo Router's tab navigation state.
    if (Date.now() - lastInitTime < INIT_COOLDOWN) return;

    if (refreshing) {
      pendingRefresh = true;
      return;
    }
    runStructuralRefresh();
  }
});
