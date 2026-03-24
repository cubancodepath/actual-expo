import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  extractScheduleConds,
  getStatus,
  getScheduledAmount,
  getRecurringDescription,
} from "./helpers";
import type { RuleCondition, RecurConfig } from "./types";

// Mock todayStr so tests are deterministic
vi.mock("../lib/date", () => ({
  todayStr: () => "2026-03-09",
}));

// ═══════════════════════════════════════════════════════════════════════════
// extractScheduleConds
// ═══════════════════════════════════════════════════════════════════════════

describe("extractScheduleConds", () => {
  it("extracts standard conditions", () => {
    const conditions: RuleCondition[] = [
      { field: "payee", op: "is", value: "payee-1" },
      { field: "account", op: "is", value: "acct-1" },
      { field: "amount", op: "isapprox", value: -5000 },
      { field: "date", op: "isapprox", value: { frequency: "monthly", start: "2026-03-09" } },
    ];
    const result = extractScheduleConds(conditions);
    expect(result.payee?.value).toBe("payee-1");
    expect(result.account?.value).toBe("acct-1");
    expect(result.amount?.value).toBe(-5000);
    expect(result.date).not.toBeNull();
  });

  it("returns all null for empty array", () => {
    const result = extractScheduleConds([]);
    expect(result.payee).toBeNull();
    expect(result.account).toBeNull();
    expect(result.amount).toBeNull();
    expect(result.date).toBeNull();
  });

  it("extracts legacy description field as payee", () => {
    const conditions: RuleCondition[] = [{ field: "description", op: "is", value: "legacy-payee" }];
    const result = extractScheduleConds(conditions);
    expect(result.payee?.value).toBe("legacy-payee");
  });

  it("extracts legacy acct field as account", () => {
    const conditions: RuleCondition[] = [{ field: "acct", op: "is", value: "legacy-acct" }];
    const result = extractScheduleConds(conditions);
    expect(result.account?.value).toBe("legacy-acct");
  });

  it("returns null for missing fields", () => {
    const conditions: RuleCondition[] = [{ field: "payee", op: "is", value: "p1" }];
    const result = extractScheduleConds(conditions);
    expect(result.payee).not.toBeNull();
    expect(result.account).toBeNull();
    expect(result.amount).toBeNull();
    expect(result.date).toBeNull();
  });

  it("extracts amount with isbetween op", () => {
    const conditions: RuleCondition[] = [
      { field: "amount", op: "isbetween", value: { num1: -5000, num2: -4000 } },
    ];
    const result = extractScheduleConds(conditions);
    expect(result.amount?.op).toBe("isbetween");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// getStatus
// ═══════════════════════════════════════════════════════════════════════════

describe("getStatus", () => {
  // todayStr() is mocked to return '2026-03-09'

  it("completed=true → completed", () => {
    expect(getStatus("2026-03-09", true, false)).toBe("completed");
  });

  it("hasTrans=true → paid", () => {
    expect(getStatus("2026-03-09", false, true)).toBe("paid");
  });

  it("nextDate=null, not completed → scheduled", () => {
    expect(getStatus(null, false, false)).toBe("scheduled");
  });

  it("nextDate=today → due", () => {
    expect(getStatus("2026-03-09", false, false)).toBe("due");
  });

  it("nextDate=tomorrow → upcoming (within 7 days)", () => {
    expect(getStatus("2026-03-10", false, false)).toBe("upcoming");
  });

  it("nextDate=yesterday → missed", () => {
    expect(getStatus("2026-03-08", false, false)).toBe("missed");
  });

  it("nextDate=today+8 → scheduled (beyond default 7-day window)", () => {
    expect(getStatus("2026-03-17", false, false)).toBe("scheduled");
  });

  it("nextDate=today+7 → upcoming (boundary)", () => {
    expect(getStatus("2026-03-16", false, false)).toBe("upcoming");
  });

  it("custom upcomingLength=3 respects shorter window", () => {
    // today+3 = Mar 12, within 3-day window
    expect(getStatus("2026-03-12", false, false, "3")).toBe("upcoming");
    // today+4 = Mar 13, outside 3-day window
    expect(getStatus("2026-03-13", false, false, "3")).toBe("scheduled");
  });

  it("completed takes priority over hasTrans", () => {
    expect(getStatus("2026-03-09", true, true)).toBe("completed");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// getScheduledAmount
// ═══════════════════════════════════════════════════════════════════════════

describe("getScheduledAmount", () => {
  it("number → returns it", () => {
    expect(getScheduledAmount(-5000)).toBe(-5000);
  });

  it("null → 0", () => {
    expect(getScheduledAmount(null)).toBe(0);
  });

  it("range → average (rounded)", () => {
    expect(getScheduledAmount({ num1: -5000, num2: -4000 })).toBe(-4500);
  });

  it("range with odd sum → rounds via Math.round", () => {
    // (-5001 + -4000) / 2 = -4500.5 → Math.round → -4500
    expect(getScheduledAmount({ num1: -5001, num2: -4000 })).toBe(-4500);
  });

  it("inverse=true → negated number", () => {
    expect(getScheduledAmount(-5000, true)).toBe(5000);
  });

  it("inverse=true → negated range average", () => {
    expect(getScheduledAmount({ num1: -5000, num2: -4000 }, true)).toBe(4500);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// getRecurringDescription
// ═══════════════════════════════════════════════════════════════════════════

describe("getRecurringDescription", () => {
  it('daily → "Every day"', () => {
    const config: RecurConfig = { frequency: "daily", start: "2026-03-09" };
    expect(getRecurringDescription(config)).toBe("Every day");
  });

  it('daily interval=3 → "Every 3 days"', () => {
    const config: RecurConfig = { frequency: "daily", start: "2026-03-09", interval: 3 };
    expect(getRecurringDescription(config)).toBe("Every 3 days");
  });

  it('weekly → "Every week on Monday"', () => {
    // 2026-03-09 is Monday
    const config: RecurConfig = { frequency: "weekly", start: "2026-03-09" };
    expect(getRecurringDescription(config)).toBe("Every week on Monday");
  });

  it('monthly → "Every month on the 9th"', () => {
    const config: RecurConfig = { frequency: "monthly", start: "2026-03-09" };
    expect(getRecurringDescription(config)).toBe("Every month on the 9th");
  });

  it("monthly with day pattern (15th)", () => {
    const config: RecurConfig = {
      frequency: "monthly",
      start: "2026-03-15",
      patterns: [{ type: "day", value: 15 }],
    };
    expect(getRecurringDescription(config)).toBe("Every month on the 15th");
  });

  it("monthly with last day pattern", () => {
    const config: RecurConfig = {
      frequency: "monthly",
      start: "2026-03-01",
      patterns: [{ type: "day", value: -1 }],
    };
    expect(getRecurringDescription(config)).toBe("Every month on the last day");
  });

  it('yearly → "Every year on Mar 9th"', () => {
    const config: RecurConfig = { frequency: "yearly", start: "2026-03-09" };
    expect(getRecurringDescription(config)).toBe("Every year on Mar 9th");
  });

  it('endMode=after_n_occurrences → appends ", 5 times"', () => {
    const config: RecurConfig = {
      frequency: "daily",
      start: "2026-03-09",
      endMode: "after_n_occurrences",
      endOccurrences: 5,
    };
    expect(getRecurringDescription(config)).toBe("Every day, 5 times");
  });

  it('endMode=after_n_occurrences with 1 → ", once"', () => {
    const config: RecurConfig = {
      frequency: "daily",
      start: "2026-03-09",
      endMode: "after_n_occurrences",
      endOccurrences: 1,
    };
    expect(getRecurringDescription(config)).toBe("Every day, once");
  });

  it('endMode=on_date → appends ", until <date>"', () => {
    const config: RecurConfig = {
      frequency: "daily",
      start: "2026-03-09",
      endMode: "on_date",
      endDate: "2026-12-31",
    };
    expect(getRecurringDescription(config)).toBe("Every day, until 2026-12-31");
  });

  it('skipWeekend → appends "(after weekend)"', () => {
    const config: RecurConfig = {
      frequency: "monthly",
      start: "2026-03-09",
      skipWeekend: true,
      weekendSolveMode: "after",
    };
    expect(getRecurringDescription(config)).toContain("(after weekend)");
  });

  it('skipWeekend before → appends "(before weekend)"', () => {
    const config: RecurConfig = {
      frequency: "monthly",
      start: "2026-03-09",
      skipWeekend: true,
      weekendSolveMode: "before",
    };
    expect(getRecurringDescription(config)).toContain("(before weekend)");
  });

  it("monthly with day-of-week pattern (2nd Monday)", () => {
    const config: RecurConfig = {
      frequency: "monthly",
      start: "2026-03-09",
      patterns: [{ type: "MO", value: 2 }],
    };
    expect(getRecurringDescription(config)).toBe("Every month on the 2nd Monday");
  });

  it("monthly with last Friday pattern", () => {
    const config: RecurConfig = {
      frequency: "monthly",
      start: "2026-03-01",
      patterns: [{ type: "FR", value: -1 }],
    };
    expect(getRecurringDescription(config)).toBe("Every month on the last Friday");
  });
});
