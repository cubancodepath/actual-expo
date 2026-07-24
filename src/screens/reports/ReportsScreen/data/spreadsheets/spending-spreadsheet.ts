/**
 * Spending spreadsheet — port of desktop-client
 * `reports/spreadsheets/spending-spreadsheet.ts`. Builds the cumulative daily
 * spending series for the compare month against a comparison month / average /
 * budget. Mechanical substitutions vs upstream:
 *  - `send('make-filters-from-conditions')` → `makeReportFilters`
 *  - `send('get-earliest-transaction')`     → `getEarliestTransaction`
 *  - `send('get-categories')`               → `categories`/`categoryGroups` params
 *    (the card has them via `useCategories`; the spreadsheet is not a hook)
 *  - `aqlQuery` → `@/core/server/aql`; `keyBy` inlined; dates stay strings.
 */
import { q } from "@/core/queries";
import { aqlQuery } from "@/core/server/aql";
import * as monthUtils from "@/core/shared/monthUtils";
import { getEarliestTransaction } from "@/core/server/transactions";
import type {
  Category,
  CategoryGroup,
  RuleCondition,
  SpendingAverageRange,
  SpendingEntity,
  SpendingMonthEntity,
} from "@/core/types/models";
import { makeReportFilters } from "../makeFilters";
import { makeQuery } from "../makeQuery";
import { filterCategoriesByConditions, isSupportedCategoryCondition } from "../budgetDataQuery";
import { resolveSpendingAverageRange } from "../spendingAverageRange";

function keyBy<T>(items: T[], getKey: (item: T) => string): Record<string, T> {
  const out: Record<string, T> = {};
  for (const item of items) out[getKey(item)] = item;
  return out;
}

type QueryRow = {
  date: string;
  category: string | null;
  categoryHidden: boolean | null;
  categoryIncome: boolean | null;
  categoryGroup: string | null;
  categoryGroupHidden: boolean | null;
  account: string | null;
  accountOffBudget: boolean | null;
  payee: string | null;
  transferAccount: string | null;
  amount: number;
};

type CreateSpendingSpreadsheetProps = {
  conditions?: RuleCondition[];
  conditionsOp?: "and" | "or";
  compare?: string;
  compareTo?: string;
  averageRange?: SpendingAverageRange;
  budgetType?: "envelope" | "tracking";
  categories: Category[];
  categoryGroups: CategoryGroup[];
};

/** Build the budget-table filter from category/category_group conditions. */
export function getSpendingBudgetFilters({
  categories,
  categoryGroups,
  conditions,
  conditionsOp,
}: {
  categories: Category[];
  categoryGroups: CategoryGroup[];
  conditions: RuleCondition[];
  conditionsOp?: "and" | "or";
}) {
  const budgetConditions = conditions.filter(
    (cond) =>
      !(cond as { customName?: unknown }).customName &&
      (cond.field === "category" || cond.field === "category_group"),
  );

  if (budgetConditions.length === 0) {
    return [];
  }

  if (!budgetConditions.every(isSupportedCategoryCondition)) {
    return [];
  }

  const matchingCategoryIds = filterCategoriesByConditions(
    categories,
    categoryGroups,
    budgetConditions,
    conditionsOp ?? "and",
  ).map((category) => category.id);

  return [{ category: { $oneof: matchingCategoryIds } }];
}

export function createSpendingSpreadsheet({
  conditions = [],
  conditionsOp,
  compare,
  compareTo,
  averageRange,
  budgetType = "envelope",
  categories,
  categoryGroups,
}: CreateSpendingSpreadsheetProps) {
  const compareMonth = compare ?? monthUtils.currentMonth();
  const compareToMonth = compareTo ?? monthUtils.subMonths(compareMonth, 1);
  const endDate = monthUtils.getMonthEnd(compareMonth + "-01");
  const startDateTo = compareToMonth + "-01";
  const endDateTo = monthUtils.getMonthEnd(compareToMonth + "-01");
  const interval = "Daily";
  const compareInterval = monthUtils.dayRangeInclusive(compareMonth + "-01", endDate);

  return async (setData: (data: SpendingEntity) => void) => {
    const earliestTrans = averageRange?.mode === "all-time" ? await getEarliestTransaction() : null;
    const earliestMonth = earliestTrans ? monthUtils.monthFromDate(earliestTrans.date) : null;
    const resolvedAverageRange = resolveSpendingAverageRange({
      averageRange,
      compare: compareMonth,
      earliestMonth,
    });
    const averageMonths = new Set(resolvedAverageRange.months);
    const startDate = (resolvedAverageRange.startMonth ?? compareMonth) + "-01";

    const { filters, conditionsOpKey } = makeReportFilters(conditions, conditionsOp);

    const [assets, debts] = await Promise.all([
      aqlQuery<QueryRow[]>(
        makeQuery("assets", startDate, endDate, interval, conditionsOpKey, filters),
      ).then(({ data }) => data),
      aqlQuery<QueryRow[]>(
        makeQuery("debts", startDate, endDate, interval, conditionsOpKey, filters),
      ).then(({ data }) => data),
    ]);

    const [assetsTo, debtsTo] = await Promise.all([
      aqlQuery<QueryRow[]>(
        makeQuery("assets", startDateTo, endDateTo, interval, conditionsOpKey, filters),
      ).then(({ data }) => data),
      aqlQuery<QueryRow[]>(
        makeQuery("debts", startDateTo, endDateTo, interval, conditionsOpKey, filters),
      ).then(({ data }) => data),
    ]);

    const overlapAssets = endDateTo < startDate || startDateTo > endDate ? assetsTo : [];
    const overlapDebts = endDateTo < startDate || startDateTo > endDate ? debtsTo : [];

    const combineAssets = [...assets, ...overlapAssets];
    const combineDebts = [...debts, ...overlapDebts];
    const totalsByDate = new Map<string, { perIntervalAssets: number; perIntervalDebts: number }>();

    combineAssets
      .filter((e) => !e.categoryIncome && !e.accountOffBudget)
      .forEach((asset) => {
        const totals = totalsByDate.get(asset.date) ?? {
          perIntervalAssets: 0,
          perIntervalDebts: 0,
        };
        totals.perIntervalAssets += asset.amount;
        totalsByDate.set(asset.date, totals);
      });

    combineDebts
      .filter((e) => !e.categoryIncome && !e.accountOffBudget)
      .forEach((debt) => {
        const totals = totalsByDate.get(debt.date) ?? {
          perIntervalAssets: 0,
          perIntervalDebts: 0,
        };
        totals.perIntervalDebts += debt.amount;
        totalsByDate.set(debt.date, totals);
      });

    const budgetMonth = parseInt(compareMonth.replace("-", ""));
    const budgetTable = budgetType === "tracking" ? "reflect_budgets" : "zero_budgets";
    const hasBudgetConditions = conditions.some(
      (cond) =>
        !(cond as { customName?: unknown }).customName &&
        (cond.field === "category" || cond.field === "category_group"),
    );
    const budgetFilters = hasBudgetConditions
      ? getSpendingBudgetFilters({ categories, categoryGroups, conditions, conditionsOp })
      : [];

    const budgets = await aqlQuery<{ category: string; amount: number }[]>(
      q(budgetTable)
        .filter({ $and: [{ month: { $eq: budgetMonth } }, ...budgetFilters] })
        .groupBy([{ $id: "$category" }])
        .select([{ category: { $id: "$category" } }, { amount: { $sum: "$amount" } }]),
    ).then(({ data }) => data);

    const dailyBudget = budgets.reduce((a, v) => a + v.amount, 0) / compareInterval.length;

    const intervals = monthUtils.dayRangeInclusive(startDate, endDate);
    if (endDateTo < startDate || startDateTo > endDate) {
      intervals.push(...monthUtils.dayRangeInclusive(startDateTo, endDateTo));
    }

    const days = [...Array(29).keys()]
      .filter((f) => f > 0)
      .map((n) => n.toString().padStart(2, "0"));

    let totalAssets = 0;
    let totalDebts = 0;
    let totalBudget = 0;

    const months = monthUtils.rangeInclusive(startDate, endDate).map((month) => {
      return { month, perMonthAssets: 0, perMonthDebts: 0 };
    });

    if (endDateTo < startDate || startDateTo > endDate) {
      months.unshift({ month: compareToMonth, perMonthAssets: 0, perMonthDebts: 0 });
    }

    const intervalData = days.map((day) => {
      let averageSum = 0;
      let monthCount = 0;
      const dayData = months.map((month) => {
        const data = intervals.reduce<
          Array<{
            date: string;
            totalDebts: number;
            totalAssets: number;
            totalTotals: number;
            cumulative: number | null;
          }>
        >((arr, intervalItem) => {
          const offsetDay =
            Number(intervalItem.substring(8, 10)) >= 28 ? "28" : intervalItem.substring(8, 10);
          let perIntervalAssets = 0;
          let perIntervalDebts = 0;

          if (month.month === monthUtils.getMonth(intervalItem) && day === offsetDay) {
            const totals = totalsByDate.get(intervalItem);
            perIntervalAssets += totals?.perIntervalAssets ?? 0;
            perIntervalDebts += totals?.perIntervalDebts ?? 0;

            totalAssets += perIntervalAssets;
            totalDebts += perIntervalDebts;

            let cumulativeAssets = 0;
            let cumulativeDebts = 0;

            if (month.month === compareMonth) {
              totalBudget -= dailyBudget;
            }

            months.map((m) => {
              if (m.month === month.month) {
                cumulativeAssets = m.perMonthAssets += perIntervalAssets;
                cumulativeDebts = m.perMonthDebts += perIntervalDebts;
              }
              return null;
            });

            if (averageMonths.has(month.month)) {
              if (day === "28") {
                if (monthUtils.getMonthEnd(intervalItem) === intervalItem) {
                  averageSum += cumulativeAssets + cumulativeDebts;
                  monthCount += 1;
                }
              } else {
                averageSum += cumulativeAssets + cumulativeDebts;
                monthCount += 1;
              }
            }

            arr.push({
              date: intervalItem,
              totalDebts: perIntervalDebts,
              totalAssets: perIntervalAssets,
              totalTotals: perIntervalDebts + perIntervalAssets,
              cumulative:
                intervalItem <= monthUtils.currentDay() ? cumulativeDebts + cumulativeAssets : null,
            });
          }

          return arr;
        }, []);
        const maxCumulative = data.reduce((a, b) => (b.cumulative === null ? a : b)).cumulative;

        const totalDaily = data.reduce((a, v) => a + v.totalTotals, 0);

        return {
          date: data[0].date,
          cumulative: maxCumulative,
          daily: totalDaily,
          month: month.month,
        };
      });
      // cumulative is null for future days (upstream types it loosely under
      // @ts-strict-ignore); the graph guards for null.
      const indexedData = keyBy(dayData, (d) => d.month) as unknown as SpendingMonthEntity;
      return {
        months: indexedData,
        day,
        average: monthCount === 0 ? 0 : Math.round(averageSum / monthCount),
        compare: dayData.filter((c) => c.month === compareMonth)[0].cumulative as number,
        compareTo: dayData.filter((c) => c.month === compareToMonth)[0].cumulative as number,
        budget: totalBudget,
      };
    });

    setData({
      intervalData,
      averageRange: resolvedAverageRange,
      startDate,
      endDate,
      totalDebts,
      totalAssets,
      totalTotals: totalAssets + totalDebts,
    });
  };
}
