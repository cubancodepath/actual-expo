/**
 * Sync integration for the spreadsheet engine.
 *
 * Two refresh paths (matching loot-core's pattern):
 * 1. Granular: triggerBudgetChanges() marks SQL cells (deps=[]) dirty after
 *    transaction/budget mutations. Formula cells cascade automatically via
 *    the dependency graph.
 * 2. Structural: Full cell re-creation when categories/groups change.
 */

import { listen } from "../sync/syncEvents";
import type { SyncMessage } from "../sync/encoder";
import { getSpreadsheet } from "./instance";
import { createAllBudgetCells } from "./envelope";

/**
 * Initialize the spreadsheet with budget cells for all months.
 * Called during bootstrap in openBudget().
 */
export async function initSpreadsheet(): Promise<void> {
  const ss = getSpreadsheet();
  ss.clear();
  await createAllBudgetCells(ss);
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
        // Mark all catSpent SQL cells dirty (deps=[])
        // They cascade to: groupSpent → totalIncome → incomeAvailable → toBudget
        // And: catBalance → groupBalance → totalBalance
        for (const [name, cell] of ss.getCells()) {
          if (
            cell.type === "dynamic" &&
            cell.dependencies.length === 0 &&
            name.includes("!sum-amount-")
          ) {
            affectedCells.add(name);
          }
        }
      }
    } else if (msg.dataset === "zero_budgets") {
      if (msg.column === "amount" || msg.column === "carryover") {
        // Mark catBudgeted and catCarryover SQL cells dirty (deps=[])
        // They cascade to: catBalance → groupBudgeted/groupBalance → totals → toBudget
        for (const [name, cell] of ss.getCells()) {
          if (
            cell.type === "dynamic" &&
            cell.dependencies.length === 0 &&
            (name.includes("!budget-") || name.includes("!carryover-"))
          ) {
            affectedCells.add(name);
          }
        }
      }
    } else if (msg.dataset === "zero_budget_months") {
      // Mark buffered SQL cell dirty (deps=[])
      // Cascades to: bufferedSelected → toBudget
      for (const [name, cell] of ss.getCells()) {
        if (
          cell.type === "dynamic" &&
          cell.dependencies.length === 0 &&
          name.includes("!buffered")
        ) {
          affectedCells.add(name);
        }
      }
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
    await createAllBudgetCells(getSpreadsheet());
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
  if (event.tables.includes("categories") || event.tables.includes("category_groups")) {
    if (refreshing) {
      pendingRefresh = true;
      return;
    }
    runStructuralRefresh();
  }
});
