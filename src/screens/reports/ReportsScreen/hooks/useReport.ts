/**
 * useReport — mobile adaptation of desktop-client's `useReport`.
 *
 * Upstream is `useReport(sheetName, (spreadsheet, setData) => Promise)`, but no
 * report spreadsheet actually uses the `spreadsheet` arg, so this drops it and
 * the sheet name. It keeps upstream's cancel-guard + reset-to-null semantics
 * (so cards show a loading state on change) and adds mobile re-run triggers:
 * the active budget id and sync-applied events, since these one-shot fetches —
 * unlike `useLiveQuery` — don't auto-refresh.
 */
import { useEffect, useState } from "react";
import { listen } from "@/core/sync/syncEvents";
import { useBudgetContextStore } from "@/stores/budgetContextStore";

export type ReportDataFn<T> = (setData: (results: T) => void) => Promise<void>;

export function useReport<T>(getData: ReportDataFn<T>): T | null {
  const activeBudgetId = useBudgetContextStore((s) => s.activeBudgetId);
  const [results, setResults] = useState<T | null>(null);
  const [syncTick, setSyncTick] = useState(0);

  // Refresh after a sync applies new data (one-shot fetches don't auto-update).
  useEffect(() => {
    return listen((event) => {
      if (event.type === "applied") setSyncTick((n) => n + 1);
    });
  }, []);

  useEffect(() => {
    let didCancel = false;
    setResults(null);

    void getData((r) => {
      if (!didCancel) setResults(r);
    });

    return () => {
      didCancel = true;
    };
  }, [getData, activeBudgetId, syncTick]);

  return results;
}
