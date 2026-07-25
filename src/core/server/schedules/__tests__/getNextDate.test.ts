import { describe, expect, it } from "vitest";
import { getNextDate, parseDate } from "@/core/shared/schedules";
import type { RecurConfig, RuleCondition } from "@/core/types/models";

const cond = (value: RuleCondition["value"]): RuleCondition =>
  ({ op: "is", field: "date", value }) as RuleCondition;

const recur = (config: RecurConfig): RuleCondition => cond(config as RuleCondition["value"]);

describe("getNextDate", () => {
  it("passes a one-time date straight through", () => {
    expect(getNextDate(cond("2026-03-09"), parseDate("2026-01-01"))).toBe("2026-03-09");
  });

  it("returns the first occurrence at or after the start", () => {
    const config: RecurConfig = { frequency: "daily", start: "2026-03-09" };
    expect(getNextDate(recur(config), parseDate("2026-03-10"))).toBe("2026-03-10");
  });

  it("honours an interval", () => {
    const config: RecurConfig = { frequency: "daily", start: "2026-03-09", interval: 3 };
    expect(getNextDate(recur(config), parseDate("2026-03-10"))).toBe("2026-03-12");
  });

  it("resolves a monthly weekday pattern", () => {
    const config: RecurConfig = {
      frequency: "monthly",
      start: "2026-03-01",
      patterns: [{ type: "MO", value: 2 }],
    };
    expect(getNextDate(recur(config), parseDate("2026-03-01"))).toBe("2026-03-09");
  });

  it("falls back to the last occurrence once a dated schedule is exhausted", () => {
    const config: RecurConfig = {
      frequency: "daily",
      start: "2026-03-09",
      endMode: "on_date",
      endDate: "2026-03-11",
    };
    expect(getNextDate(recur(config), parseDate("2026-03-20"))).toBe("2026-03-11");
  });

  it("falls back to the last occurrence once a counted schedule is exhausted", () => {
    const config: RecurConfig = {
      frequency: "daily",
      start: "2026-03-09",
      endMode: "after_n_occurrences",
      endOccurrences: 3,
    };
    expect(getNextDate(recur(config), parseDate("2026-03-20"))).toBe("2026-03-11");
  });

  it("applies the weekend skip", () => {
    // 2026-03-14 is a Saturday.
    const config: RecurConfig = {
      frequency: "monthly",
      start: "2026-03-14",
      skipWeekend: true,
      weekendSolveMode: "after",
    };
    expect(getNextDate(recur(config), parseDate("2026-03-01"))).toBe("2026-03-16");
  });

  it("solves the weekend backwards when asked", () => {
    const config: RecurConfig = {
      frequency: "monthly",
      start: "2026-03-14",
      skipWeekend: true,
      weekendSolveMode: "before",
    };
    expect(getNextDate(recur(config), parseDate("2026-03-01"))).toBe("2026-03-13");
  });

  it("can be asked for the raw date, weekend skip and all", () => {
    const config: RecurConfig = {
      frequency: "monthly",
      start: "2026-03-14",
      skipWeekend: true,
      weekendSolveMode: "after",
    };
    expect(getNextDate(recur(config), parseDate("2026-03-01"), true)).toBe("2026-03-14");
  });

  it("returns null for a missing value", () => {
    expect(getNextDate(cond(null), parseDate("2026-03-01"))).toBeNull();
  });
});
