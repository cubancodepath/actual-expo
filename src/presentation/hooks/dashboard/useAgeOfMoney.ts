import { useMemo } from "react";
import { q } from "@/queries";
import { useLiveQuery } from "../useQuery";
import { addMonths } from "@/lib/date";

function intToDate(d: number): Date {
  const y = Math.floor(d / 10000);
  const m = Math.floor((d % 10000) / 100) - 1;
  const day = d % 100;
  return new Date(y, m, day);
}

function daysBetween(d1: number, d2: number): number {
  const ms = intToDate(d2).getTime() - intToDate(d1).getTime();
  return Math.round(ms / 86400000);
}

function monthEndInt(month: string): number {
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return y * 10000 + m * 100 + lastDay;
}

type TxRow = { amount: number; date: number };

function calcAge(transactions: TxRow[], upToDate?: number): number {
  const income: { date: number; remaining: number }[] = [];
  const expenses: { date: number; amount: number }[] = [];

  for (const tx of transactions) {
    if (upToDate && tx.date > upToDate) continue;
    if (tx.amount > 0) {
      income.push({ date: tx.date, remaining: tx.amount });
    } else if (tx.amount < 0) {
      expenses.push({ date: tx.date, amount: Math.abs(tx.amount) });
    }
  }

  income.sort((a, b) => a.date - b.date);
  expenses.sort((a, b) => a.date - b.date);

  const ages: number[] = [];
  let incIdx = 0;

  for (const exp of expenses) {
    let remaining = exp.amount;
    while (remaining > 0 && incIdx < income.length) {
      const inc = income[incIdx];
      // Only match income that arrived on or before the expense date
      if (inc.date > exp.date) break;
      const consumed = Math.min(remaining, inc.remaining);
      const ageDays = daysBetween(inc.date, exp.date);
      if (ageDays >= 0) ages.push(ageDays);
      inc.remaining -= consumed;
      remaining -= consumed;
      if (inc.remaining <= 0) incIdx++;
    }
  }

  if (ages.length === 0) return 0;

  // Average of last 10 expense ages
  const last10 = ages.slice(-10);
  return Math.round(last10.reduce((sum, a) => sum + a, 0) / last10.length);
}

/**
 * Age of Money — FIFO matching of income to expenses.
 * Returns current age, previous month's age, and loading state.
 */
export function useAgeOfMoney() {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  // Query ~3 months of transactions for current + previous month calculation
  const threeMonthsAgo = addMonths(currentMonth, -3);
  const [y, m] = threeMonthsAgo.split("-").map(Number);
  const startDate = y * 10000 + m * 100 + 1;

  const { data, isLoading } = useLiveQuery<TxRow>(
    () =>
      q("transactions")
        .filter({
          date: { $gte: startDate },
          transferred_id: null,
          cleared: 1,
        })
        .select(["amount", "date"]),
    [startDate],
  );

  const transactions = data ?? [];

  const age = useMemo(() => calcAge(transactions), [transactions]);

  const previousAge = useMemo(() => {
    const prevEnd = monthEndInt(addMonths(currentMonth, -1));
    return calcAge(transactions, prevEnd);
  }, [transactions, currentMonth]);

  return { age, previousAge, isLoading };
}
