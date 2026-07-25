/**
 * Recurring date conditions. This path was unreachable on device until the
 * recurrence engine moved off rschedule: parseRecurDate threw, makeRule dropped
 * the rule with a console warning, and the user silently lost it.
 */
import { describe, expect, it } from "vitest";
import { Condition } from "@/core/server/rules/condition";
import type { RecurConfig } from "@/core/types/models";

const monthlySecondMonday: RecurConfig = {
  frequency: "monthly",
  start: "2026-03-01",
  patterns: [{ type: "MO", value: 2 }],
};

const daily: RecurConfig = { frequency: "daily", start: "2026-03-09" };

describe("recurring date conditions", () => {
  it("parses into a recurrence rather than throwing", () => {
    const cond = new Condition("is", "date", monthlySecondMonday);
    expect(cond.type).toBe("date");
  });

  it("matches a date the recurrence lands on", () => {
    const cond = new Condition("is", "date", monthlySecondMonday);
    // Second Mondays: Mar 9, Apr 13, May 11.
    expect(cond.eval({ date: "2026-03-09" })).toBe(true);
    expect(cond.eval({ date: "2026-04-13" })).toBe(true);
  });

  it("rejects a date the recurrence misses", () => {
    const cond = new Condition("is", "date", monthlySecondMonday);
    expect(cond.eval({ date: "2026-03-10" })).toBe(false);
    expect(cond.eval({ date: "2026-04-14" })).toBe(false);
  });

  it("rejects dates before the recurrence starts", () => {
    const cond = new Condition("is", "date", monthlySecondMonday);
    expect(cond.eval({ date: "2026-02-09" })).toBe(false);
  });

  it("matches within two days for isapprox", () => {
    const cond = new Condition("isapprox", "date", monthlySecondMonday);
    for (const date of ["2026-03-07", "2026-03-09", "2026-03-11"]) {
      expect(cond.eval({ date })).toBe(true);
    }
  });

  it("does not match beyond the isapprox window", () => {
    const cond = new Condition("isapprox", "date", monthlySecondMonday);
    // Mar 6 and Mar 12 are three days from the occurrence, and the next one is
    // over a month away.
    expect(cond.eval({ date: "2026-03-06" })).toBe(false);
    expect(cond.eval({ date: "2026-03-12" })).toBe(false);
  });

  it("honours an end date", () => {
    const cond = new Condition("is", "date", {
      ...daily,
      endMode: "on_date",
      endDate: "2026-03-11",
    } as RecurConfig);
    expect(cond.eval({ date: "2026-03-11" })).toBe(true);
    expect(cond.eval({ date: "2026-03-12" })).toBe(false);
  });

  it("honours an occurrence count", () => {
    const cond = new Condition("is", "date", {
      ...daily,
      endMode: "after_n_occurrences",
      endOccurrences: 3,
    } as RecurConfig);
    expect(cond.eval({ date: "2026-03-11" })).toBe(true);
    expect(cond.eval({ date: "2026-03-12" })).toBe(false);
  });

  it("matches an interval series", () => {
    const cond = new Condition("is", "date", { ...daily, interval: 3 } as RecurConfig);
    expect(cond.eval({ date: "2026-03-12" })).toBe(true);
    expect(cond.eval({ date: "2026-03-13" })).toBe(false);
  });
});
