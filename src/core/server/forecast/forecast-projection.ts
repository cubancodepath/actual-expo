/**
 * Day-by-day balance projection. Port of server/forecast/forecast-projection.ts.
 * Seed = Σ posted amounts before the start; then walk each day adding posted +
 * scheduled deltas into a running balance, per account. Dates are 'yyyy-MM-dd'
 * strings compared lexicographically.
 */
import { addMonths, addDays, format } from "date-fns";
import { parseDate, dayFromDate } from "@/core/domain/schedules/recurrence";
import type {
  AccountWithComputedBalance,
  ForecastDataPoint,
  ForecastDateContext,
  ForecastResult,
  ForecastScheduleOccurrence,
} from "@/core/types/models";

type PostedTxn = { account: string; date: string; amount: number };
type OccSummary = { amount: number; payee: string; scheduleId: string; scheduleName: string };
type OccByAccount = Record<string, Record<string, OccSummary[]>>;

/** Every 'yyyy-MM-dd' from start to end inclusive. */
export function dayRangeInclusive(start: string, end: string): string[] {
  const days: string[] = [];
  let d = parseDate(start);
  const endD = parseDate(end);
  while (d <= endD) {
    days.push(dayFromDate(d));
    d = addDays(d, 1);
  }
  return days;
}

function maxDate(a: string, b: string): string {
  return a > b ? a : b;
}

export function buildForecastDateContext(
  startDate: string | undefined,
  endDate: string | undefined,
): ForecastDateContext {
  const today = new Date();
  const forecastStartDate = startDate || format(today, "yyyy-MM-dd");
  const forecastEndDate = endDate || format(addMonths(today, 12), "yyyy-MM-dd");
  const todayString = format(today, "yyyy-MM-dd");
  return {
    forecastStartDate,
    forecastEndDate,
    forecastDays: dayRangeInclusive(forecastStartDate, forecastEndDate),
    firstForecastDate:
      forecastEndDate < todayString ? forecastStartDate : maxDate(forecastStartDate, todayString),
    endDateObj: endDate ? parseDate(endDate) : addMonths(today, 12),
  };
}

export function createEmptyForecastResult(
  forecastStartDate: string,
  forecastEndDate: string,
): ForecastResult {
  return {
    dataPoints: [],
    lowestBalance: { date: forecastStartDate, balance: 0, accountId: "", accountName: "" },
    forecastStartDate,
    forecastEndDate,
  };
}

function indexScheduleOccurrences(
  futureOccurrences: ForecastScheduleOccurrence[],
  accountIdSet: Set<string>,
  filterMatch: (txn: Record<string, unknown>) => boolean,
  firstForecastDate: string,
  forecastEndDate: string,
): OccByAccount {
  const byAccount: OccByAccount = {};
  for (const occ of futureOccurrences) {
    if (
      occ.date < firstForecastDate ||
      occ.date > forecastEndDate ||
      !accountIdSet.has(occ.account) ||
      !filterMatch(occ.transaction)
    ) {
      continue;
    }
    (byAccount[occ.account] ??= {})[occ.date] ??= [];
    byAccount[occ.account][occ.date].push({
      amount: occ.amount,
      payee: occ.payee,
      scheduleId: occ.scheduleId,
      scheduleName: occ.scheduleName,
    });
  }
  return byAccount;
}

function summarizePostedTransactions(
  txns: PostedTxn[],
  start: string,
  end: string,
): { startingBalance: number; txsByDay: Record<string, number> } {
  const summary = { startingBalance: 0, txsByDay: {} as Record<string, number> };
  for (const tx of txns) {
    if (tx.date < start) {
      summary.startingBalance += tx.amount;
      continue;
    }
    if (tx.date > end) continue;
    summary.txsByDay[tx.date] = (summary.txsByDay[tx.date] || 0) + tx.amount;
  }
  return summary;
}

function buildAccountForecastDataPoints(
  account: AccountWithComputedBalance,
  posted: { startingBalance: number; txsByDay: Record<string, number> },
  occByDay: Record<string, OccSummary[]>,
  forecastDays: string[],
): ForecastDataPoint[] {
  let running = posted.startingBalance;
  return forecastDays.map((day) => {
    const scheduleTxns = occByDay[day] || [];
    running += (posted.txsByDay[day] || 0) + scheduleTxns.reduce((s, t) => s + t.amount, 0);
    return {
      date: day,
      balance: running,
      accountId: account.id,
      accountName: account.name,
      transactions: scheduleTxns.map((t) => ({
        amount: t.amount,
        payee: t.payee,
        scheduleId: t.scheduleId,
        scheduleName: t.scheduleName,
      })),
    };
  });
}

function calculateLowestBalance(
  dataPoints: ForecastDataPoint[],
  accounts: AccountWithComputedBalance[],
  forecastStartDate: string,
) {
  const combined: Record<string, number> = {};
  for (const dp of dataPoints) combined[dp.date] = (combined[dp.date] || 0) + dp.balance;

  let lowest = { date: forecastStartDate, balance: Infinity, accountId: "", accountName: "" };
  for (const [date, bal] of Object.entries(combined)) {
    if (bal < lowest.balance) lowest = { date, balance: bal, accountId: "", accountName: "" };
  }
  if (lowest.balance === Infinity) {
    return {
      date: forecastStartDate,
      balance: accounts.reduce((s, a) => s + a.balance_current, 0),
      accountId: "",
      accountName: "",
    };
  }
  return lowest;
}

export function projectForecastData({
  accounts,
  transactions,
  futureOccurrences,
  filterMatch,
  dateContext,
}: {
  accounts: AccountWithComputedBalance[];
  transactions: PostedTxn[];
  futureOccurrences: ForecastScheduleOccurrence[];
  filterMatch: (txn: Record<string, unknown>) => boolean;
  dateContext: ForecastDateContext;
}): Pick<ForecastResult, "dataPoints" | "lowestBalance"> {
  const accountIdSet = new Set(accounts.map((a) => a.id));
  const occByAccount = indexScheduleOccurrences(
    futureOccurrences,
    accountIdSet,
    filterMatch,
    dateContext.firstForecastDate,
    dateContext.forecastEndDate,
  );

  const txnsByAccount = new Map<string, PostedTxn[]>();
  for (const tx of transactions) {
    (txnsByAccount.get(tx.account) ?? txnsByAccount.set(tx.account, []).get(tx.account)!).push(tx);
  }

  const dataPoints = accounts.flatMap((account) =>
    buildAccountForecastDataPoints(
      account,
      summarizePostedTransactions(
        txnsByAccount.get(account.id) ?? [],
        dateContext.forecastStartDate,
        dateContext.forecastEndDate,
      ),
      occByAccount[account.id] ?? {},
      dateContext.forecastDays,
    ),
  );

  dataPoints.sort((a, b) => a.date.localeCompare(b.date));

  return {
    dataPoints,
    lowestBalance: calculateLowestBalance(dataPoints, accounts, dateContext.forecastStartDate),
  };
}
