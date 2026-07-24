/**
 * Report option maps — focused subset of desktop-client
 * `components/reports/ReportOptions.ts`. Only the interval maps used by the
 * ported chart spreadsheets are included here; grouping/balance/date-range
 * options (custom-report) will be added when that widget lands.
 */

type IntervalName = "Day" | "Week" | "Month" | "Year";
type IntervalRange =
  | "dayRangeInclusive"
  | "weekRangeInclusive"
  | "rangeInclusive"
  | "yearRangeInclusive";

type IntervalOption = {
  key: string;
  name: IntervalName;
  format: string;
  range: IntervalRange;
};

const intervalOptions: IntervalOption[] = [
  { key: "Daily", name: "Day", format: "yy-MM-dd", range: "dayRangeInclusive" },
  { key: "Weekly", name: "Week", format: "yy-MM-dd", range: "weekRangeInclusive" },
  { key: "Monthly", name: "Month", format: "MMM ''yy", range: "rangeInclusive" },
  { key: "Yearly", name: "Year", format: "yyyy", range: "yearRangeInclusive" },
];

export const ReportOptions = {
  interval: intervalOptions,
  intervalMap: new Map<string, IntervalName>(intervalOptions.map((i) => [i.key, i.name])),
  intervalFormat: new Map<string, string>(intervalOptions.map((i) => [i.key, i.format])),
  intervalRange: new Map<string, IntervalRange>(intervalOptions.map((i) => [i.key, i.range])),
};
