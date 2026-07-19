import { useMemo, useState } from "react";
import { q } from "@/core/queries";
import { useLiveQuery } from "@/hooks/useQuery";
import { useAccounts } from "@/lib/hooks/useAccounts";
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

/** Month start as YYYYMMDD integer. */
function monthStartInt(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return y * 10000 + m * 100 + 1;
}

/**
 * Reduces per-month bucketed sums into cumulative running totals.
 *
 * rows: per-month sums keyed by YYYYMM bucket (matches SQL
 * `SUBSTR(date, 1, 6)` grouping). monthEnds: YYYYMMDD ints, ascending,
 * one per requested month end. priorTotal: SUM(amount) over everything
 * strictly before the first bucket in `rows`.
 *
 * Each output[N] = SUM(amount) over all transactions with
 * `date <= monthEnds[N]` for the account set. Months with no transactions
 * carry the previous cumulative value; months before any transaction in
 * `rows` resolve to `priorTotal`.
 */
export function cumulativeByMonth(
  rows: Array<{ bucket: number; sum: number }>,
  monthEnds: number[],
  priorTotal: number,
): number[] {
  const sumsByBucket = new Map<number, number>();
  for (const row of rows) {
    sumsByBucket.set(row.bucket, (sumsByBucket.get(row.bucket) ?? 0) + row.sum);
  }

  let running = priorTotal;
  const result: number[] = [];
  for (const monthEnd of monthEnds) {
    const bucket = Math.floor(monthEnd / 100);
    running += sumsByBucket.get(bucket) ?? 0;
    result.push(running);
  }
  return result;
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
            .groupBy("acct")
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

  // Compute all 12 month strings (stable count, ascending m11 → m0)
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

  const allMonths = useMemo(
    () => [m11, m10, m9, m8, m7, m6, m5, m4, m3, m2, m1, m0],
    [m11, m10, m9, m8, m7, m6, m5, m4, m3, m2, m1, m0],
  );
  const monthEnds = useMemo(() => allMonths.map(monthEndInt), [allMonths]);
  const firstMonthStart = useMemo(() => monthStartInt(m11), [m11]);
  const lastMonthEnd = monthEnds[monthEnds.length - 1];

  // One grouped query bucketing sums by month across the 12-month window,
  // plus one scalar query for everything before the window's first month.
  // Together these replace the 12 separate full-table SUM scans above.
  const { data: bucketData } = useLiveQuery<{ bucket: string | number; sum: number }>(
    () =>
      allIds.length > 0
        ? q("transactions")
            .filter({
              acct: { $oneof: allIds },
              date: { $gte: firstMonthStart, $lte: lastMonthEnd },
            })
            .groupBy({ $month: "$date" })
            .select([{ bucket: { $month: "$date" } }, { sum: { $sum: "$amount" } }])
        : null,
    [allIdsKey, firstMonthStart, lastMonthEnd],
  );

  const { data: priorTotalData } = useLiveQuery<{ result: number }>(
    () =>
      allIds.length > 0
        ? q("transactions")
            .filter({ acct: { $oneof: allIds }, date: { $lt: firstMonthStart } })
            .calculate({ $sum: "$amount" })
        : null,
    [allIdsKey, firstMonthStart],
  );
  const priorTotal = priorTotalData?.[0]?.result ?? 0;

  // All 12 months + cumulative values as parallel arrays
  const allValues = useMemo(() => {
    const rows = (bucketData ?? []).map((row) => ({
      bucket: Number(row.bucket),
      sum: row.sum,
    }));
    return cumulativeByMonth(rows, monthEnds, priorTotal);
  }, [bucketData, monthEnds, priorTotal]);

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
  }, [range, allMonths, allValues]);

  return {
    total,
    previousTotal: allValues[10] ?? 0,
    assets,
    debt,
    trend,
    range,
    setRange,
    isLoading: totalLoading,
  };
}
