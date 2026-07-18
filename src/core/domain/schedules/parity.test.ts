/**
 * Parity tests for the pure schedule logic ported from Actual Budget.
 * These exercise the functions with no DB dependency.
 */

import { describe, it, expect, vi } from "vitest";

// Fix "today" so computePreviewTransactions' window is deterministic.
vi.useFakeTimers();
vi.setSystemTime(new Date(2026, 2, 10, 12, 0, 0)); // March 10, 2026

import {
  getUpcomingDays,
  scheduleIsRecurring,
  normalizeScheduleName,
  areConditionValuesEqual,
  areScheduleConditionsEqual,
  updateActions,
} from "./helpers";
import {
  getScheduleOccurrenceMatchStartDate,
  indexPostedScheduleTransactions,
  isScheduleOccurrencePosted,
} from "./posted";
import { getUpcomingDates, applySkipWeekend, parseDate, dayFromDate } from "./recurrence";
import { computePreviewTransactions } from "./computePreview";
import type { Schedule, RuleCondition } from "./types";
import type { ScheduleStatuses } from "./status";

describe("getUpcomingDays", () => {
  // March 2026 has 31 days; anchor mid-month.
  const today = "2026-03-15";

  it("numeric string", () => {
    expect(getUpcomingDays("7", today)).toBe(7);
    expect(getUpcomingDays("30", today)).toBe(30);
  });

  it("currentMonth → days left in the month", () => {
    expect(getUpcomingDays("currentMonth", today)).toBe(31 - 15);
  });

  it("oneMonth → days in the current month", () => {
    expect(getUpcomingDays("oneMonth", today)).toBe(31);
  });

  it("N-day / N-week", () => {
    expect(getUpcomingDays("3-day", today)).toBe(3);
    expect(getUpcomingDays("2-week", today)).toBe(14);
  });

  it("N-month / N-year (from month start, +1)", () => {
    expect(getUpcomingDays("1-month", today)).toBe(46); // Apr 15 − Mar 1 = 45, +1
    expect(getUpcomingDays("1-year", today)).toBe(380); // Mar 15 2027 − Mar 1 2026 = 379, +1
  });

  it("floors N to at least 1", () => {
    expect(getUpcomingDays("0-day", today)).toBe(1);
  });
});

describe("scheduleIsRecurring", () => {
  it("true for a recur value (has frequency)", () => {
    expect(
      scheduleIsRecurring({
        field: "date",
        op: "isapprox",
        value: { frequency: "monthly", start: "2026-03-09" },
      }),
    ).toBe(true);
  });

  it("false for a one-off date string and for null", () => {
    expect(scheduleIsRecurring({ field: "date", op: "is", value: "2026-03-09" })).toBe(false);
    expect(scheduleIsRecurring(null)).toBe(false);
    expect(scheduleIsRecurring(undefined)).toBe(false);
  });
});

describe("normalizeScheduleName", () => {
  it("trims, empties → null", () => {
    expect(normalizeScheduleName("  Rent  ")).toBe("Rent");
    expect(normalizeScheduleName("")).toBeNull();
    expect(normalizeScheduleName("   ")).toBeNull();
    expect(normalizeScheduleName(null)).toBeNull();
    expect(normalizeScheduleName(undefined)).toBeNull();
  });
});

describe("areConditionValuesEqual", () => {
  it("deep-compares primitives, arrays, objects", () => {
    expect(areConditionValuesEqual(5, 5)).toBe(true);
    expect(areConditionValuesEqual("a", "b")).toBe(false);
    expect(areConditionValuesEqual([1, 2], [1, 2])).toBe(true);
    expect(areConditionValuesEqual([1, 2], [2, 1])).toBe(false);
    expect(areConditionValuesEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    expect(areConditionValuesEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(areConditionValuesEqual(null, null)).toBe(true);
    expect(areConditionValuesEqual(null, 1)).toBe(false);
  });

  it("areScheduleConditionsEqual ignores the type field", () => {
    const a: RuleCondition = { field: "date", op: "is", value: "2026-03-09", type: "date" };
    const b: RuleCondition = { field: "date", op: "is", value: "2026-03-09" };
    expect(areScheduleConditionsEqual(a, b)).toBe(true);
    expect(areScheduleConditionsEqual(a, { field: "date", op: "is", value: "2026-04-09" })).toBe(
      false,
    );
  });
});

describe("updateActions", () => {
  const conds: RuleCondition[] = [{ field: "amount", op: "is", value: -5000 }];

  it("syncs a plain set-amount action to the amount condition", () => {
    const actions = [{ op: "set", field: "amount", value: -4000 }];
    expect(updateActions(conds, actions)).toEqual([{ op: "set", field: "amount", value: -5000 }]);
  });

  it("returns null when nothing changed", () => {
    expect(updateActions(conds, [{ op: "set", field: "amount", value: -5000 }])).toBeNull();
    expect(updateActions(conds, [{ op: "link-schedule", value: "s1" }])).toBeNull();
  });

  it("leaves templated/formula actions untouched", () => {
    const actions = [{ op: "set", field: "amount", value: 0, options: { template: "{{x}}" } }];
    expect(updateActions(conds, actions)).toBeNull();
  });
});

describe("posted-transaction matching", () => {
  it("getScheduleOccurrenceMatchStartDate: exact/auto-posted → occurrence date; else −2 days", () => {
    const occ = "2026-03-09";
    expect(
      getScheduleOccurrenceMatchStartDate(
        { _conditions: [{ field: "date", op: "is", value: occ }] },
        occ,
      ),
    ).toBe(occ);
    expect(getScheduleOccurrenceMatchStartDate({ posts_transaction: true }, occ)).toBe(occ);
    expect(
      getScheduleOccurrenceMatchStartDate(
        { _conditions: [{ field: "date", op: "isapprox", value: occ }] },
        occ,
      ),
    ).toBe("2026-03-07");
  });

  it("indexPostedScheduleTransactions groups by schedule id", () => {
    const idx = indexPostedScheduleTransactions([
      { schedule: "s1", date: "2026-03-09" },
      { schedule: "s2", date: "2026-03-10" },
      { schedule: "s1", date: "2026-04-09" },
      { schedule: null, date: "2026-03-11" },
    ]);
    expect(idx.get("s1")).toHaveLength(2);
    expect(idx.get("s2")).toHaveLength(1);
    expect(idx.has("")).toBe(false);
  });

  it("isScheduleOccurrencePosted matches within the [start, occurrence] window", () => {
    const posted = [{ schedule: "s1", date: "2026-03-08" }];
    // approx schedule → 2-day lookback, so 03-08 matches occurrence 03-09
    expect(
      isScheduleOccurrencePosted({
        schedule: { _conditions: [{ field: "date", op: "isapprox", value: "2026-03-09" }] },
        scheduleId: "s1",
        occurrenceDate: "2026-03-09",
        postedTransactions: posted,
      }),
    ).toBe(true);
    // exact schedule → no lookback, 03-08 does NOT match 03-09
    expect(
      isScheduleOccurrencePosted({
        schedule: { _conditions: [{ field: "date", op: "is", value: "2026-03-09" }] },
        scheduleId: "s1",
        occurrenceDate: "2026-03-09",
        postedTransactions: posted,
      }),
    ).toBe(false);
  });
});

describe("getUpcomingDates applies skipWeekend", () => {
  it("pushes weekend occurrences to the configured side", () => {
    const config = {
      frequency: "weekly" as const,
      interval: 1,
      start: "2026-03-07", // a Saturday
      skipWeekend: true,
      weekendSolveMode: "after" as const,
    };
    const dates = getUpcomingDates(config, 2, parseDate("2026-03-07")).map(dayFromDate);
    // Each Saturday is pushed to the following Monday.
    expect(dates.every((d) => new Date(d + "T12:00:00").getDay() === 1)).toBe(true);
  });

  it("applySkipWeekend is a no-op when disabled", () => {
    const config = { frequency: "weekly" as const, start: "2026-03-07" };
    const sat = parseDate("2026-03-07");
    expect(applySkipWeekend(config, sat).getTime()).toBe(sat.getTime());
  });
});

describe("computePreviewTransactions honours custom_upcoming_length", () => {
  function monthlySchedule(custom: string | null): Schedule {
    const date = { frequency: "monthly", interval: 1, start: "2026-03-09" };
    return {
      id: "s1",
      name: "Rent",
      rule: "r1",
      completed: false,
      posts_transaction: false,
      tombstone: false,
      custom_upcoming_length: custom,
      next_date: "2026-03-09",
      _payee: "p1",
      _account: "a1",
      _amount: -5000,
      _amountOp: "is",
      _date: date,
      _category: null,
      _conditions: [{ field: "date", op: "isapprox", value: date }],
    } as Schedule;
  }

  const statuses: ScheduleStatuses = new Map([["s1", "upcoming"]]);
  const names = new Map([["p1", "Landlord"]]);
  const accounts = new Map([["a1", "Checking"]]);

  it("a wider custom window yields more occurrences than the global default", () => {
    const globalWindow = computePreviewTransactions(
      [monthlySchedule(null)],
      statuses,
      names,
      new Map(),
      accounts,
      "7", // one week → only the next_date occurrence
    );
    const customWindow = computePreviewTransactions(
      [monthlySchedule("3-month")],
      statuses,
      names,
      new Map(),
      accounts,
      "7", // global still 7, but the schedule overrides to 3 months
    );

    expect(globalWindow).toHaveLength(1);
    expect(customWindow.length).toBeGreaterThan(1);
    // ids use the Actual YYYY-MM-DD format
    expect(customWindow[0].id).toMatch(/^preview\/s1\/\d{4}-\d{2}-\d{2}$/);
  });
});
