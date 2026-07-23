/**
 * Forecast orchestrator — port of server/forecast/app.ts::generateForecast.
 * Read-only. Two sources: `schedules` (day-by-day projection from schedule
 * occurrences + posted transactions) and `tracking-budget` (monthly).
 */
import { runQuery } from "@/core/db";
import { intToStr } from "@/core/shared/months";
import { getBudgetType } from "../preferences";
import { buildForecastFilter } from "./forecast-filters";
import { resolveForecastAccounts } from "./forecast-accounts";
import {
  getNormalizedSchedules,
  buildFutureScheduleOccurrences,
  FORECAST_UNASSIGNED_ACCOUNT_ID,
} from "./forecast-schedules";
import {
  buildForecastDateContext,
  createEmptyForecastResult,
  projectForecastData,
} from "./forecast-projection";
import { projectTrackingBudgetForecast } from "./forecast-tracking-budget";
import { getForecastAccounts } from "./forecast-accounts";
import type {
  AccountWithComputedBalance,
  ForecastRequestParams,
  ForecastResult,
} from "@/core/types/models";

/** A posted transaction shaped like a rules txn (public field names, string date). */
type PostedForecastTxn = {
  account: string;
  payee: string | null;
  category: string | null;
  amount: number;
  date: string;
  notes: string | null;
  cleared: boolean;
  reconciled: boolean;
  transfer_id: string | null;
  schedule: string | null;
} & Record<string, unknown>;

async function getPostedTransactions(accountIds: string[]): Promise<PostedForecastTxn[]> {
  if (accountIds.length === 0) return [];
  const rows = await runQuery<{
    acct: string;
    description: string | null;
    category: string | null;
    amount: number;
    date: number;
    notes: string | null;
    cleared: 0 | 1;
    reconciled: 0 | 1;
    transferred_id: string | null;
    schedule: string | null;
  }>(
    `SELECT acct, description, category, amount, date, notes, cleared, reconciled, transferred_id, schedule
     FROM transactions
     WHERE tombstone = 0 AND isParent = 0 AND acct IN (${accountIds.map(() => "?").join(",")})`,
    accountIds,
  );
  return rows.map((r) => ({
    account: r.acct,
    payee: r.description,
    category: r.category,
    amount: r.amount,
    date: intToStr(r.date),
    notes: r.notes,
    cleared: r.cleared === 1,
    reconciled: r.reconciled === 1,
    transfer_id: r.transferred_id,
    schedule: r.schedule,
  }));
}

function createUnassignedForecastAccount(): AccountWithComputedBalance {
  return {
    id: FORECAST_UNASSIGNED_ACCOUNT_ID,
    name: "Unassigned schedules",
    closed: 0,
    offbudget: 0,
    balance_current: 0,
  };
}

export async function generateForecast(
  params: ForecastRequestParams = {},
): Promise<ForecastResult> {
  const { accountIds, conditions, conditionsOp, startDate, endDate, source = "schedules" } = params;
  const includeUnassigned = params.includeAccountlessSchedules ?? false;
  const dateContext = buildForecastDateContext(startDate, endDate);

  if (source === "tracking-budget") {
    if ((await getBudgetType()) !== "tracking") {
      throw new Error("Tracking budget forecasts require a Tracking Budget file.");
    }
    const accounts = await getForecastAccounts();
    const { dataPoints, lowestBalance } = await projectTrackingBudgetForecast({
      accounts,
      dateContext,
    });
    return {
      dataPoints,
      lowestBalance,
      forecastStartDate: dateContext.forecastStartDate,
      forecastEndDate: dateContext.forecastEndDate,
    };
  }

  const filter = buildForecastFilter(conditions, conditionsOp);
  let accounts = await resolveForecastAccounts({
    accountIds,
    plainConditions: filter.plainConditions,
    resolvedConditionsOp: filter.resolvedConditionsOp,
    canRestrictAccounts: filter.canRestrictAccounts,
  });

  if (accounts.length === 0) {
    return createEmptyForecastResult(dateContext.forecastStartDate, dateContext.forecastEndDate);
  }

  if (includeUnassigned && !accounts.some((a) => a.id === FORECAST_UNASSIGNED_ACCOUNT_ID)) {
    accounts = [...accounts, createUnassignedForecastAccount()];
  }

  const accountIdsToQuery = accounts.map((a) => a.id);
  const accountsById = new Map(accounts.map((a) => [a.id, a]));

  const [schedulesRaw, postedAll] = await Promise.all([
    getNormalizedSchedules(),
    getPostedTransactions(accountIdsToQuery.filter((id) => id !== FORECAST_UNASSIGNED_ACCOUNT_ID)),
  ]);
  const schedules = includeUnassigned
    ? schedulesRaw
    : schedulesRaw.filter((s) => s._account !== FORECAST_UNASSIGNED_ACCOUNT_ID);

  // Report filter applies to posted transactions (projection + dedup) and
  // schedule occurrences alike (matched in projectForecastData).
  const transactions = postedAll.filter((t) => filter.match(t));

  const futureOccurrences = await buildFutureScheduleOccurrences(
    schedules,
    dateContext.endDateObj,
    accountsById,
    transactions,
  );

  const { dataPoints, lowestBalance } = projectForecastData({
    accounts,
    transactions,
    futureOccurrences,
    filterMatch: filter.match,
    dateContext,
  });

  return {
    dataPoints,
    lowestBalance,
    forecastStartDate: dateContext.forecastStartDate,
    forecastEndDate: dateContext.forecastEndDate,
  };
}

export type {
  ForecastResult,
  ForecastDataPoint,
  ForecastTransaction,
  ForecastRequestParams,
} from "@/core/types/models";
