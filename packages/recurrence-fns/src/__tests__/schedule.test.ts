import { describe, expect, it } from "vitest";
import { Schedule } from "../schedule";
import type { IRuleOptions } from "../types";
import { at, days } from "./helpers";

const base: Omit<IRuleOptions, "frequency"> = { start: at("2026-03-01"), byHourOfDay: [12] };

describe("merging rules", () => {
  it("interleaves two rules in ascending order", () => {
    const schedule = new Schedule({
      rrules: [
        { ...base, frequency: "MONTHLY", byDayOfMonth: [15] },
        { ...base, frequency: "MONTHLY", byDayOfWeek: [["MO", 1]] },
      ],
    });
    expect(days(schedule.occurrences({ take: 4 }).toArray())).toEqual([
      "2026-03-02",
      "2026-03-15",
      "2026-04-06",
      "2026-04-15",
    ]);
  });

  it("yields a shared instant once", () => {
    const schedule = new Schedule({
      rrules: [
        { ...base, frequency: "MONTHLY", byDayOfMonth: [9] },
        { ...base, frequency: "MONTHLY", byDayOfWeek: [["MO", 2]] },
      ],
    });
    // The 9th of March 2026 is also its second Monday.
    expect(days(schedule.occurrences({ take: 2 }).toArray())).toEqual(["2026-03-09", "2026-04-09"]);
  });

  it("applies count per rule rather than to the merged series", () => {
    const schedule = new Schedule({
      rrules: [
        { ...base, frequency: "MONTHLY", byDayOfMonth: [1] },
        { ...base, frequency: "MONTHLY", byDayOfWeek: [["MO", 2]], count: 2 },
      ],
    });
    // The capped rule contributes March 9 and April 13, then goes quiet while
    // the endless one keeps producing.
    expect(days(schedule.occurrences({ take: 6 }).toArray())).toEqual([
      "2026-03-01",
      "2026-03-09",
      "2026-04-01",
      "2026-04-13",
      "2026-05-01",
      "2026-06-01",
    ]);
  });

  it("has no occurrences without rules", () => {
    expect(new Schedule({ rrules: [] }).occurrences({ take: 5 }).toArray()).toEqual([]);
  });
});

describe("query filters", () => {
  const schedule = new Schedule({ rrules: [{ ...base, frequency: "DAILY" }] });

  it("treats the range as inclusive on both ends", () => {
    const series = schedule.occurrences({ start: at("2026-03-03"), end: at("2026-03-05") });
    expect(days(series.toArray())).toEqual(["2026-03-03", "2026-03-04", "2026-03-05"]);
  });

  it("returns nothing for a non-positive take", () => {
    expect(schedule.occurrences({ take: 0 }).toArray()).toEqual([]);
  });

  it("is iterable without materialising", () => {
    const seen: string[] = [];
    for (const { date } of schedule.occurrences({ take: 2 })) {
      seen.push(days([{ date }])[0]);
    }
    expect(seen).toEqual(["2026-03-01", "2026-03-02"]);
  });
});

describe("occursOn", () => {
  const schedule = new Schedule({
    rrules: [{ ...base, frequency: "MONTHLY", byDayOfWeek: [["MO", 2]] }],
  });

  it("matches an instant in the series", () => {
    expect(schedule.occursOn({ date: at("2026-03-09") })).toBe(true);
  });

  it("rejects a neighbouring day", () => {
    expect(schedule.occursOn({ date: at("2026-03-10") })).toBe(false);
  });

  it("compares the exact instant, hours included", () => {
    const midnight = new Date(2026, 2, 9);
    expect(schedule.occursOn({ date: midnight })).toBe(false);
  });

  it("rejects a date before the series starts", () => {
    expect(schedule.occursOn({ date: at("2026-02-09") })).toBe(false);
  });
});

describe("occursBetween", () => {
  const schedule = new Schedule({
    rrules: [{ ...base, frequency: "MONTHLY", byDayOfMonth: [15] }],
  });

  it("finds an occurrence inside the window", () => {
    expect(schedule.occursBetween(at("2026-03-13"), at("2026-03-17"))).toBe(true);
  });

  it("returns false for a window that misses every occurrence", () => {
    expect(schedule.occursBetween(at("2026-03-16"), at("2026-03-20"))).toBe(false);
  });

  it("includes both ends of the window", () => {
    expect(schedule.occursBetween(at("2026-03-15"), at("2026-03-15"))).toBe(true);
  });
});

describe("data", () => {
  it("carries the payload through untouched", () => {
    const data = { skipWeekend: true, weekendSolve: "before" as const };
    const schedule = new Schedule({ rrules: [{ ...base, frequency: "DAILY" }], data });
    expect(schedule.data).toBe(data);
  });
});
