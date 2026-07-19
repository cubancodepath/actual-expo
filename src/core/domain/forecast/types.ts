/**
 * Forecast engine types — port of loot-core types/models/forecast.ts + inline
 * engine types. Balance projection from schedules (day step) or the tracking
 * budget (month step). All amounts are integer cents; all dates are
 * 'yyyy-MM-dd' strings compared lexicographically.
 */
import type { RuleCondition } from "../rules/types";

export type ForecastSource = "schedules" | "tracking-budget";

export type ForecastTransaction = {
  amount: number;
  payee: string | null;
  scheduleId: string;
  scheduleName: string;
};

export type ForecastDataPoint = {
  date: string;
  balance: number;
  accountId: string;
  accountName: string;
  transactions: ForecastTransaction[];
};

export type ForecastResult = {
  dataPoints: ForecastDataPoint[];
  lowestBalance: { date: string; balance: number; accountId: string; accountName: string };
  forecastStartDate: string;
  forecastEndDate: string;
};

export type ForecastRequestParams = {
  accountIds?: string[];
  conditions?: RuleCondition[];
  conditionsOp?: "and" | "or";
  startDate?: string;
  endDate?: string;
  includeAccountlessSchedules?: boolean;
  source?: ForecastSource;
};

export type ForecastDateContext = {
  forecastStartDate: string;
  forecastEndDate: string;
  forecastDays: string[];
  firstForecastDate: string;
  endDateObj: Date;
};

export type AccountWithComputedBalance = {
  id: string;
  name: string;
  closed: number;
  offbudget: number;
  balance_current: number;
};

/** A simulated schedule occurrence: the synthetic transaction + summary. */
export type ForecastScheduleOccurrence = {
  /** Rules-shaped txn object (account/payee/category/amount/date/…) for filtering. */
  transaction: Record<string, unknown>;
  account: string;
  date: string;
  amount: number;
  payee: string;
  scheduleId: string;
  scheduleName: string;
};
