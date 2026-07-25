/**
 * Net worth spreadsheet — ported from desktop-client
 * `spreadsheets/net-worth-spreadsheet.ts`. Mechanical substitutions vs upstream:
 *  - `send('make-filters-from-conditions')` → `makeReportFilters`
 *  - `send('get-earliest-transaction')`     → `getEarliestTransaction`
 *  - `aqlQuery`   → `@/core/server/aql`
 *  - `monthUtils` → `@/core/shared/monthUtils`
 *  - `keyBy` (es-toolkit) → inlined
 * Field names are upstream-faithful now (the AQL port uses `account`).
 * The outer closure drops upstream's unused `spreadsheet` arg.
 *
 * Intentional divergence from upstream: instead of 2 AQL queries PER account
 * (2N+1 total), the starting balances and interval balances are fetched with
 * two account-grouped queries and regrouped per account in JS. Same filters,
 * same per-account numbers — `recalculate` is untouched.
 */
import * as d from "date-fns";
import type { Locale } from "date-fns";
import { q } from "@/lib/queries";
import { aqlQuery } from "@/core/server/aql";
import * as monthUtils from "@/core/shared/monthUtils";
import { getEarliestTransaction } from "@/core/server/transactions";
import type { RuleCondition } from "@/core/types/models";
import type { MoneyFormatType } from "@/lib/hooks/useFormat";
import { ReportOptions } from "../ReportOptions";
import { makeReportFilters } from "../makeFilters";

type Balance = { date: string; amount: number };

type Account = { id: string; name: string };

type FormatFn = (value: number, type?: MoneyFormatType) => string;

function keyBy<T>(items: T[], getKey: (item: T) => string): Record<string, T> {
  const out: Record<string, T> = {};
  for (const item of items) out[getKey(item)] = item;
  return out;
}

export function createSpreadsheet(
  start: string,
  end: string,
  accounts: Account[],
  conditions: RuleCondition[] = [],
  conditionsOp: "and" | "or" = "and",
  locale: Locale,
  interval: string = "Monthly",
  firstDayOfWeekIdx: string = "0",
  format: FormatFn,
) {
  return async (setData: (data: ReturnType<typeof recalculate>) => void) => {
    const { filters, conditionsOpKey } = makeReportFilters(conditions, conditionsOp);

    // Go back exactly one interval before the selected range start to get the
    // correct starting balance for the first period.
    const rangeStart = d.parseISO(monthUtils.firstDayOfMonth(start));
    let startDate: string;
    if (interval === "Daily") {
      startDate = monthUtils.dayFromDate(d.subDays(rangeStart, 1));
    } else if (interval === "Weekly") {
      startDate = monthUtils.weekFromDate(d.subDays(rangeStart, 1), firstDayOfWeekIdx);
    } else {
      startDate = monthUtils.firstDayOfMonth(monthUtils.prevMonth(start));
    }

    // If the earliest transaction is on or after the first day of the start
    // month, the prior-period lookback would be all zeros. Skip it.
    const earliestTransaction = await getEarliestTransaction();
    if (earliestTransaction && earliestTransaction.date >= monthUtils.firstDayOfMonth(start)) {
      if (interval === "Daily") {
        startDate = earliestTransaction.date;
      } else if (interval === "Weekly") {
        startDate = monthUtils.weekFromDate(earliestTransaction.date, firstDayOfWeekIdx);
      } else {
        startDate = monthUtils.firstDayOfMonth(start);
      }
    }

    let endDate = monthUtils.lastDayOfMonth(end);
    if (interval === "Daily" || interval === "Weekly") {
      const today = monthUtils.currentDay();
      if (monthUtils.isAfter(endDate, today)) {
        endDate = today;
      }
    }

    // One row per account instead of one query per account; extra accounts
    // (closed, not in the widget's list) are simply never read back.
    const intervalExpr =
      interval === "Yearly"
        ? { $year: "$date" }
        : interval === "Daily" || interval === "Weekly"
          ? "date"
          : { $month: "$date" };

    const [startingRows, balanceRows] = await Promise.all([
      aqlQuery<Array<{ account: string; amount: number }>>(
        q("transactions")
          .filter({
            [conditionsOpKey]: filters,
            date: { $lt: startDate },
          })
          .groupBy("account")
          .select(["account", { amount: { $sum: "$amount" } }]),
      ).then(({ data }) => data),

      aqlQuery<Array<{ account: string; date: string; amount: number }>>(
        q("transactions")
          .filter({ [conditionsOpKey]: filters })
          .filter({
            $and: [{ date: { $gte: startDate } }, { date: { $lte: endDate } }],
          })
          .groupBy(["account", intervalExpr])
          .select(["account", { date: intervalExpr }, { amount: { $sum: "$amount" } }]),
      ).then(({ data }) => data),
    ]);

    const startingByAccount = new Map(startingRows.map((row) => [row.account, row.amount]));
    const balancesByAccount = new Map<string, Balance[]>();
    for (const row of balanceRows) {
      let list = balancesByAccount.get(row.account);
      if (!list) {
        list = [];
        balancesByAccount.set(row.account, list);
      }
      list.push({ date: row.date, amount: row.amount });
    }

    const data = accounts.map((acct) => {
      const balances = balancesByAccount.get(acct.id) ?? [];
      const starting = startingByAccount.get(acct.id) ?? 0;

      let processedBalances: Record<string, Balance>;
      if (interval === "Weekly") {
        const weeklyBalances: Record<string, number> = {};
        balances.forEach((b) => {
          const weekDate = monthUtils.weekFromDate(b.date, firstDayOfWeekIdx);
          weeklyBalances[weekDate] = (weeklyBalances[weekDate] || 0) + b.amount;
        });
        processedBalances = {};
        Object.entries(weeklyBalances).forEach(([date, amount]) => {
          processedBalances[date] = { date, amount };
        });
      } else {
        processedBalances = keyBy(balances, (b) => b.date);
      }

      return { id: acct.id, name: acct.name, balances: processedBalances, starting };
    });

    setData(recalculate(data, startDate, endDate, locale, interval, firstDayOfWeekIdx, format));
  };
}

function recalculate(
  data: Array<{ id: string; name: string; balances: Record<string, Balance>; starting: number }>,
  startDate: string,
  endDate: string,
  locale: Locale,
  interval: string = "Monthly",
  firstDayOfWeekIdx: string = "0",
  format: FormatFn = (v) => String(v),
) {
  const intervals =
    interval === "Weekly"
      ? monthUtils.weekRangeInclusive(startDate, endDate, firstDayOfWeekIdx)
      : interval === "Daily"
        ? monthUtils.dayRangeInclusive(startDate, endDate)
        : interval === "Yearly"
          ? monthUtils.yearRangeInclusive(startDate, endDate)
          : monthUtils.rangeInclusive(monthUtils.getMonth(startDate), monthUtils.getMonth(endDate));

  const accountBalances = data.map((account) => {
    let balance = account.starting;
    return intervals.map((intervalItem) => {
      if (account.balances[intervalItem]) {
        balance += account.balances[intervalItem].amount;
      }
      return balance;
    });
  });

  const priorPeriodNetWorth = data.reduce((sum, account) => sum + account.starting, 0);

  let hasNegative = false;
  let startNetWorth = 0;
  let endNetWorth = 0;
  let lowestNetWorth: number | null = null;
  let highestNetWorth: number | null = null;

  const graphData = intervals.reduce<
    Array<{
      x: string;
      y: number;
      assets: string;
      debt: string;
      change: string;
      networth: string;
      date: string;
    }>
  >((arr, intervalItem, idx) => {
    let debt = 0;
    let assets = 0;
    let total = 0;
    const last = arr.length === 0 ? null : arr[arr.length - 1];

    const balances: Record<string, number> = {};
    accountBalances.forEach((acctBalances, i) => {
      const balance = acctBalances[idx];
      balances[data[i].id] = balance;
      if (balance < 0) {
        debt += -balance;
      } else {
        assets += balance;
      }
      total += balance;
    });

    if (total < 0) {
      hasNegative = true;
    }

    let x: Date;
    if (interval === "Daily" || interval === "Weekly") {
      x = d.parseISO(intervalItem);
    } else if (interval === "Yearly") {
      x = d.parseISO(intervalItem + "-01-01");
    } else {
      x = d.parseISO(intervalItem + "-01");
    }

    const change = last ? total - last.y : total - priorPeriodNetWorth;

    if (arr.length === 0) {
      startNetWorth = total;
    }
    endNetWorth = total;

    const displayFormat = ReportOptions.intervalFormat.get(interval) ?? "MMM ''yy";
    const tooltipFormat =
      interval === "Daily"
        ? "MMMM d, yyyy"
        : interval === "Weekly"
          ? "MMM d, yyyy"
          : interval === "Yearly"
            ? "yyyy"
            : "MMMM yyyy";

    const graphPoint = {
      x: d.format(x, displayFormat, { locale }),
      y: total,
      assets: format(assets, "financial"),
      debt: `-${format(debt, "financial")}`,
      change: format(change, "financial"),
      networth: format(total, "financial"),
      date: d.format(x, tooltipFormat, { locale }),
      ...balances,
    };

    arr.push(graphPoint);

    if (lowestNetWorth === null || graphPoint.y < lowestNetWorth) {
      lowestNetWorth = graphPoint.y;
    }
    if (highestNetWorth === null || graphPoint.y > highestNetWorth) {
      highestNetWorth = graphPoint.y;
    }

    return arr;
  }, []);

  const hasBalance = accountBalances.map((balances) => balances.some((b) => b !== 0));

  return {
    graphData: { data: graphData, hasNegative, start: startDate, end: endDate },
    netWorth: endNetWorth,
    totalChange: endNetWorth - startNetWorth,
    lowestNetWorth,
    highestNetWorth,
    accounts: data.filter((_, i) => hasBalance[i]).map((d) => ({ id: d.id, name: d.name })),
  };
}

export type NetWorthData = ReturnType<typeof recalculate>;
