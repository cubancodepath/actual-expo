import { describe, it, expect } from "vitest";
import {
  parseDate,
  dayFromDate,
  getDateWithSkippedWeekend,
  getNextOccurrence,
  getUpcomingDates,
  occursBetween,
  getLastOccurrence,
} from "./recurrence";
import type { RecurConfig } from "./types";

// ═══════════════════════════════════════════════════════════════════════════
// parseDate / dayFromDate
// ═══════════════════════════════════════════════════════════════════════════

describe("parseDate / dayFromDate", () => {
  it("round-trips a normal date", () => {
    expect(dayFromDate(parseDate("2026-03-09"))).toBe("2026-03-09");
  });

  it("round-trips leap year Feb 29", () => {
    expect(dayFromDate(parseDate("2024-02-29"))).toBe("2024-02-29");
  });

  it("round-trips Jan 1", () => {
    expect(dayFromDate(parseDate("2026-01-01"))).toBe("2026-01-01");
  });

  it("round-trips Dec 31", () => {
    expect(dayFromDate(parseDate("2026-12-31"))).toBe("2026-12-31");
  });

  it("parseDate sets time to noon to avoid timezone issues", () => {
    const d = parseDate("2026-03-09");
    expect(d.getHours()).toBe(12);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// getDateWithSkippedWeekend
// ═══════════════════════════════════════════════════════════════════════════

describe("getDateWithSkippedWeekend", () => {
  it("weekday returns same date", () => {
    // 2026-03-09 is Monday
    const mon = parseDate("2026-03-09");
    expect(dayFromDate(getDateWithSkippedWeekend(mon, "after"))).toBe("2026-03-09");
    expect(dayFromDate(getDateWithSkippedWeekend(mon, "before"))).toBe("2026-03-09");
  });

  it("Saturday + after → Monday", () => {
    // 2026-03-07 is Saturday
    const sat = parseDate("2026-03-07");
    expect(dayFromDate(getDateWithSkippedWeekend(sat, "after"))).toBe("2026-03-09");
  });

  it("Sunday + after → Monday", () => {
    // 2026-03-08 is Sunday
    const sun = parseDate("2026-03-08");
    expect(dayFromDate(getDateWithSkippedWeekend(sun, "after"))).toBe("2026-03-09");
  });

  it("Saturday + before → Friday", () => {
    const sat = parseDate("2026-03-07");
    expect(dayFromDate(getDateWithSkippedWeekend(sat, "before"))).toBe("2026-03-06");
  });

  it("Sunday + before → Friday", () => {
    const sun = parseDate("2026-03-08");
    expect(dayFromDate(getDateWithSkippedWeekend(sun, "before"))).toBe("2026-03-06");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// getNextOccurrence
// ═══════════════════════════════════════════════════════════════════════════

describe("getNextOccurrence", () => {
  const monday = parseDate("2026-03-09"); // Monday

  it("daily: returns start date when after=start", () => {
    const config: RecurConfig = { frequency: "daily", start: "2026-03-09" };
    const next = getNextOccurrence(config, monday);
    expect(next).not.toBeNull();
    expect(dayFromDate(next!)).toBe("2026-03-09");
  });

  it("daily: returns next day when after is day after start", () => {
    const config: RecurConfig = { frequency: "daily", start: "2026-03-09" };
    const after = parseDate("2026-03-10");
    const next = getNextOccurrence(config, after);
    expect(next).not.toBeNull();
    expect(dayFromDate(next!)).toBe("2026-03-10");
  });

  it("daily with interval=3: skips correctly", () => {
    const config: RecurConfig = { frequency: "daily", start: "2026-03-09", interval: 3 };
    // After 2026-03-10 → next should be 2026-03-12 (3 days from start)
    const after = parseDate("2026-03-10");
    const next = getNextOccurrence(config, after);
    expect(next).not.toBeNull();
    expect(dayFromDate(next!)).toBe("2026-03-12");
  });

  it("weekly: same day next week", () => {
    const config: RecurConfig = { frequency: "weekly", start: "2026-03-09" };
    // After start+1 day → should be next Monday (2026-03-16)
    const after = parseDate("2026-03-10");
    const next = getNextOccurrence(config, after);
    expect(next).not.toBeNull();
    expect(dayFromDate(next!)).toBe("2026-03-16");
  });

  it("monthly: same day-of-month next month", () => {
    const config: RecurConfig = { frequency: "monthly", start: "2026-03-09" };
    const after = parseDate("2026-03-10");
    const next = getNextOccurrence(config, after);
    expect(next).not.toBeNull();
    expect(dayFromDate(next!)).toBe("2026-04-09");
  });

  it("monthly with day pattern (15th)", () => {
    const config: RecurConfig = {
      frequency: "monthly",
      start: "2026-03-15",
      patterns: [{ type: "day", value: 15 }],
    };
    const after = parseDate("2026-03-16");
    const next = getNextOccurrence(config, after);
    expect(next).not.toBeNull();
    expect(dayFromDate(next!)).toBe("2026-04-15");
  });

  it("monthly with last day pattern (-1)", () => {
    const config: RecurConfig = {
      frequency: "monthly",
      start: "2026-03-01",
      patterns: [{ type: "day", value: -1 }],
    };
    // Last day of March = 31
    const after = parseDate("2026-03-01");
    const next = getNextOccurrence(config, after);
    expect(next).not.toBeNull();
    expect(dayFromDate(next!)).toBe("2026-03-31");
  });

  it("monthly clamping: start on 31st, month with 30 days", () => {
    const config: RecurConfig = { frequency: "monthly", start: "2026-01-31" };
    // February has 28 days in 2026 → should clamp to 28
    const after = parseDate("2026-02-01");
    const next = getNextOccurrence(config, after);
    expect(next).not.toBeNull();
    expect(dayFromDate(next!)).toBe("2026-02-28");
  });

  it("yearly: same date next year", () => {
    const config: RecurConfig = { frequency: "yearly", start: "2026-03-09" };
    const after = parseDate("2026-03-10");
    const next = getNextOccurrence(config, after);
    expect(next).not.toBeNull();
    expect(dayFromDate(next!)).toBe("2027-03-09");
  });

  it("finite schedule (endMode on_date): returns null when exhausted", () => {
    const config: RecurConfig = {
      frequency: "daily",
      start: "2026-03-09",
      endMode: "on_date",
      endDate: "2026-03-11",
    };
    // After end date → no more occurrences
    const after = parseDate("2026-03-12");
    const next = getNextOccurrence(config, after);
    expect(next).toBeNull();
  });

  it("finite schedule (endMode after_n_occurrences): stops after N", () => {
    const config: RecurConfig = {
      frequency: "daily",
      start: "2026-03-09",
      endMode: "after_n_occurrences",
      endOccurrences: 3,
    };
    // 3 occurrences: Mar 9, 10, 11. After Mar 11 → null
    const after = parseDate("2026-03-12");
    const next = getNextOccurrence(config, after);
    expect(next).toBeNull();
  });

  it("returns start date when after equals start", () => {
    const config: RecurConfig = { frequency: "weekly", start: "2026-03-09" };
    const next = getNextOccurrence(config, monday);
    expect(next).not.toBeNull();
    expect(dayFromDate(next!)).toBe("2026-03-09");
  });

  it("monthly with day-of-week pattern (2nd Monday)", () => {
    const config: RecurConfig = {
      frequency: "monthly",
      start: "2026-03-01",
      patterns: [{ type: "MO", value: 2 }],
    };
    // 2nd Monday of March 2026 = March 9
    const after = parseDate("2026-03-01");
    const next = getNextOccurrence(config, after);
    expect(next).not.toBeNull();
    expect(dayFromDate(next!)).toBe("2026-03-09");
  });

  it("monthly with last day-of-week pattern (last Friday)", () => {
    const config: RecurConfig = {
      frequency: "monthly",
      start: "2026-03-01",
      patterns: [{ type: "FR", value: -1 }],
    };
    // Last Friday of March 2026 = March 27
    const after = parseDate("2026-03-01");
    const next = getNextOccurrence(config, after);
    expect(next).not.toBeNull();
    expect(dayFromDate(next!)).toBe("2026-03-27");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// getUpcomingDates
// ═══════════════════════════════════════════════════════════════════════════

describe("getUpcomingDates", () => {
  it("returns exactly N dates for infinite schedule", () => {
    const config: RecurConfig = { frequency: "daily", start: "2026-03-09" };
    const dates = getUpcomingDates(config, 5, parseDate("2026-03-09"));
    expect(dates).toHaveLength(5);
    expect(dayFromDate(dates[0])).toBe("2026-03-09");
    expect(dayFromDate(dates[4])).toBe("2026-03-13");
  });

  it("returns fewer than N for finite schedule", () => {
    const config: RecurConfig = {
      frequency: "daily",
      start: "2026-03-09",
      endMode: "after_n_occurrences",
      endOccurrences: 2,
    };
    const dates = getUpcomingDates(config, 5, parseDate("2026-03-09"));
    expect(dates).toHaveLength(2);
  });

  it("count=0 returns empty", () => {
    const config: RecurConfig = { frequency: "daily", start: "2026-03-09" };
    const dates = getUpcomingDates(config, 0, parseDate("2026-03-09"));
    expect(dates).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// occursBetween
// ═══════════════════════════════════════════════════════════════════════════

describe("occursBetween", () => {
  const config: RecurConfig = { frequency: "weekly", start: "2026-03-09" };

  it("occurrence within range → true", () => {
    expect(occursBetween(config, parseDate("2026-03-09"), parseDate("2026-03-15"))).toBe(true);
  });

  it("no occurrence in range → false", () => {
    // Weekly from Mon March 9. Range Tue-Sat of same week → false
    expect(occursBetween(config, parseDate("2026-03-10"), parseDate("2026-03-14"))).toBe(false);
  });

  it("occurrence on boundary → true", () => {
    expect(occursBetween(config, parseDate("2026-03-09"), parseDate("2026-03-09"))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// getLastOccurrence
// ═══════════════════════════════════════════════════════════════════════════

describe("getLastOccurrence", () => {
  it("endMode=never → null", () => {
    const config: RecurConfig = { frequency: "daily", start: "2026-03-09" };
    expect(getLastOccurrence(config)).toBeNull();
  });

  it("endMode=on_date → returns last date before end", () => {
    const config: RecurConfig = {
      frequency: "daily",
      start: "2026-03-09",
      endMode: "on_date",
      endDate: "2026-03-11",
    };
    const last = getLastOccurrence(config);
    expect(last).not.toBeNull();
    expect(dayFromDate(last!)).toBe("2026-03-11");
  });

  it("endMode=after_n_occurrences with count=1 → returns start date", () => {
    const config: RecurConfig = {
      frequency: "weekly",
      start: "2026-03-09",
      endMode: "after_n_occurrences",
      endOccurrences: 1,
    };
    const last = getLastOccurrence(config);
    expect(last).not.toBeNull();
    expect(dayFromDate(last!)).toBe("2026-03-09");
  });

  it("endMode=after_n_occurrences with count=3 daily → returns start+2", () => {
    const config: RecurConfig = {
      frequency: "daily",
      start: "2026-03-09",
      endMode: "after_n_occurrences",
      endOccurrences: 3,
    };
    const last = getLastOccurrence(config);
    expect(last).not.toBeNull();
    expect(dayFromDate(last!)).toBe("2026-03-11");
  });
});
