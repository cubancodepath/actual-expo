import { describe, expect, it } from "vitest";
import { RecurrenceError } from "../errors";
import { Schedule } from "../schedule";
import type { IRuleOptions } from "../types";
import { at, days } from "./helpers";

const base: Omit<IRuleOptions, "frequency"> = { start: at("2026-03-01"), byHourOfDay: [12] };

describe("reverse iteration", () => {
  it("returns the last occurrence of a series ended by date", () => {
    const schedule = new Schedule({
      rrules: [{ ...base, frequency: "DAILY", end: at("2026-03-05") }],
    });
    const last = schedule.occurrences({ reverse: true, take: 1 }).toArray();
    expect(days(last)).toEqual(["2026-03-05"]);
  });

  it("returns the last occurrence of a series ended by count", () => {
    const schedule = new Schedule({ rrules: [{ ...base, frequency: "DAILY", count: 3 }] });
    expect(days(schedule.occurrences({ reverse: true, take: 1 }).toArray())).toEqual([
      "2026-03-03",
    ]);
  });

  it("walks descending", () => {
    const schedule = new Schedule({
      rrules: [{ ...base, frequency: "DAILY", end: at("2026-03-05") }],
    });
    expect(days(schedule.occurrences({ reverse: true }).toArray())).toEqual([
      "2026-03-05",
      "2026-03-04",
      "2026-03-03",
      "2026-03-02",
      "2026-03-01",
    ]);
  });

  it("accepts an explicit end for an otherwise endless series", () => {
    const schedule = new Schedule({ rrules: [{ ...base, frequency: "MONTHLY" }] });
    const last = schedule.occurrences({ reverse: true, end: at("2026-07-15"), take: 1 }).toArray();
    expect(days(last)).toEqual(["2026-07-01"]);
  });

  it("stops at the start of the series", () => {
    const schedule = new Schedule({ rrules: [{ ...base, frequency: "MONTHLY" }] });
    const all = schedule.occurrences({ reverse: true, end: at("2026-05-15") }).toArray();
    expect(days(all)).toEqual(["2026-05-01", "2026-04-01", "2026-03-01"]);
  });

  it("merges descending across rules", () => {
    const schedule = new Schedule({
      rrules: [
        { ...base, frequency: "MONTHLY", byDayOfMonth: [1], end: at("2026-05-31") },
        { ...base, frequency: "MONTHLY", byDayOfMonth: [15], end: at("2026-05-31") },
      ],
    });
    expect(days(schedule.occurrences({ reverse: true, take: 3 }).toArray())).toEqual([
      "2026-05-15",
      "2026-05-01",
      "2026-04-15",
    ]);
  });

  it("refuses to walk an endless series backwards", () => {
    const schedule = new Schedule({ rrules: [{ ...base, frequency: "DAILY" }] });
    expect(() => schedule.occurrences({ reverse: true, take: 1 }).toArray()).toThrow(
      RecurrenceError,
    );
  });

  it("finds the last leap-year occurrence without scanning every year", () => {
    const schedule = new Schedule({
      rrules: [{ ...base, frequency: "YEARLY", start: at("2024-02-29"), end: at("2099-12-31") }],
    });
    expect(days(schedule.occurrences({ reverse: true, take: 1 }).toArray())).toEqual([
      "2096-02-29",
    ]);
  });
});
