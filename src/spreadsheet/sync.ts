/**
 * Sync integration for the spreadsheet engine.
 *
 * Two refresh paths (matching loot-core's pattern):
 * 1. Granular: triggerBudgetChanges() marks specific cells dirty after
 *    transaction/budget mutations. Dynamic cells re-query via sync SQL.
 * 2. Structural: Full cell re-creation when categories/groups change.
 */

import { listen } from "../sync/syncEvents";
import type { SyncMessage } from "../sync/encoder";
import { getSpreadsheet } from "./instance";
import { createAllBudgetCells } from "./envelope";
import { sheetForMonth, envelopeBudget } from "./bindings";
import { intToStr } from "../lib/date";

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
 * Inspect CRDT messages and mark affected budget cells dirty.
 * Dynamic cells (catSpent, totalIncome) will re-run their SQL queries
 * on the next computation cycle.
 */
export function triggerBudgetChanges(messages: SyncMessage[]): void {
  const ss = getSpreadsheet();
  const affectedCells = new Set<string>();

  for (const msg of messages) {
    if (msg.dataset === "transactions") {
      // Transaction changed — need to recompute spent for the affected category/month
      // We can't easily know which category/month from just the message,
      // so we mark ALL catSpent cells for the affected months dirty.
      // The dynamic cells will re-query and only emit changes if values differ.
      if (
        msg.column === "amount" ||
        msg.column === "category" ||
        msg.column === "date" ||
        msg.column === "acct" ||
        msg.column === "tombstone" ||
        msg.column === "isParent"
      ) {
        // Mark all months' spent cells + income as needing recompute
        // The ss.recompute() marks the cell dirty → cascade through dependencies
        for (const [name, cell] of ss.getCells()) {
          if (
            cell.type === "dynamic" &&
            cell.dependencies.length === 0 &&
            (name.includes("!sum-amount-") || name.includes("!total-income"))
          ) {
            affectedCells.add(name);
          }
        }
      }
    } else if (msg.dataset === "zero_budgets") {
      // Budget amount or carryover changed — recompute affected dynamic cells
      if (msg.column === "amount" || msg.column === "carryover") {
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
      // Buffered amount changed
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
  // Structural changes need full re-creation (new/deleted categories/groups)
  if (event.tables.includes("categories") || event.tables.includes("category_groups")) {
    if (refreshing) {
      pendingRefresh = true;
      return;
    }
    runStructuralRefresh();
  }
});
