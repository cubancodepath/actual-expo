import { useCallback } from "react";
import { useBudgetUIStore } from "@/stores/budgetUIStore";
import { ensureMonthRange } from "@/core/server/sheet";

/**
 * Budget month + its domain side effect. Reads the selected month from the UI
 * store and exposes a setter that also extends the spreadsheet's built range so
 * distant months don't render zeros. Keeping this out of the view components
 * lets the month picker stay purely presentational.
 */
export function useBudgetMonth() {
  const month = useBudgetUIStore((s) => s.month);
  const setStoreMonth = useBudgetUIStore((s) => s.setMonth);

  const setMonth = useCallback(
    (next: string) => {
      setStoreMonth(next);
      // Lazily extend the spreadsheet's built range when jumping outside it
      // (no-op when already covered) — mirrors the legacy MonthPicker.
      ensureMonthRange(next).catch((err) => {
        // eslint-disable-next-line no-console
        if (__DEV__) console.warn("[useBudgetMonth] ensureMonthRange failed:", err);
      });
    },
    [setStoreMonth],
  );

  return { month, setMonth };
}
