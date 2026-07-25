/**
 * Age of Money spreadsheet — port of desktop-client
 * `spreadsheets/age-of-money-spreadsheet.ts`. FIFO age-of-money: income becomes
 * dated buckets, each expense draws from the oldest bucket first, and the age is
 * expense-date minus bucket-date. The pure helpers are copied verbatim; only the
 * data-fetching `createAgeOfMoneySpreadsheet` is adapted:
 *  - `send('make-filters-from-conditions')` → `makeReportFilters`
 *  - `send('get-latest-transaction')` handling lives in the card
 *  - `runAll(...)` → `Promise.all` of `aqlQuery`
 * Dates stay strings; `@/core/shared/monthUtils` replaces upstream months.
 */
import * as d from "date-fns";
import { q } from "@/lib/queries";
import { aqlQuery } from "@/core/server/aql";
import * as monthUtils from "@/core/shared/monthUtils";
import type { RuleCondition } from "@/core/types/models";
import type { AgeOfMoneyGranularity } from "@/core/types/models/dashboard";
import { makeReportFilters } from "../makeFilters";

export type AgeOfMoneyData = {
  graphData: Array<{
    date: string; // Month label (e.g., "Jan 2024")
    ageOfMoney: number; // Days
  }>;
  currentAge: number | null; // Current AoM in days, null if no data
  trend: "up" | "down" | "stable";
  insufficientData: boolean; // True if not enough income to cover expenses
};

type IncomeBucket = {
  date: string;
  remainingAmount: number;
};

export type Transaction = {
  id: string;
  date: string;
  amount: number;
};

export type TransactionWithCategory = Transaction & {
  categoryIsIncome: boolean | null;
};

/**
 * Classify transactions into income and expenses based on amount sign.
 * Income = positive amounts (including refunds - money entering your pool)
 * Expenses = negative amounts
 */
export function classifyTransactions(transactions: TransactionWithCategory[]): {
  income: Transaction[];
  expenses: Transaction[];
} {
  const income: Transaction[] = [];
  const expenses: Transaction[] = [];

  for (const t of transactions) {
    if (t.amount > 0) {
      income.push({ id: t.id, date: t.date, amount: t.amount });
    } else {
      expenses.push({ id: t.id, date: t.date, amount: t.amount });
    }
  }

  return { income, expenses };
}

/**
 * Calculate the age of money for a given set of expense transactions using the
 * FIFO (First In, First Out) method.
 */
export function calculateAgeOfMoney(
  incomeTransactions: Transaction[],
  expenseTransactions: Transaction[],
): { ages: Array<{ date: string; age: number }>; insufficientData: boolean } {
  const sortedIncome = [...incomeTransactions].sort((a, b) => a.date.localeCompare(b.date));

  const buckets: IncomeBucket[] = sortedIncome.map((t) => ({
    date: t.date,
    remainingAmount: t.amount,
  }));

  const sortedExpenses = [...expenseTransactions].sort((a, b) => a.date.localeCompare(b.date));

  const ages: Array<{ date: string; age: number }> = [];
  let currentBucketIdx = 0;
  let insufficientData = false;

  for (const expense of sortedExpenses) {
    let remainingExpense = Math.abs(expense.amount);
    let lastBucketDate: string | null = null;

    while (remainingExpense > 0 && currentBucketIdx < buckets.length) {
      const bucket = buckets[currentBucketIdx];

      if (bucket.remainingAmount > 0) {
        const deduction = Math.min(bucket.remainingAmount, remainingExpense);
        bucket.remainingAmount -= deduction;
        remainingExpense -= deduction;
        lastBucketDate = bucket.date;
      }

      if (bucket.remainingAmount <= 0) {
        currentBucketIdx++;
      }
    }

    if (remainingExpense > 0) {
      insufficientData = true;
    }

    if (lastBucketDate) {
      const expenseDate = d.parseISO(expense.date);
      const bucketDate = d.parseISO(lastBucketDate);
      const ageInDays = d.differenceInDays(expenseDate, bucketDate);
      ages.push({ date: expense.date, age: Math.max(0, ageInDays) });
    }
  }

  return { ages, insufficientData };
}

/** Calculate the average of the last N ages. */
export function calculateAverageAge(
  ages: Array<{ date: string; age: number }>,
  count: number = 10,
): number | null {
  if (ages.length === 0) return null;

  const lastN = ages.slice(-count);
  const sum = lastN.reduce((acc, item) => acc + item.age, 0);
  return Math.round(sum / lastN.length);
}

/** Get the period key for a given date based on granularity. */
export function getPeriodKey(date: string, granularity: AgeOfMoneyGranularity): string {
  const parsed = d.parseISO(date);
  switch (granularity) {
    case "daily":
      return date;
    case "weekly": {
      const weekStart = d.startOfWeek(parsed, { weekStartsOn: 1 });
      return d.format(weekStart, "yyyy-MM-dd");
    }
    case "monthly":
    default:
      return monthUtils.getMonth(date);
  }
}

/** Format a period key for display based on granularity. */
export function formatPeriodLabel(periodKey: string, granularity: AgeOfMoneyGranularity): string {
  switch (granularity) {
    case "daily":
      return d.format(d.parseISO(periodKey), "MMM d, yyyy");
    case "weekly":
      return d.format(d.parseISO(periodKey), "MMM d, yyyy");
    case "monthly":
    default:
      return d.format(d.parseISO(periodKey + "-01"), "MMM yyyy");
  }
}

/** Generate all periods between start and end based on granularity. */
export function generatePeriods(
  startDate: string,
  endDate: string,
  granularity: AgeOfMoneyGranularity,
): string[] {
  const periods: string[] = [];
  let current = d.parseISO(startDate);
  const end = d.parseISO(endDate);

  switch (granularity) {
    case "daily":
      while (current <= end) {
        periods.push(d.format(current, "yyyy-MM-dd"));
        current = d.addDays(current, 1);
      }
      break;
    case "weekly":
      current = d.startOfWeek(current, { weekStartsOn: 1 });
      while (current <= end) {
        periods.push(d.format(current, "yyyy-MM-dd"));
        current = d.addWeeks(current, 1);
      }
      break;
    case "monthly":
    default: {
      const months = monthUtils.rangeInclusive(
        monthUtils.getMonth(startDate),
        monthUtils.getMonth(endDate),
      );
      return months;
    }
  }

  return periods;
}

/** Group ages by period and calculate a rolling average for each period. */
export function calculateGraphData(
  ages: Array<{ date: string; age: number }>,
  startMonth: string,
  endMonth: string,
  granularity: AgeOfMoneyGranularity = "monthly",
): Array<{ date: string; ageOfMoney: number }> {
  const startDate = monthUtils.firstDayOfMonth(startMonth);
  let endDate = monthUtils.lastDayOfMonth(endMonth);

  if (granularity === "daily" || granularity === "weekly") {
    const today = monthUtils.currentDay();
    if (monthUtils.isAfter(endDate, today)) {
      endDate = today;
    }
  }

  const periods = generatePeriods(startDate, endDate, granularity);
  const result: Array<{ date: string; ageOfMoney: number }> = [];

  const agesByPeriod: Record<string, number[]> = {};
  for (const { date, age } of ages) {
    const periodKey = getPeriodKey(date, granularity);
    if (!agesByPeriod[periodKey]) {
      agesByPeriod[periodKey] = [];
    }
    agesByPeriod[periodKey].push(age);
  }

  let allAgesUpToPeriod: number[] = [];

  for (const period of periods) {
    if (agesByPeriod[period]) {
      allAgesUpToPeriod = allAgesUpToPeriod.concat(agesByPeriod[period]);
    }

    if (allAgesUpToPeriod.length > 0) {
      const lastN = allAgesUpToPeriod.slice(-10);
      const avg = Math.round(lastN.reduce((a, b) => a + b, 0) / lastN.length);
      result.push({ date: formatPeriodLabel(period, granularity), ageOfMoney: avg });
    }
  }

  return result;
}

/** Determine the trend based on the last few data points. */
export function calculateTrend(
  graphData: Array<{ date: string; ageOfMoney: number }>,
): "up" | "down" | "stable" {
  if (graphData.length < 2) return "stable";

  const last = graphData[graphData.length - 1].ageOfMoney;
  const secondLast = graphData[graphData.length - 2].ageOfMoney;

  const diff = last - secondLast;
  const threshold = 2;

  if (diff > threshold) return "up";
  if (diff < -threshold) return "down";
  return "stable";
}

export type AgeOfMoneyParams = {
  start: string;
  end: string;
  conditions?: RuleCondition[];
  conditionsOp?: "and" | "or";
  granularity?: AgeOfMoneyGranularity;
};

export function createAgeOfMoneySpreadsheet({
  start,
  end,
  conditions = [],
  conditionsOp = "and",
  granularity = "monthly",
}: AgeOfMoneyParams) {
  return async (setData: (data: AgeOfMoneyData) => void) => {
    const endDate = monthUtils.lastDayOfMonth(end);
    const today = monthUtils.currentDay();
    const fixedEnd = endDate > today ? today : endDate;

    const { filters, conditionsOpKey } = makeReportFilters(conditions, conditionsOp);

    // Income: regular income + transfers from off-budget accounts (money entering
    // the budget). Excludes on-budget-to-on-budget transfers.
    function makeIncomeQuery() {
      return q("transactions")
        .filter({ [conditionsOpKey]: filters })
        .filter({
          date: { $lte: fixedEnd },
          "account.offbudget": false,
          $or: [{ "payee.transfer_acct": null }, { "payee.transfer_acct.offbudget": true }],
          amount: { $gt: 0 },
        })
        .select(["id", "date", "amount"]);
    }

    function makeExpenseQuery() {
      return q("transactions")
        .filter({ [conditionsOpKey]: filters })
        .filter({
          date: { $lte: fixedEnd },
          "account.offbudget": false,
          $or: [{ "payee.transfer_acct": null }, { "payee.transfer_acct.offbudget": true }],
          amount: { $lt: 0 },
        })
        .select(["id", "date", "amount"]);
    }

    const [incomeData, expenseData] = await Promise.all([
      aqlQuery<Transaction[]>(makeIncomeQuery()).then(({ data }) => data),
      aqlQuery<Transaction[]>(makeExpenseQuery()).then(({ data }) => data),
    ]);

    const { ages, insufficientData } = calculateAgeOfMoney(incomeData, expenseData);

    const displayStart = monthUtils.firstDayOfMonth(start);
    const filteredAges = ages.filter(({ date }) => date >= displayStart);

    const graphData = calculateGraphData(filteredAges, start, end, granularity);
    const currentAge = calculateAverageAge(filteredAges, 10);
    const trend = calculateTrend(graphData);

    setData({ graphData, currentAge, trend, insufficientData });
  };
}
