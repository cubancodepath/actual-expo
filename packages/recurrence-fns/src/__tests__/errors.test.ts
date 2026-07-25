import { describe, expect, it } from "vitest";
import { RecurrenceError } from "../errors";
import { Schedule } from "../schedule";
import type { Frequency, IRuleOptions } from "../types";
import { at } from "./helpers";

const base: Omit<IRuleOptions, "frequency"> = { start: at("2026-03-01"), byHourOfDay: [12] };

function code(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof RecurrenceError) return e.code;
    throw e;
  }
  throw new Error("expected a RecurrenceError");
}

describe("option validation", () => {
  it("rejects an invalid start", () => {
    expect(
      code(() => new Schedule({ rrules: [{ ...base, frequency: "DAILY", start: new Date(NaN) }] })),
    ).toBe("invalid-options");
  });

  it("rejects an unknown frequency", () => {
    const frequency = "HOURLY" as Frequency;
    expect(code(() => new Schedule({ rrules: [{ ...base, frequency }] }))).toBe("invalid-options");
  });

  it("rejects a non-positive interval", () => {
    expect(
      code(() => new Schedule({ rrules: [{ ...base, frequency: "DAILY", interval: 0 }] })),
    ).toBe("invalid-options");
  });

  it("rejects by-rules outside MONTHLY", () => {
    expect(
      code(() => new Schedule({ rrules: [{ ...base, frequency: "WEEKLY", byDayOfMonth: [1] }] })),
    ).toBe("invalid-options");
  });

  it("rejects an out-of-range day of month", () => {
    expect(
      code(() => new Schedule({ rrules: [{ ...base, frequency: "MONTHLY", byDayOfMonth: [0] }] })),
    ).toBe("invalid-options");
  });

  it("rejects an out-of-range hour", () => {
    expect(
      code(() => new Schedule({ rrules: [{ ...base, frequency: "DAILY", byHourOfDay: [24] }] })),
    ).toBe("invalid-options");
  });
});

describe("unbounded guards", () => {
  it("refuses to drain an endless series", () => {
    const schedule = new Schedule({ rrules: [{ ...base, frequency: "DAILY" }] });
    expect(code(() => schedule.occurrences().toArray())).toBe("unbounded-drain");
  });

  it("allows draining once take bounds it", () => {
    const schedule = new Schedule({ rrules: [{ ...base, frequency: "DAILY" }] });
    expect(schedule.occurrences({ take: 2 }).toArray()).toHaveLength(2);
  });

  it("allows draining once end bounds it", () => {
    const schedule = new Schedule({ rrules: [{ ...base, frequency: "DAILY" }] });
    expect(schedule.occurrences({ end: at("2026-03-03") }).toArray()).toHaveLength(3);
  });

  it("refuses to reverse an endless series", () => {
    const schedule = new Schedule({ rrules: [{ ...base, frequency: "DAILY" }] });
    expect(code(() => schedule.occurrences({ reverse: true, take: 1 }).toArray())).toBe(
      "unbounded-reverse",
    );
  });
});

describe("impossible patterns", () => {
  it("terminates instead of spinning when a pattern never resolves", () => {
    // Every twelfth month from February, asking for the 31st: no February ever
    // has one, so the rule can only ever be empty.
    const schedule = new Schedule({
      rrules: [
        {
          ...base,
          frequency: "MONTHLY",
          interval: 12,
          start: at("2026-02-01"),
          byDayOfMonth: [31],
        },
      ],
    });
    expect(schedule.occurrences({ take: 1 }).toArray()).toEqual([]);
  });

  it("still finds a rare pattern that does eventually resolve", () => {
    // A fifth Monday in February needs a leap year starting on a Monday: 2044.
    const schedule = new Schedule({
      rrules: [
        {
          ...base,
          frequency: "MONTHLY",
          interval: 12,
          start: at("2026-02-01"),
          byDayOfWeek: [["MO", 5]],
        },
      ],
    });
    const [first] = schedule.occurrences({ take: 1 }).toArray();
    expect(first.date.getFullYear()).toBe(2044);
  });
});
