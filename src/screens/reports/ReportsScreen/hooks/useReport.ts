/**
 * useReport — mobile adaptation of desktop-client's `useReport`.
 *
 * Upstream is `useReport(sheetName, (spreadsheet, setData) => Promise)`, but no
 * report spreadsheet actually uses the `spreadsheet` arg, so this drops it and
 * the sheet name. It keeps upstream's cancel guard and adds mobile re-run
 * triggers: the active budget id and sync-applied events, since these one-shot
 * fetches — unlike `useLiveQuery` — don't auto-refresh.
 *
 * Intentional divergence from upstream: results are NOT reset to null before a
 * refetch (stale-while-revalidate). Cards keep showing the previous data while
 * new data computes, so they only skeleton on first load — never blank-flash on
 * sync or on a `getData` identity change. Results reset only when the active
 * budget changes, where stale data would be another budget's data. Sync bursts
 * are debounced so a batch of applied messages coalesces into one refetch.
 */
import { useEffect, useState } from "react";
import { listen } from "@/core/server/sync/syncEvents";
import { useBudgetContextStore } from "@/stores/budgetContextStore";

export type ReportDataFn<T> = (setData: (results: T) => void) => Promise<void>;

/** Trailing debounce for sync-applied refetches. */
const SYNC_REFETCH_DEBOUNCE_MS = 250;

export function useReport<T>(getData: ReportDataFn<T>): T | null {
  const activeBudgetId = useBudgetContextStore((s) => s.activeBudgetId);
  const [results, setResults] = useState<T | null>(null);
  const [syncTick, setSyncTick] = useState(0);

  // Refresh after a sync applies new data (one-shot fetches don't auto-update).
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unlisten = listen((event) => {
      if (event.type !== "applied") return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setSyncTick((n) => n + 1), SYNC_REFETCH_DEBOUNCE_MS);
    });
    return () => {
      if (timer) clearTimeout(timer);
      unlisten();
    };
  }, []);

  // Another budget's data must never show through — this is the only reset.
  useEffect(() => {
    setResults(null);
  }, [activeBudgetId]);

  useEffect(() => {
    let didCancel = false;

    void getData((r) => {
      if (!didCancel) setResults(r);
    });

    return () => {
      didCancel = true;
    };
  }, [getData, activeBudgetId, syncTick]);

  return results;
}
