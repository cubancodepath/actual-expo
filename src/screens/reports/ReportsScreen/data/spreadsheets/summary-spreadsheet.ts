/**
 * Summary spreadsheet — port of desktop-client
 * `spreadsheets/summary-spreadsheet.ts`. Computes the single number shown by the
 * Summary widget: sum, average per transaction / month / year, or a percentage
 * of one condition set over another. Mechanical substitutions vs upstream:
 *  - `send('make-filters-from-conditions')` → `makeReportFilters`
 *  - `aqlQuery` → `@/core/server/aql`
 * date-fns + monthUtils are kept as upstream; dates stay strings in the query.
 */
import * as d from "date-fns";
import type { Locale } from "date-fns";
import { q } from "@/core/queries";
import { aqlQuery } from "@/core/server/aql";
import * as monthUtils from "@/core/shared/monthUtils";
import type { RuleCondition } from "@/core/types/models";
import type { SummaryContent } from "@/core/types/models/dashboard";
import { makeReportFilters } from "../makeFilters";

export type SummaryData = {
  total: number;
  divisor: number;
  dividend: number;
  fromRange: string;
  toRange: string;
};

type SummaryRow = { date: string; amount: number; count: number };

export function summarySpreadsheet(
  start: string,
  end: string,
  conditions: RuleCondition[] = [],
  conditionsOp: "and" | "or" = "and",
  summaryContent: SummaryContent,
  locale: Locale,
) {
  return async (setData: (data: SummaryData) => void) => {
    const { filters, conditionsOpKey } = makeReportFilters(conditions, conditionsOp);

    let startDay: Date;
    let endDay: Date;
    try {
      startDay = d.parse(monthUtils.firstDayOfMonth(start), "yyyy-MM-dd", new Date());
      endDay = d.parse(
        monthUtils.getMonth(end) === monthUtils.getMonth(monthUtils.currentDay())
          ? monthUtils.currentDay()
          : monthUtils.lastDayOfMonth(end),
        "yyyy-MM-dd",
        new Date(),
      );
    } catch {
      throw new Error("Invalid date format provided");
    }

    if (!d.isValid(startDay) || !d.isValid(endDay)) {
      throw new Error("Invalid date values provided");
    }

    if (d.isAfter(startDay, endDay)) {
      throw new Error("Start date must be before or equal to end date.");
    }

    const getOneDatePerMonth = (start: Date, end: Date) => {
      const months = [];
      let currentDate = d.startOfMonth(start);

      while (!d.isSameMonth(currentDate, end)) {
        months.push(currentDate);
        currentDate = d.addMonths(currentDate, 1);
      }
      months.push(end);

      return months;
    };

    const makeRootQuery = () =>
      q("transactions")
        .filter({
          $and: [
            { date: { $gte: d.format(startDay, "yyyy-MM-dd") } },
            { date: { $lte: d.format(endDay, "yyyy-MM-dd") } },
          ],
        })
        .filter({ [conditionsOpKey]: filters })
        .select(["date", { amount: { $sum: "$amount" } }, { count: { $count: "*" } }]);

    let query = makeRootQuery();

    if (summaryContent.type === "avgPerMonth" || summaryContent.type === "avgPerYear") {
      query = query.groupBy(["date"]);
    }

    const { data } = await aqlQuery<SummaryRow[]>(query);

    const dateRanges = {
      fromRange: d.format(startDay, "MMM yy", { locale }),
      toRange: d.format(endDay, "MMM yy", { locale }),
    };

    switch (summaryContent.type) {
      case "sum":
        setData({
          ...dateRanges,
          total: data[0]?.amount ?? 0,
          dividend: data[0]?.amount ?? 0,
          divisor: 0,
        });
        break;

      case "avgPerTransact":
        setData({
          ...dateRanges,
          total: (data[0]?.count ?? 0) ? (data[0]?.amount ?? 0) / data[0].count : 0,
          dividend: data[0]?.amount ?? 0,
          divisor: data[0]?.count ?? 0,
        });
        break;

      case "avgPerMonth": {
        const months = getOneDatePerMonth(startDay, endDay);
        setData({ ...dateRanges, ...calculatePerMonth(data, months) });
        break;
      }

      case "avgPerYear":
        setData({ ...dateRanges, ...calculatePerYear(data, startDay, endDay) });
        break;

      case "percentage":
        setData({
          ...dateRanges,
          ...(await calculatePercentage(data, summaryContent, startDay, endDay)),
        });
        break;

      default:
        throw new Error("Unsupported summary type");
    }
  };
}

function calculatePerMonth(data: SummaryRow[], months: Date[]) {
  if (!data.length || !months.length) {
    return { total: 0, dividend: 0, divisor: 0 };
  }

  const monthlyData = data.reduce(
    (acc, day) => {
      const monthKey = d.format(d.parse(day.date, "yyyy-MM-dd", new Date()), "yyyy-MM");
      acc[monthKey] = (acc[monthKey] || 0) + day.amount;
      return acc;
    },
    {} as Record<string, number>,
  );

  const monthsSum = months.map((m) => ({ amount: monthlyData[d.format(m, "yyyy-MM")] || 0 }));

  const lastMonth = months.at(-1)!;
  const dayOfMonth = lastMonth.getDate();
  const daysInMonth = monthUtils.getDay(monthUtils.lastDayOfMonth(lastMonth));
  const numMonths = months.length - 1 + dayOfMonth / daysInMonth;

  const totalAmount = monthsSum.reduce((sum, month) => sum + month.amount, 0);
  const averageAmountPerMonth = totalAmount / numMonths;

  return { total: averageAmountPerMonth, dividend: totalAmount, divisor: numMonths };
}

function calculatePerYear(data: SummaryRow[], startDate: Date, endDate: Date) {
  if (!data.length) {
    return { total: 0, dividend: 0, divisor: 0 };
  }

  const totalAmount = data.reduce((sum, day) => sum + day.amount, 0);
  const totalDays = d.differenceInDays(endDate, startDate) + 1;
  const numYears = totalDays / 365.25;

  const averageAmountPerYear = totalAmount / numYears;

  return { total: averageAmountPerYear, dividend: totalAmount, divisor: numYears };
}

async function calculatePercentage(
  data: Array<{ amount: number }>,
  summaryContent: SummaryContent,
  startDay: Date,
  endDay: Date,
) {
  if (summaryContent.type !== "percentage") {
    return { total: 0, dividend: 0, divisor: 0 };
  }

  const { filters, conditionsOpKey } = makeReportFilters(
    summaryContent.divisorConditions,
    summaryContent.divisorConditionsOp,
  );

  const makeDivisorQuery = () =>
    q("transactions")
      .filter({ [conditionsOpKey]: filters })
      .select([{ amount: { $sum: "$amount" } }]);

  let query = makeDivisorQuery();

  if (!(summaryContent.divisorAllTimeDateRange ?? false)) {
    query = query.filter({
      $and: [
        { date: { $gte: d.format(startDay, "yyyy-MM-dd") } },
        { date: { $lte: d.format(endDay, "yyyy-MM-dd") } },
      ],
    });
  }

  const { data: divisorData } = await aqlQuery<{ amount: number }[]>(query);
  const divisorValue = divisorData?.[0]?.amount ?? 0;

  const dividend = data.reduce((prev, ac) => prev + (ac?.amount ?? 0), 0);
  return {
    total: Math.round(((dividend ?? 0) / (divisorValue ?? 1)) * 10000) / 100,
    divisor: divisorValue ?? 0,
    dividend: dividend ?? 0,
  };
}
