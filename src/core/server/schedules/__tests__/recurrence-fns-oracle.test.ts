/**
 * Parity harness: recurrence-fns against the real @rschedule/core.
 *
 * TEMPORARY. rschedule is still installed, so it can act as the oracle while the
 * app is rewired onto recurrence-fns. This file is deleted in the same commit
 * that drops the @rschedule dependencies — at that point the package's own
 * suite is the contract.
 */
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { Schedule } from "recurrence-fns";
import type { IRuleOptions } from "recurrence-fns";
import type { RecurConfig } from "@/core/types/models/schedule";

// rschedule's date-adapter setup is a directory import that Node's ESM resolver
// rejects, so the oracle is loaded through CJS.
const cjs = createRequire(import.meta.url);
cjs("@rschedule/standard-date-adapter/setup");
const { Schedule: RSchedule } = cjs("@rschedule/core/generators");

function parseDate(str: string): Date {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}

/** Verbatim port of loot-core/src/shared/schedules.ts `recurConfigToRSchedule`. */
function recurConfigToRSchedule(config: RecurConfig): IRuleOptions[] {
  const base: Record<string, unknown> = {
    start: parseDate(config.start),
    frequency: config.frequency.toUpperCase(),
    byHourOfDay: [12],
  };

  if (config.interval) base.interval = config.interval;

  switch (config.endMode) {
    case "after_n_occurrences":
      base.count = config.endOccurrences;
      break;
    case "on_date":
      base.end = parseDate(config.endDate!);
      break;
    default:
      break;
  }

  const abbrevDay = (name: string) => name.slice(0, 2).toUpperCase();

  if (config.frequency === "monthly" && config.patterns && config.patterns.length > 0) {
    const days = config.patterns.filter((p) => p.type === "day");
    const dayNames = config.patterns.filter((p) => p.type !== "day");

    return [
      days.length > 0 && { ...base, byDayOfMonth: days.map((p) => p.value) },
      dayNames.length > 0 && {
        ...base,
        byDayOfWeek: dayNames.map((p) => [abbrevDay(p.type), p.value]),
      },
    ].filter(Boolean) as IRuleOptions[];
  }
  return [base as unknown as IRuleOptions];
}

const iso = (occurrences: { date: Date }[]) => occurrences.map((o) => o.date.toISOString());

// ─── Config matrix ─────────────────────────────────────────────

const STARTS = [
  "2024-01-01",
  "2024-01-31", // day-of-month that most months lack
  "2024-02-29", // leap day
  "2025-02-28",
  "2026-03-08", // US DST begins
  "2026-11-01", // US DST ends
];

const END_MODES: Pick<RecurConfig, "endMode" | "endOccurrences" | "endDate">[] = [
  { endMode: "never" },
  { endMode: "after_n_occurrences", endOccurrences: 1 },
  { endMode: "after_n_occurrences", endOccurrences: 3 },
  { endMode: "after_n_occurrences", endOccurrences: 25 },
  { endMode: "on_date", endDate: "2026-06-30" },
  { endMode: "on_date", endDate: "2031-01-01" },
];

const MONTHLY_PATTERNS: (RecurConfig["patterns"] | undefined)[] = [
  undefined,
  [{ type: "day", value: 1 }],
  [{ type: "day", value: 15 }],
  [{ type: "day", value: 31 }],
  [{ type: "day", value: -1 }],
  [
    { type: "day", value: 1 },
    { type: "day", value: -1 },
  ],
  [{ type: "MO", value: 2 }],
  [{ type: "FR", value: -1 }],
  // Mixed day + weekday: the case that produces two rrules merged into one series.
  [
    { type: "day", value: 15 },
    { type: "MO", value: 1 },
  ],
];

function buildMatrix(): { name: string; config: RecurConfig }[] {
  const configs: { name: string; config: RecurConfig }[] = [];

  for (const start of STARTS) {
    for (const interval of [1, 2, 4, 6]) {
      for (const end of END_MODES) {
        for (const frequency of ["daily", "weekly", "yearly"] as const) {
          configs.push({
            name: `${frequency} i=${interval} ${start} ${end.endMode}`,
            config: { frequency, start, interval, ...end },
          });
        }
        for (const patterns of MONTHLY_PATTERNS) {
          configs.push({
            name: `monthly i=${interval} ${start} ${end.endMode} p=${JSON.stringify(patterns)}`,
            config: { frequency: "monthly", start, interval, patterns, ...end },
          });
        }
      }
    }
  }

  // Shapes Actual's YNAB importer emits, kept verbatim as extra coverage.
  configs.push(
    {
      name: "ynab everyOtherWeek",
      config: { frequency: "weekly", interval: 2, start: "2026-03-09" },
    },
    { name: "ynab every4Weeks", config: { frequency: "weekly", interval: 4, start: "2026-03-09" } },
    {
      name: "ynab twiceAMonth",
      config: {
        frequency: "monthly",
        start: "2026-03-01",
        patterns: [
          { type: "day", value: 15 },
          { type: "day", value: -1 },
        ],
      },
    },
    { name: "ynab twiceAYear", config: { frequency: "monthly", interval: 6, start: "2026-03-01" } },
    {
      name: "ynab everyOtherMonth",
      config: { frequency: "monthly", interval: 2, start: "2026-03-01" },
    },
  );

  return configs;
}

const MATRIX = buildMatrix();

const PROBE_STARTS = ["2024-06-15", "2026-01-01", "2026-03-09", "2029-12-31"].map(parseDate);
const RANGE = { from: parseDate("2026-01-01"), to: parseDate("2027-01-01") };

describe(`recurrence-fns matches rschedule across ${MATRIX.length} configs`, () => {
  it.each(MATRIX.map(({ name, config }) => [name, config] as const))("%s", (_name, config) => {
    const rrules = recurConfigToRSchedule(config);
    const oracle = new RSchedule({ rrules });
    const mine = new Schedule({ rrules });

    // The series itself.
    expect(iso(mine.occurrences({ take: 40 }).toArray())).toEqual(
      iso(oracle.occurrences({ take: 40 }).toArray()),
    );

    // Queries starting partway through — count must not restart here.
    for (const start of PROBE_STARTS) {
      expect(iso(mine.occurrences({ start, take: 5 }).toArray())).toEqual(
        iso(oracle.occurrences({ start, take: 5 }).toArray()),
      );
    }

    // Bounded range.
    expect(iso(mine.occurrences({ start: RANGE.from, end: RANGE.to }).toArray())).toEqual(
      iso(oracle.occurrences({ start: RANGE.from, end: RANGE.to }).toArray()),
    );

    // Reverse, where the series terminates on its own.
    if (config.endMode === "after_n_occurrences" || config.endMode === "on_date") {
      expect(iso(mine.occurrences({ reverse: true, take: 3 }).toArray())).toEqual(
        iso(oracle.occurrences({ reverse: true, take: 3 }).toArray()),
      );
    }

    // occursOn against real occurrences and their neighbours, and occursBetween
    // over the ±2 day window rule conditions use.
    const sample = mine.occurrences({ take: 6 }).toArray();
    for (const { date } of sample) {
      expect(mine.occursOn({ date })).toBe(oracle.occursOn({ date }));

      for (const shift of [-1, 1]) {
        const neighbour = new Date(date);
        neighbour.setDate(neighbour.getDate() + shift);
        expect(mine.occursOn({ date: neighbour })).toBe(oracle.occursOn({ date: neighbour }));
      }

      const from = new Date(date);
      from.setDate(from.getDate() - 2);
      const to = new Date(date);
      to.setDate(to.getDate() + 2);
      expect(mine.occursBetween(from, to)).toBe(oracle.occursBetween(from, to));
    }
  });
});
