/**
 * Tracking-budget forecast source — monthly projection off the budget sheet.
 * Port of server/forecast/forecast-tracking-budget.ts. Seed = Σ on-budget
 * account balances; each month adds budgeted income − budgeted expenses.
 */
import { addMonths, lastDayOfMonth as lastDayFns, format } from "date-fns";
import { getSpreadsheet } from "@/core/domain/spreadsheet/instance";
import { sheetForMonth, trackingBudget } from "@/core/domain/spreadsheet/bindings";
import { ensureMonthRange } from "@/core/domain/spreadsheet/sync";
import type { AccountWithComputedBalance, ForecastDataPoint, ForecastDateContext } from "./types";

const TRACKING_BUDGET_FORECAST_ACCOUNT_ID = "tracking-budget";
const TRACKING_BUDGET_FORECAST_ACCOUNT_NAME = "Tracking Budget";

function num(v: unknown): number {
  return typeof v === "number" ? v : 0;
}

/** Inclusive list of 'yyyy-MM' months. */
function monthRangeInclusive(startMonth: string, endMonth: string): string[] {
  const months: string[] = [];
  let d = new Date(`${startMonth}-01T12:00:00`);
  const end = new Date(`${endMonth}-01T12:00:00`);
  while (d <= end) {
    months.push(format(d, "yyyy-MM"));
    d = addMonths(d, 1);
  }
  return months;
}

function lastDayOfMonth(month: string): string {
  return format(lastDayFns(new Date(`${month}-01T12:00:00`)), "yyyy-MM-dd");
}

export async function projectTrackingBudgetForecast({
  accounts,
  dateContext,
}: {
  accounts: AccountWithComputedBalance[];
  dateContext: ForecastDateContext;
}): Promise<Pick<import("./types").ForecastResult, "dataPoints" | "lowestBalance">> {
  let running = accounts.reduce((sum, a) => (a.offbudget === 0 ? sum + a.balance_current : sum), 0);

  const startMonth = dateContext.forecastStartDate.slice(0, 7);
  const endMonth = dateContext.forecastEndDate.slice(0, 7);
  const ss = getSpreadsheet();

  const dataPoints: ForecastDataPoint[] = [];
  for (const month of monthRangeInclusive(startMonth, endMonth)) {
    await ensureMonthRange(month);
    const income = num(ss.getValue(sheetForMonth(month), trackingBudget.totalBudgetIncome));
    const budgeted = num(ss.getValue(sheetForMonth(month), trackingBudget.totalBudgeted));
    running += income - budgeted;
    dataPoints.push({
      date: lastDayOfMonth(month),
      balance: running,
      accountId: TRACKING_BUDGET_FORECAST_ACCOUNT_ID,
      accountName: TRACKING_BUDGET_FORECAST_ACCOUNT_NAME,
      transactions: [],
    });
  }

  const lowestBalance = dataPoints.reduce(
    (lowest, p) => (p.balance < lowest.balance ? p : lowest),
    dataPoints[0] ?? {
      date: dateContext.forecastStartDate,
      balance: running,
      accountId: TRACKING_BUDGET_FORECAST_ACCOUNT_ID,
      accountName: TRACKING_BUDGET_FORECAST_ACCOUNT_NAME,
      transactions: [],
    },
  );

  return {
    dataPoints,
    lowestBalance: {
      date: lowestBalance.date,
      balance: lowestBalance.balance,
      accountId: lowestBalance.accountId,
      accountName: lowestBalance.accountName,
    },
  };
}
