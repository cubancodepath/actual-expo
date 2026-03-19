/**
 * Sync integration for the spreadsheet engine.
 *
 * Listens to syncEvents and re-creates budget cells when relevant
 * tables change. Loads ALL months (like Actual's createAllBudgets).
 */

import { listen } from "../sync/syncEvents";
import { getSpreadsheet } from "./instance";
import { createAllBudgetCells } from "./envelope";

const BUDGET_TABLES = new Set([
  "zero_budgets",
  "zero_budget_months",
  "transactions",
  "categories",
  "category_groups",
]);

/**
 * Initialize the spreadsheet with budget cells for all months.
 * Called during bootstrap in openBudget().
 */
export async function initSpreadsheet(): Promise<void> {
  const ss = getSpreadsheet();
  ss.clear();
  await createAllBudgetCells(ss);
}

// Auto-refresh when budget-related tables change
let refreshing = false;
listen((event) => {
  if (refreshing) return; // Prevent re-entrant refresh
  if (event.tables.some((t) => BUDGET_TABLES.has(t))) {
    refreshing = true;
    // Re-create cells with fresh DB data (overwrites existing values)
    // No clear() — createAllBudgetCells overwrites cells in place
    createAllBudgetCells(getSpreadsheet())
      .catch((err) => {
        if (__DEV__) console.warn("[spreadsheet/sync] refresh failed:", err);
      })
      .finally(() => {
        refreshing = false;
      });
  }
});
