/**
 * Dashboard widget model types — ported from loot-core
 * `types/models/dashboard.ts`. `RuleConditionEntity` upstream maps to this
 * app's {@link RuleCondition}.
 */
import type { ForecastSource } from "./forecast";
import type { RuleCondition } from "./rule";

export type DashboardPageEntity = {
  id: string;
  name: string;
  tombstone: boolean;
};

export type TimeFrame = {
  start: string;
  end: string;
  mode:
    | "sliding-window"
    | "static"
    | "full"
    | "lastMonth"
    | "lastYear"
    | "yearToDate"
    | "priorYearToDate";
};

type AbstractWidget<T extends string, Meta extends Record<string, unknown> | null = null> = {
  id: string;
  dashboard_page_id: string;
  type: T;
  x: number;
  y: number;
  width: number;
  height: number;
  meta: Meta;
  tombstone: boolean;
};

export type NetWorthWidget = AbstractWidget<
  "net-worth-card",
  {
    name?: string;
    conditions?: RuleCondition[];
    conditionsOp?: "and" | "or";
    timeFrame?: TimeFrame;
    interval?: "Daily" | "Weekly" | "Monthly" | "Yearly";
    mode?: "trend" | "stacked";
  } | null
>;

export type CashFlowWidget = AbstractWidget<
  "cash-flow-card",
  {
    name?: string;
    conditions?: RuleCondition[];
    conditionsOp?: "and" | "or";
    timeFrame?: TimeFrame;
    showBalance?: boolean;
  } | null
>;

export type SpendingAverageRange =
  | { mode: "last-n-months"; months: 3 | 6 | 12 }
  | { mode: "year-to-date" }
  | { mode: "all-time" };

export type SpendingWidget = AbstractWidget<
  "spending-card",
  {
    name?: string;
    conditions?: RuleCondition[];
    conditionsOp?: "and" | "or";
    compare?: string;
    compareTo?: string;
    isLive?: boolean;
    mode?: "single-month" | "budget" | "average";
    averageRange?: SpendingAverageRange;
  } | null
>;

export type BudgetAnalysisWidget = AbstractWidget<
  "budget-analysis-card",
  {
    name?: string;
    conditions?: RuleCondition[];
    conditionsOp?: "and" | "or";
    timeFrame?: TimeFrame;
    interval?: "Daily" | "Weekly" | "Monthly" | "Yearly";
    graphType?: "Line" | "Bar";
    showBalance?: boolean;
    balanceOnly?: boolean;
    showHiddenCategories?: boolean;
  } | null
>;

export type CustomReportWidget = AbstractWidget<"custom-report", { id: string }>;

export type CrossoverWidget = AbstractWidget<
  "crossover-card",
  {
    name?: string;
    expenseCategoryIds?: string[];
    incomeAccountIds?: string[];
    timeFrame?: TimeFrame;
    safeWithdrawalRate?: number;
    estimatedReturn?: number | null;
    expectedContribution?: number | null;
    projectionType?: "hampel" | "median" | "mean";
    showHiddenCategories?: boolean;
    expenseAdjustmentFactor?: number;
  } | null
>;

export type MarkdownWidget = AbstractWidget<
  "markdown-card",
  { content: string; text_align?: "left" | "right" | "center" }
>;

export type AgeOfMoneyGranularity = "daily" | "weekly" | "monthly";

export type AgeOfMoneyWidget = AbstractWidget<
  "age-of-money-card",
  {
    name?: string;
    conditions?: RuleCondition[];
    conditionsOp?: "and" | "or";
    timeFrame?: TimeFrame;
    granularity?: AgeOfMoneyGranularity;
  } | null
>;

export type SummaryWidget = AbstractWidget<
  "summary-card",
  {
    name?: string;
    conditions?: RuleCondition[];
    conditionsOp?: "and" | "or";
    timeFrame?: TimeFrame;
    content?: string;
  } | null
>;

export type BaseSummaryContent = {
  type: "sum" | "avgPerMonth" | "avgPerYear" | "avgPerTransact";
  fontSize?: number;
};

export type PercentageSummaryContent = {
  type: "percentage";
  divisorConditions: RuleCondition[];
  divisorConditionsOp: "and" | "or";
  divisorAllTimeDateRange?: boolean;
  fontSize?: number;
};

export type SummaryContent = BaseSummaryContent | PercentageSummaryContent;

export type CalendarWidget = AbstractWidget<
  "calendar-card",
  {
    name?: string;
    conditions?: RuleCondition[];
    conditionsOp?: "and" | "or";
    timeFrame?: TimeFrame;
  } | null
>;

export type FormulaWidget = AbstractWidget<
  "formula-card",
  {
    name?: string;
    formula?: string;
    fontSize?: number;
    fontSizeMode?: "dynamic" | "static";
    staticFontSize?: number;
    showTitle?: boolean;
    colorFormula?: string;
    queriesVersion?: number;
    queries?: Record<
      string,
      {
        conditions?: RuleCondition[];
        conditionsOp?: "and" | "or";
        timeFrame?: TimeFrame;
      }
    >;
  } | null
>;

export type SankeyWidget = AbstractWidget<
  "sankey-card",
  {
    name?: string;
    conditions?: RuleCondition[];
    conditionsOp?: "and" | "or";
    timeFrame?: TimeFrame;
    mode?: "budgeted" | "spent";
    topNcategories?: number;
    categorySort?: "per-group" | "global" | "budget-order";
    showPercentages?: boolean;
    groupAccounts?: boolean;
    layerFrom?: string;
    layerTo?: string;
  } | null
>;

export type BalanceForecastWidget = AbstractWidget<
  "balance-forecast-card",
  {
    name?: string;
    startDate?: string;
    endDate?: string;
    accounts?: string[];
    conditions?: RuleCondition[];
    conditionsOp?: "and" | "or";
    timeFrame?: TimeFrame;
    granularity?: "Daily" | "Monthly";
    source?: ForecastSource;
  } | null
>;

type SpecializedWidget =
  | NetWorthWidget
  | CashFlowWidget
  | SpendingWidget
  | BudgetAnalysisWidget
  | CrossoverWidget
  | MarkdownWidget
  | SummaryWidget
  | CalendarWidget
  | FormulaWidget
  | SankeyWidget
  | AgeOfMoneyWidget
  | BalanceForecastWidget;

export type DashboardWidgetEntity = SpecializedWidget | CustomReportWidget;

export type NewDashboardWidgetEntity = Omit<
  DashboardWidgetEntity,
  "id" | "tombstone" | "dashboard_page_id"
>;
