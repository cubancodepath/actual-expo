/**
 * useLatestTransactionDate — resolves the shared newest-transaction date for
 * report cards (see data/transactionBounds.ts for the caching rationale).
 *
 * Cards must NOT build their spreadsheet `getData` until this returns non-null:
 * seeding the time range with a placeholder and recreating `getData` once the
 * real date arrived is what caused every card to fetch twice on mount.
 */
import { useEffect, useState } from "react";
import { useBudgetContextStore } from "@/stores/budgetContextStore";
import { fetchLatestTransactionDate } from "../data/transactionBounds";

export function useLatestTransactionDate(): string | null {
  const activeBudgetId = useBudgetContextStore((s) => s.activeBudgetId);
  const [date, setDate] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDate(null);
    void fetchLatestTransactionDate(activeBudgetId).then((d) => {
      if (!cancelled) setDate(d);
    });
    return () => {
      cancelled = true;
    };
  }, [activeBudgetId]);

  return date;
}
