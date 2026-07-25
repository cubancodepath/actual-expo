/**
 * The date helpers that stayed in the app when the recurrence engine moved to
 * recurrence-fns. The weekend skip lives here rather than in the package
 * because upstream keeps it outside the engine too.
 */
import { describe, expect, it } from "vitest";
import { parseDate, dayFromDate, getDateWithSkippedWeekend } from "@/core/shared/schedules";

describe("parseDate / dayFromDate", () => {
  it("round-trips a date string", () => {
    expect(dayFromDate(parseDate("2026-03-09"))).toBe("2026-03-09");
  });

  it("anchors at noon, so a timezone shift cannot move the day", () => {
    expect(parseDate("2026-03-09").getHours()).toBe(12);
  });

  it("handles a leap day", () => {
    expect(dayFromDate(parseDate("2024-02-29"))).toBe("2024-02-29");
  });

  it("handles the first and last day of a year", () => {
    expect(dayFromDate(parseDate("2026-01-01"))).toBe("2026-01-01");
    expect(dayFromDate(parseDate("2026-12-31"))).toBe("2026-12-31");
  });
});

describe("getDateWithSkippedWeekend", () => {
  const saturday = parseDate("2026-03-07");
  const sunday = parseDate("2026-03-08");
  const monday = parseDate("2026-03-09");

  it("leaves a weekday alone", () => {
    expect(dayFromDate(getDateWithSkippedWeekend(monday, "after"))).toBe("2026-03-09");
    expect(dayFromDate(getDateWithSkippedWeekend(monday, "before"))).toBe("2026-03-09");
  });

  it("pushes the weekend forward to Monday", () => {
    expect(dayFromDate(getDateWithSkippedWeekend(saturday, "after"))).toBe("2026-03-09");
    expect(dayFromDate(getDateWithSkippedWeekend(sunday, "after"))).toBe("2026-03-09");
  });

  it("pulls the weekend back to Friday", () => {
    expect(dayFromDate(getDateWithSkippedWeekend(saturday, "before"))).toBe("2026-03-06");
    expect(dayFromDate(getDateWithSkippedWeekend(sunday, "before"))).toBe("2026-03-06");
  });
});
