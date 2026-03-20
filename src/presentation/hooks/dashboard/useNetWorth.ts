import { useMemo, useState } from "react";
import { q } from "@/queries";
import { useLiveQuery } from "../useQuery";
import { useAccounts } from "../useAccounts";
import { useBudgetUIStore } from "@/stores/budgetUIStore";
import { addMonths } from "@/lib/date";

export type TrendPoint = {
  month: string;
  value: number;
};

export type NetWorthRange = 3 | 6 | 12;

const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "YYYY-MM" → short month name, e.g. "Oct" */
function monthLabel(month: string): string {
  const m = parseInt(month.slice(5), 10);
  return SHORT_MONTHS[m - 1] ?? month.slice(5);
}

/** Month end as YYYYMMDD integer. */
function monthEndInt(month: string): number {
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return y * 10000 + m * 100 + lastDay;
}

/** Single month cumulative balance query. */
function useCumulativeBalance(accountIds: string[], idsKey: string, endDate: number): number {
  const { data } = useLiveQuery<{ result: number }>(
    () =>
      accountIds.length > 0
        ? q("transactions")
            .filter({ acct: { $oneof: accountIds }, date: { $lte: endDate } })
            .calculate({ $sum: "$amount" })
        : null,
    [idsKey, endDate],
  );
  return data?.[0]?.result ?? 0;
}

/**
 * Net worth summary + trend data for Chart.
 * Always runs 12 hooks (stable count) and slices based on range.
 */
export function useNetWorth() {
  const { accounts } = useAccounts();
  const month = useBudgetUIStore((s) => s.month);
  const [range, setRange] = useState<NetWorthRange>(6);

  const allIds = useMemo(() => accounts.filter((a) => !a.closed).map((a) => a.id), [accounts]);
  const allIdsKey = useMemo(() => allIds.slice().sort().join(","), [allIds]);

  // Current total net worth (all non-closed accounts)
  const { data: totalData, isLoading: totalLoading } = useLiveQuery<{ result: number }>(
    () =>
      allIds.length > 0
        ? q("transactions")
            .filter({ acct: { $oneof: allIds } })
            .calculate({ $sum: "$amount" })
        : null,
    [allIdsKey],
  );
  const total = totalData?.[0]?.result ?? 0;

  // Assets/debt for current display (grouped by account)
  const { data: assetDebtData } = useLiveQuery<{ acct: string; amount: number }>(
    () =>
      allIds.length > 0
        ? q("transactions")
            .filter({ acct: { $oneof: allIds } })
            .groupBy("$acct")
            .select([{ acct: "$acct" }, { amount: { $sum: "$amount" } }])
        : null,
    [allIdsKey],
  );

  const { assets, debt } = useMemo(() => {
    let a = 0;
    let d = 0;
    for (const row of assetDebtData ?? []) {
      if (row.amount >= 0) a += row.amount;
      else d += row.amount;
    }
    return { assets: a, debt: d };
  }, [assetDebtData]);

  // Compute all 12 month strings (stable count for Rules of Hooks)
  const m11 = useMemo(() => addMonths(month, -11), [month]);
  const m10 = useMemo(() => addMonths(month, -10), [month]);
  const m9 = useMemo(() => addMonths(month, -9), [month]);
  const m8 = useMemo(() => addMonths(month, -8), [month]);
  const m7 = useMemo(() => addMonths(month, -7), [month]);
  const m6 = useMemo(() => addMonths(month, -6), [month]);
  const m5 = useMemo(() => addMonths(month, -5), [month]);
  const m4 = useMemo(() => addMonths(month, -4), [month]);
  const m3 = useMemo(() => addMonths(month, -3), [month]);
  const m2 = useMemo(() => addMonths(month, -2), [month]);
  const m1 = useMemo(() => addMonths(month, -1), [month]);
  const m0 = month;

  // 12 stable hook calls — always called regardless of range
  const v11 = useCumulativeBalance(allIds, allIdsKey, monthEndInt(m11));
  const v10 = useCumulativeBalance(allIds, allIdsKey, monthEndInt(m10));
  const v9 = useCumulativeBalance(allIds, allIdsKey, monthEndInt(m9));
  const v8 = useCumulativeBalance(allIds, allIdsKey, monthEndInt(m8));
  const v7 = useCumulativeBalance(allIds, allIdsKey, monthEndInt(m7));
  const v6 = useCumulativeBalance(allIds, allIdsKey, monthEndInt(m6));
  const v5 = useCumulativeBalance(allIds, allIdsKey, monthEndInt(m5));
  const v4 = useCumulativeBalance(allIds, allIdsKey, monthEndInt(m4));
  const v3 = useCumulativeBalance(allIds, allIdsKey, monthEndInt(m3));
  const v2 = useCumulativeBalance(allIds, allIdsKey, monthEndInt(m2));
  const v1 = useCumulativeBalance(allIds, allIdsKey, monthEndInt(m1));
  const v0 = useCumulativeBalance(allIds, allIdsKey, monthEndInt(m0));

  // All 12 months + values as parallel arrays
  const allMonths = [m11, m10, m9, m8, m7, m6, m5, m4, m3, m2, m1, m0];
  const allValues = [v11, v10, v9, v8, v7, v6, v5, v4, v3, v2, v1, v0];

  const trend: TrendPoint[] = useMemo(() => {
    const start = 12 - range;
    const points: TrendPoint[] = [];
    for (let i = start; i < 12; i++) {
      points.push({
        month: monthLabel(allMonths[i]),
        value: allValues[i] / 100,
      });
    }
    return points;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    range,
    v11,
    v10,
    v9,
    v8,
    v7,
    v6,
    v5,
    v4,
    v3,
    v2,
    v1,
    v0,
    m11,
    m10,
    m9,
    m8,
    m7,
    m6,
    m5,
    m4,
    m3,
    m2,
    m1,
    m0,
  ]);

  return {
    total,
    previousTotal: v1,
    assets,
    debt,
    trend,
    range,
    setRange,
    isLoading: totalLoading,
  };
}
