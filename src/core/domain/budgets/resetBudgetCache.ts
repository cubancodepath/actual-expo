import { initSpreadsheet } from "@/core/server/sheet";
import { getSpreadsheet } from "@/core/server/spreadsheet/globals";

/**
 * Clear all cached budget values and recompute the whole budget — the mobile
 * equivalent of upstream `server/budgetfiles/app.ts::resetBudgetCache`
 * (`loadUserBudgets(db); sheet.recomputeAll(); waitOnSpreadsheet()`).
 *
 * `initSpreadsheet()` rebuilds every cell on the **live** spreadsheet instance
 * (`ss.clear()` + rebuild — NOT `resetSpreadsheet()`, which recreates the
 * instance and would drop existing subscriptions). `clear()` leaves the listener
 * set intact, so `useSheetValue` subscribers get the freshly recomputed values.
 * There's no danger — all values are derived, so this only corrects a stale
 * cache.
 */
export async function resetBudgetCache(): Promise<void> {
  await initSpreadsheet();
  getSpreadsheet().recomputeAll();
}
