/**
 * Calendar spreadsheet — port of desktop-client `spreadsheets/calendar-spreadsheet.ts`,
 * adapted to a SINGLE month (mobile shows one month at a time; the heroui
 * `Calendar` builds the grid, so we only need per-day values + totals, not the
 * padded grid array upstream computes). Kept faithful:
 *  - two `groupBy('date')` sums, income (`amount > 0`) and expense (`amount < 0`)
 *  - `getBarLength` normalization: |value| / monthTotal * 100
 * Substitutions: `send('make-filters-from-conditions')` → `makeReportFilters`;
 * `aqlQuery` → `@/core/server/aql`; dates stay strings.
 */
import { q } from "@/core/queries";
import { aqlQuery } from "@/core/server/aql";
import * as monthUtils from "@/core/shared/monthUtils";
import type { RuleCondition } from "@/core/types/models";
import { makeReportFilters } from "../makeFilters";

export type CalendarDayValue = {
  incomeValue: number;
  expenseValue: number;
  incomeSize: number;
  expenseSize: number;
};

export type CalendarMonthData = {
  /** Keyed by "YYYY-MM-DD". */
  daysByKey: Record<string, CalendarDayValue>;
  totalIncome: number;
  totalExpense: number;
};

type DateSumRow = { date: string; amount: number };

export function calendarSpreadsheet(
  month: string,
  conditions: RuleCondition[] = [],
  conditionsOp: "and" | "or" = "and",
) {
  const start = monthUtils.firstDayOfMonth(month);
  const end = monthUtils.lastDayOfMonth(month);

  return async (setData: (data: CalendarMonthData) => void) => {
    const { filters, conditionsOpKey } = makeReportFilters(conditions, conditionsOp);

    const makeRootQuery = () =>
      q("transactions")
        .filter({
          $and: [{ date: { $gte: start } }, { date: { $lte: end } }],
        })
        .filter({ [conditionsOpKey]: filters })
        .groupBy(["date"])
        .select(["date", { amount: { $sum: "$amount" } }]);

    const [expenseData, incomeData] = await Promise.all([
      aqlQuery<DateSumRow[]>(makeRootQuery().filter({ $and: { amount: { $lt: 0 } } })).then(
        ({ data }) => data,
      ),
      aqlQuery<DateSumRow[]>(makeRootQuery().filter({ $and: { amount: { $gt: 0 } } })).then(
        ({ data }) => data,
      ),
    ]);

    const totalIncome = incomeData.reduce((a, v) => a + Math.abs(v.amount), 0);
    const totalExpense = expenseData.reduce((a, v) => a + Math.abs(v.amount), 0);

    // Bar length as a percentage of the month total for that direction, matching
    // upstream `getBarLength` (finite-guarded, 0 when the total is non-positive).
    const barLength = (value: number, total: number) => {
      if (value <= 0 || total <= 0) return 0;
      const result = (value / total) * 100;
      return Number.isFinite(result) ? result : 0;
    };

    const daysByKey: Record<string, CalendarDayValue> = {};
    const ensure = (key: string) =>
      (daysByKey[key] ??= { incomeValue: 0, expenseValue: 0, incomeSize: 0, expenseSize: 0 });

    incomeData.forEach((row) => {
      ensure(row.date).incomeValue = Math.abs(row.amount);
    });
    expenseData.forEach((row) => {
      ensure(row.date).expenseValue = Math.abs(row.amount);
    });

    for (const key of Object.keys(daysByKey)) {
      const day = daysByKey[key];
      day.incomeSize = barLength(day.incomeValue, totalIncome);
      day.expenseSize = barLength(day.expenseValue, totalExpense);
    }

    setData({ daysByKey, totalIncome, totalExpense });
  };
}
