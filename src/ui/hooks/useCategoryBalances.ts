import { useEffect, useMemo, useState } from "react";
import { getCategoryBalancesForMonth } from "@/core/domain/budgets";
import { currentMonth } from "@/core/shared/months";

/**
 * Available balance per category for the month of `date` (a YYYYMMDD int).
 * Loads asynchronously and is safe against unmount races.
 */
export function useCategoryBalances(date: number): Map<string, number> {
  const month = useMemo(() => {
    const d = String(date);
    return d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}` : currentMonth();
  }, [date]);

  const [balances, setBalances] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    let alive = true;
    getCategoryBalancesForMonth(month)
      .then((m) => alive && setBalances(m))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [month]);

  return balances;
}
