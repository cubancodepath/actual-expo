import { useMemo, useState } from "react";
import { q } from "@/queries";
import { useLiveQuery } from "../useQuery";
import { addMonths } from "@/lib/date";

export type SavingsRatePoint = { month: string; rate: number; saved: number; overspent: number };
export type SavingsRateRange = 3 | 6 | 12;

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

function monthLabel(month: string): string {
  const m = parseInt(month.slice(5), 10);
  return SHORT_MONTHS[m - 1] ?? month.slice(5);
}

function monthRange(month: string): { start: number; end: number } {
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return { start: y * 10000 + m * 100 + 1, end: y * 10000 + m * 100 + lastDay };
}

type MonthFlow = { income: number; expenses: number };

function useMonthFlow(monthStr: string): MonthFlow {
  const { start, end } = useMemo(() => monthRange(monthStr), [monthStr]);

  const { data: incData } = useLiveQuery<{ result: number }>(
    () =>
      q("transactions")
        .filter({ date: { $gte: start, $lte: end }, amount: { $gt: 0 }, transferred_id: null })
        .calculate({ $sum: "$amount" }),
    [start, end],
  );

  const { data: expData } = useLiveQuery<{ result: number }>(
    () =>
      q("transactions")
        .filter({ date: { $gte: start, $lte: end }, amount: { $lt: 0 }, transferred_id: null })
        .calculate({ $sum: "$amount" }),
    [start, end],
  );

  return useMemo(
    () => ({
      income: incData?.[0]?.result ?? 0,
      expenses: expData?.[0]?.result ?? 0,
    }),
    [incData, expData],
  );
}

function calcRate(income: number, expenses: number): number {
  if (income <= 0) return 0;
  return Math.round(((income - Math.abs(expenses)) / income) * 100);
}

/**
 * Savings rate (% of income saved) for multiple months.
 */
export function useSavingsRate() {
  const [range, setRange] = useState<SavingsRateRange>(6);

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const m11 = useMemo(() => addMonths(currentMonth, -11), [currentMonth]);
  const m10 = useMemo(() => addMonths(currentMonth, -10), [currentMonth]);
  const m9 = useMemo(() => addMonths(currentMonth, -9), [currentMonth]);
  const m8 = useMemo(() => addMonths(currentMonth, -8), [currentMonth]);
  const m7 = useMemo(() => addMonths(currentMonth, -7), [currentMonth]);
  const m6 = useMemo(() => addMonths(currentMonth, -6), [currentMonth]);
  const m5 = useMemo(() => addMonths(currentMonth, -5), [currentMonth]);
  const m4 = useMemo(() => addMonths(currentMonth, -4), [currentMonth]);
  const m3 = useMemo(() => addMonths(currentMonth, -3), [currentMonth]);
  const m2 = useMemo(() => addMonths(currentMonth, -2), [currentMonth]);
  const m1 = useMemo(() => addMonths(currentMonth, -1), [currentMonth]);
  const m0 = currentMonth;

  const v11 = useMonthFlow(m11);
  const v10 = useMonthFlow(m10);
  const v9 = useMonthFlow(m9);
  const v8 = useMonthFlow(m8);
  const v7 = useMonthFlow(m7);
  const v6 = useMonthFlow(m6);
  const v5 = useMonthFlow(m5);
  const v4 = useMonthFlow(m4);
  const v3 = useMonthFlow(m3);
  const v2 = useMonthFlow(m2);
  const v1 = useMonthFlow(m1);
  const v0 = useMonthFlow(m0);

  const allMonths = [m11, m10, m9, m8, m7, m6, m5, m4, m3, m2, m1, m0];
  const allValues = [v11, v10, v9, v8, v7, v6, v5, v4, v3, v2, v1, v0];

  const currentRate = calcRate(v0.income, v0.expenses);
  const previousRate = calcRate(v1.income, v1.expenses);

  const trend: SavingsRatePoint[] = useMemo(() => {
    const start = 12 - range;
    const points: SavingsRatePoint[] = [];
    for (let i = start; i < 12; i++) {
      const rate = calcRate(allValues[i].income, allValues[i].expenses);
      points.push({
        month: monthLabel(allMonths[i]),
        rate,
        saved: Math.max(rate, 0),
        overspent: Math.min(rate, 0),
      });
    }
    return points;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    range,
    v11.income,
    v11.expenses,
    v10.income,
    v10.expenses,
    v9.income,
    v9.expenses,
    v8.income,
    v8.expenses,
    v7.income,
    v7.expenses,
    v6.income,
    v6.expenses,
    v5.income,
    v5.expenses,
    v4.income,
    v4.expenses,
    v3.income,
    v3.expenses,
    v2.income,
    v2.expenses,
    v1.income,
    v1.expenses,
    v0.income,
    v0.expenses,
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
    currentRate,
    previousRate,
    trend,
    range,
    setRange,
  };
}
