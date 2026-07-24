/**
 * Spending "average" range helpers — port of desktop-client
 * `reports/spendingAverageRange.ts`. Resolves the SpendingWidget's average-range
 * config (last-N-months / year-to-date / all-time) into the concrete month list
 * the spreadsheet averages over, and the display label.
 */
import * as monthUtils from "@/core/shared/monthUtils";
import type { SpendingAverageRange } from "@/core/types/models/dashboard";

export type SpendingAverageRangeKey =
  | "last-3-months"
  | "last-6-months"
  | "last-12-months"
  | "year-to-date"
  | "all-time";

export const DEFAULT_SPENDING_AVERAGE_RANGE: SpendingAverageRange = {
  mode: "last-n-months",
  months: 3,
};

const supportedLastNMonths = [3, 6, 12] as const;

function isSupportedLastNMonths(months: number): months is (typeof supportedLastNMonths)[number] {
  return supportedLastNMonths.some((supported) => supported === months);
}

export function normalizeSpendingAverageRange(
  averageRange?: SpendingAverageRange,
): SpendingAverageRange {
  if (!averageRange) {
    return DEFAULT_SPENDING_AVERAGE_RANGE;
  }

  if (averageRange.mode === "last-n-months" && !isSupportedLastNMonths(averageRange.months)) {
    return DEFAULT_SPENDING_AVERAGE_RANGE;
  }

  return averageRange;
}

type ResolvedSpendingAverageRange = {
  startMonth: string | null;
  endMonth: string | null;
  months: string[];
};

export function resolveSpendingAverageRange({
  averageRange,
  compare,
  earliestMonth,
}: {
  averageRange?: SpendingAverageRange;
  compare: string;
  earliestMonth?: string | null;
}): ResolvedSpendingAverageRange {
  const normalizedRange = normalizeSpendingAverageRange(averageRange);
  const endMonth = monthUtils.subMonths(compare, 1);
  let startMonth: string | null;

  switch (normalizedRange.mode) {
    case "last-n-months":
      startMonth = monthUtils.subMonths(compare, normalizedRange.months);
      break;
    case "year-to-date":
      startMonth = `${monthUtils.getYear(compare)}-01`;
      break;
    case "all-time":
      startMonth = earliestMonth ?? null;
      break;
    default:
      startMonth = monthUtils.subMonths(compare, 3);
      break;
  }

  if (!startMonth || startMonth > endMonth) {
    return { startMonth: null, endMonth: null, months: [] };
  }

  return {
    startMonth,
    endMonth,
    months: monthUtils.rangeInclusive(startMonth, endMonth),
  };
}

type Translate = (key: string, options?: Record<string, string | number>) => string;

export function getSpendingAverageRangeLabel(
  averageRange: SpendingAverageRange | undefined,
  t: Translate,
): string {
  const normalizedRange = normalizeSpendingAverageRange(averageRange);

  switch (normalizedRange.mode) {
    case "last-n-months":
      return t("spendingAvg.lastNMonths", { count: normalizedRange.months });
    case "year-to-date":
      return t("spendingAvg.ytd");
    case "all-time":
      return t("spendingAvg.allTime");
    default:
      return t("spendingAvg.lastNMonths", { count: 3 });
  }
}
