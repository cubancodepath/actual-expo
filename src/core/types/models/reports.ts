/**
 * Report model types — ported from loot-core `types/models/reports.ts`.
 * `RuleConditionEntity` upstream maps to this app's {@link RuleCondition}.
 */
import type { RuleCondition } from "./rule";

export type balanceTypeOpType =
  | "totalAssets"
  | "totalDebts"
  | "totalTotals"
  | "netAssets"
  | "netDebts"
  | "totalBudgeted";

export type sortByOpType = "asc" | "desc" | "name" | "budget";

export type CustomReportEntity = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isDateStatic: boolean;
  dateRange: string;
  mode: string;
  groupBy: string;
  interval: string;
  balanceType: string;
  sortBy?: sortByOpType;
  showEmpty: boolean;
  showOffBudget: boolean;
  showHiddenCategories: boolean;
  includeCurrentInterval: boolean;
  showUncategorized: boolean;
  trimIntervals: boolean;
  showTrendLines: boolean;
  graphType: string;
  conditions?: RuleCondition[];
  conditionsOp: "and" | "or";
  metadata?: GroupedEntity;
  tombstone?: boolean;
};

export type SpendingMonthEntity = Record<
  string | number,
  {
    cumulative: number;
    daily: number;
    date: string;
    month: string;
  }
>;

export type SpendingDataEntity = {
  date: string;
  totalAssets: number;
  totalDebts: number;
  totalTotals: number;
  cumulative: number;
};

export type SpendingEntity = {
  intervalData: {
    months: SpendingMonthEntity;
    day: string;
    average: number;
    compare: number;
    compareTo: number;
    budget: number;
  }[];
  averageRange?: {
    startMonth: string | null;
    endMonth: string | null;
    months: string[];
  };
  startDate?: string;
  endDate?: string;
  totalDebts: number;
  totalAssets: number;
  totalTotals: number;
};

export type DataEntity = {
  data?: GroupedEntity[];
  intervalData: IntervalEntity[];
  groupedData?: GroupedEntity[] | null;
  legend?: LegendEntity[];
  startDate?: string;
  endDate?: string;
  totalDebts: number;
  totalAssets: number;
  netAssets: number;
  netDebts: number;
  totalTotals: number;
  totalBudgeted: number;
};

export type LegendEntity = {
  name: string;
  id: string | null;
  color: string;
  dataKey: string;
  uncategorizedId?: "off_budget" | "transfer" | "other" | "all";
};

export type IntervalEntity = {
  date: string;
  change?: number;
  intervalStartDate?: string;
  intervalEndDate?: string;
  totalAssets: number;
  totalDebts: number;
  netAssets: number;
  netDebts: number;
  totalTotals: number;
  totalBudgeted: number;
};

export type GroupedEntity = {
  id: string;
  name: string;
  uncategorizedId?: "off_budget" | "transfer" | "other" | "all";
  date?: string;
  intervalData: IntervalEntity[];
  totalAssets: number;
  totalDebts: number;
  totalTotals: number;
  netAssets: number;
  netDebts: number;
  totalBudgeted: number;
  categories?: GroupedEntity[];
};

export type Interval = {
  interval: string;
};

/** Raw `custom_reports` DB row shape (snake_case columns). */
export type CustomReportData = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  date_static: number;
  date_range: string;
  mode: string;
  group_by: string;
  sort_by: sortByOpType;
  balance_type: string;
  show_empty: number;
  show_offbudget: number;
  show_hidden: number;
  include_current: number;
  show_uncategorized: number;
  trim_intervals: number;
  show_trend_lines: number;
  graph_type: string;
  conditions?: RuleCondition[];
  conditions_op: "and" | "or";
  metadata?: GroupedEntity;
  interval: string;
  color_scheme?: string;
};
