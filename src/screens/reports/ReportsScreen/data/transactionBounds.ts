/**
 * Shared boundary-transaction date for report cards.
 *
 * Several dashboard cards (net worth, summary, calendar) anchor their time
 * range on the newest transaction's date. Each card used to fetch it
 * independently on mount, so one dashboard issued the same query several
 * times. This module shares a single in-flight/settled promise per budget;
 * an applied sync drops it so the next mount re-reads the boundary (same
 * freshness as the old per-mount fetch).
 */
import * as monthUtils from "@/core/shared/monthUtils";
import { getLatestTransaction } from "@/core/server/transactions";
import { listen } from "@/core/server/sync/syncEvents";

let cachedBudgetId: string | null | undefined;
let cachedPromise: Promise<string> | null = null;
let listening = false;

function ensureInvalidation() {
  if (listening) return;
  listening = true;
  listen((event) => {
    if (event.type === "applied") cachedPromise = null;
  });
}

/** Newest transaction date for the given budget, falling back to today when
 * the budget has no transactions. Cached across callers until invalidated. */
export function fetchLatestTransactionDate(budgetId: string | null): Promise<string> {
  ensureInvalidation();
  if (!cachedPromise || cachedBudgetId !== budgetId) {
    cachedBudgetId = budgetId;
    cachedPromise = getLatestTransaction().then((tx) => (tx ? tx.date : monthUtils.currentDay()));
  }
  return cachedPromise;
}

/** Test-only: reset module state between cases. */
export function __resetTransactionBoundsCache() {
  cachedBudgetId = undefined;
  cachedPromise = null;
}
