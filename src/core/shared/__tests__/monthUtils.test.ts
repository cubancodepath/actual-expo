import { describe, it, expect } from "vitest";
import * as monthUtils from "../monthUtils";

describe("monthUtils — parsing & basic accessors", () => {
  it("getMonth / getYear slice correctly", () => {
    expect(monthUtils.getMonth("2024-03-19")).toBe("2024-03");
    expect(monthUtils.getYear("2024-03")).toBe("2024");
    expect(monthUtils.getDay("2024-03-19")).toBe(19);
  });

  it("monthFromDate / dayFromDate normalize", () => {
    expect(monthUtils.monthFromDate("2024-03-19")).toBe("2024-03");
    expect(monthUtils.dayFromDate("2024-03-19")).toBe("2024-03-19");
  });

  it("isValidYearMonth", () => {
    expect(monthUtils.isValidYearMonth("2024-03")).toBe(true);
    expect(monthUtils.isValidYearMonth("2024-13")).toBe(false);
    expect(monthUtils.isValidYearMonth("2024-03-01")).toBe(false);
  });
});

describe("monthUtils — arithmetic", () => {
  it("addMonths / subMonths cross year boundaries", () => {
    expect(monthUtils.addMonths("2024-12", 1)).toBe("2025-01");
    expect(monthUtils.subMonths("2024-01", 1)).toBe("2023-12");
    expect(monthUtils.addMonths("2024-01", 13)).toBe("2025-02");
  });

  it("prevMonth / nextMonth / prevYear", () => {
    expect(monthUtils.prevMonth("2024-01")).toBe("2023-12");
    expect(monthUtils.nextMonth("2024-12")).toBe("2025-01");
    expect(monthUtils.prevYear("2024-06")).toBe("2023-06");
  });

  it("addDays / subDays handle month rollover", () => {
    expect(monthUtils.addDays("2024-02-28", 1)).toBe("2024-02-29"); // leap year
    expect(monthUtils.subDays("2024-03-01", 1)).toBe("2024-02-29");
  });

  it("firstDayOfMonth / lastDayOfMonth", () => {
    expect(monthUtils.firstDayOfMonth("2024-02-15")).toBe("2024-02-01");
    expect(monthUtils.lastDayOfMonth("2024-02-15")).toBe("2024-02-29");
    expect(monthUtils.getMonthEnd("2024-02-15")).toBe("2024-02-29");
  });

  it("getYearStart / getYearEnd", () => {
    expect(monthUtils.getYearStart("2024-06")).toBe("2024-01");
    expect(monthUtils.getYearEnd("2024-06")).toBe("2024-12");
  });
});

describe("monthUtils — ranges", () => {
  it("rangeInclusive over months", () => {
    expect(monthUtils.rangeInclusive("2024-01", "2024-04")).toEqual([
      "2024-01",
      "2024-02",
      "2024-03",
      "2024-04",
    ]);
  });

  it("range is exclusive of end", () => {
    expect(monthUtils.range("2024-01", "2024-04")).toEqual(["2024-01", "2024-02", "2024-03"]);
  });

  it("dayRangeInclusive", () => {
    expect(monthUtils.dayRangeInclusive("2024-01-30", "2024-02-02")).toEqual([
      "2024-01-30",
      "2024-01-31",
      "2024-02-01",
      "2024-02-02",
    ]);
  });

  it("yearRangeInclusive", () => {
    expect(monthUtils.yearRangeInclusive("2022-05", "2024-02")).toEqual(["2022", "2023", "2024"]);
  });
});

describe("monthUtils — comparisons", () => {
  it("isAfter / isBefore", () => {
    expect(monthUtils.isAfter("2024-05", "2024-04")).toBe(true);
    expect(monthUtils.isBefore("2024-04", "2024-05")).toBe(true);
    expect(monthUtils.isAfter("2024-04", "2024-05")).toBe(false);
  });

  it("differenceInCalendarMonths", () => {
    expect(monthUtils.differenceInCalendarMonths("2024-05", "2024-01")).toBe(4);
  });
});
