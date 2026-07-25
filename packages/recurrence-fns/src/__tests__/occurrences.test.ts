import { describe, expect, it } from "vitest";
import { Schedule } from "../schedule";
import type { IRuleOptions } from "../types";
import { at, days } from "./helpers";

/** Next occurrence at or after `from`, as `YYYY-MM-DD`. */
function nextFrom(rule: IRuleOptions, from: string): string | null {
  const [first] = new Schedule({ rrules: [rule] })
    .occurrences({ start: at(from), take: 1 })
    .toArray();
  return first ? days([first])[0] : null;
}

describe("daily", () => {
  const rule: IRuleOptions = { frequency: "DAILY", start: at("2026-03-09"), byHourOfDay: [12] };

  it("returns the start date when asked from the start date", () => {
    expect(nextFrom(rule, "2026-03-09")).toBe("2026-03-09");
  });

  it("returns the next day when asked from the day after the start", () => {
    expect(nextFrom(rule, "2026-03-10")).toBe("2026-03-10");
  });

  it("skips by interval", () => {
    expect(nextFrom({ ...rule, interval: 3 }, "2026-03-10")).toBe("2026-03-12");
  });

  it("produces a contiguous series", () => {
    const occurrences = new Schedule({ rrules: [rule] }).occurrences({ take: 4 }).toArray();
    expect(days(occurrences)).toEqual(["2026-03-09", "2026-03-10", "2026-03-11", "2026-03-12"]);
  });

  it("crosses a spring-forward DST boundary without drifting", () => {
    // US DST starts 2026-03-08. A noon anchor must stay at noon either side.
    const dst: IRuleOptions = { frequency: "DAILY", start: at("2026-03-06"), byHourOfDay: [12] };
    const occurrences = new Schedule({ rrules: [dst] }).occurrences({ take: 4 }).toArray();
    expect(days(occurrences)).toEqual(["2026-03-06", "2026-03-07", "2026-03-08", "2026-03-09"]);
    expect(occurrences.every(({ date }) => date.getHours() === 12)).toBe(true);
  });
});

describe("weekly", () => {
  const rule: IRuleOptions = { frequency: "WEEKLY", start: at("2026-03-09"), byHourOfDay: [12] };

  it("returns the start date when asked from the start date", () => {
    expect(nextFrom(rule, "2026-03-09")).toBe("2026-03-09");
  });

  it("lands on the same weekday next week", () => {
    expect(nextFrom(rule, "2026-03-10")).toBe("2026-03-16");
  });

  it("skips by interval", () => {
    expect(nextFrom({ ...rule, interval: 2 }, "2026-03-10")).toBe("2026-03-23");
  });
});

describe("monthly", () => {
  it("keeps the day-of-month of the start date", () => {
    const rule: IRuleOptions = { frequency: "MONTHLY", start: at("2026-03-09"), byHourOfDay: [12] };
    expect(nextFrom(rule, "2026-03-10")).toBe("2026-04-09");
  });

  it("skips months that lack the start day-of-month", () => {
    // Upstream/RFC 5545 semantics: Jan 31 goes to Mar 31, never Feb 28.
    const rule: IRuleOptions = { frequency: "MONTHLY", start: at("2026-01-31"), byHourOfDay: [12] };
    expect(nextFrom(rule, "2026-02-01")).toBe("2026-03-31");

    const series = new Schedule({ rrules: [rule] }).occurrences({ take: 4 }).toArray();
    expect(days(series)).toEqual(["2026-01-31", "2026-03-31", "2026-05-31", "2026-07-31"]);
  });

  it("honours a byDayOfMonth pattern", () => {
    const rule: IRuleOptions = {
      frequency: "MONTHLY",
      start: at("2026-03-15"),
      byHourOfDay: [12],
      byDayOfMonth: [15],
    };
    expect(nextFrom(rule, "2026-03-16")).toBe("2026-04-15");
  });

  it("resolves byDayOfMonth -1 to the last day of each month", () => {
    const rule: IRuleOptions = {
      frequency: "MONTHLY",
      start: at("2026-03-01"),
      byHourOfDay: [12],
      byDayOfMonth: [-1],
    };
    const series = new Schedule({ rrules: [rule] }).occurrences({ take: 3 }).toArray();
    expect(days(series)).toEqual(["2026-03-31", "2026-04-30", "2026-05-31"]);
  });

  it("skips months without the requested day-of-month", () => {
    const rule: IRuleOptions = {
      frequency: "MONTHLY",
      start: at("2026-01-01"),
      byHourOfDay: [12],
      byDayOfMonth: [31],
    };
    const series = new Schedule({ rrules: [rule] }).occurrences({ take: 3 }).toArray();
    expect(days(series)).toEqual(["2026-01-31", "2026-03-31", "2026-05-31"]);
  });

  it("resolves an nth-weekday pattern", () => {
    const rule: IRuleOptions = {
      frequency: "MONTHLY",
      start: at("2026-03-01"),
      byHourOfDay: [12],
      byDayOfWeek: [["MO", 2]],
    };
    expect(nextFrom(rule, "2026-03-01")).toBe("2026-03-09");
  });

  it("resolves a last-weekday pattern", () => {
    const rule: IRuleOptions = {
      frequency: "MONTHLY",
      start: at("2026-03-01"),
      byHourOfDay: [12],
      byDayOfWeek: [["FR", -1]],
    };
    expect(nextFrom(rule, "2026-03-01")).toBe("2026-03-27");
  });

  it("anchors the interval on the month of the start date", () => {
    const rule: IRuleOptions = {
      frequency: "MONTHLY",
      start: at("2026-03-09"),
      byHourOfDay: [12],
      interval: 2,
      byDayOfMonth: [1],
    };
    // March 1 precedes the start, so the series opens in May.
    const series = new Schedule({ rrules: [rule] }).occurrences({ take: 3 }).toArray();
    expect(days(series)).toEqual(["2026-05-01", "2026-07-01", "2026-09-01"]);
  });

  it("orders multiple patterns within a month", () => {
    const rule: IRuleOptions = {
      frequency: "MONTHLY",
      start: at("2026-03-01"),
      byHourOfDay: [12],
      byDayOfMonth: [1, -1],
    };
    const series = new Schedule({ rrules: [rule] }).occurrences({ take: 4 }).toArray();
    expect(days(series)).toEqual(["2026-03-01", "2026-03-31", "2026-04-01", "2026-04-30"]);
  });
});

describe("yearly", () => {
  it("lands on the same date next year", () => {
    const rule: IRuleOptions = { frequency: "YEARLY", start: at("2026-03-09"), byHourOfDay: [12] };
    expect(nextFrom(rule, "2026-03-10")).toBe("2027-03-09");
  });

  it("only emits on leap years for a Feb 29 series", () => {
    const rule: IRuleOptions = { frequency: "YEARLY", start: at("2024-02-29"), byHourOfDay: [12] };
    const series = new Schedule({ rrules: [rule] }).occurrences({ take: 3 }).toArray();
    expect(days(series)).toEqual(["2024-02-29", "2028-02-29", "2032-02-29"]);
  });

  it("skips by interval", () => {
    const rule: IRuleOptions = {
      frequency: "YEARLY",
      start: at("2026-03-09"),
      byHourOfDay: [12],
      interval: 2,
    };
    expect(nextFrom(rule, "2026-03-10")).toBe("2028-03-09");
  });
});

describe("termination", () => {
  it("stops on the end date, inclusive", () => {
    const rule: IRuleOptions = {
      frequency: "DAILY",
      start: at("2026-03-09"),
      byHourOfDay: [12],
      end: at("2026-03-11"),
    };
    const series = new Schedule({ rrules: [rule] }).occurrences().toArray();
    expect(days(series)).toEqual(["2026-03-09", "2026-03-10", "2026-03-11"]);
    expect(nextFrom(rule, "2026-03-12")).toBeNull();
  });

  it("stops after count occurrences", () => {
    const rule: IRuleOptions = {
      frequency: "DAILY",
      start: at("2026-03-09"),
      byHourOfDay: [12],
      count: 3,
    };
    const series = new Schedule({ rrules: [rule] }).occurrences().toArray();
    expect(days(series)).toEqual(["2026-03-09", "2026-03-10", "2026-03-11"]);
    expect(nextFrom(rule, "2026-03-12")).toBeNull();
  });

  it("counts from the series origin, not from the query start", () => {
    const rule: IRuleOptions = {
      frequency: "DAILY",
      start: at("2026-03-09"),
      byHourOfDay: [12],
      count: 5,
    };
    const series = new Schedule({ rrules: [rule] })
      .occurrences({ start: at("2026-03-11") })
      .toArray();
    expect(days(series)).toEqual(["2026-03-11", "2026-03-12", "2026-03-13"]);
  });

  it("counts occurrences exactly across months of different lengths", () => {
    // The count must not be inferred from elapsed time: an average-month
    // estimate drifts by one occurrence here.
    const rule: IRuleOptions = {
      frequency: "MONTHLY",
      start: at("2026-01-01"),
      byHourOfDay: [12],
      count: 14,
    };
    const series = new Schedule({ rrules: [rule] })
      .occurrences({ start: at("2026-12-01") })
      .toArray();
    expect(days(series)).toEqual(["2026-12-01", "2027-01-01", "2027-02-01"]);
  });
});
