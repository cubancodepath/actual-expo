import { describe, it, expect } from "vitest";
import {
  validateAutomation,
  validatePercentageAllocation,
  validateSchedulePriorities,
} from "./validate";
import type { ByTemplate, PercentageTemplate, ScheduleTemplate, Template } from "./types";

const TODAY = new Date(2026, 6, 17); // 2026-07-17
const SCHEDULES = [
  { id: "s1", name: "Internet" },
  { id: "s2", name: "Done", completed: true },
];

describe("validateAutomation — amount", () => {
  it("flags a zero amount on goals that carry their own money", () => {
    const fixed: Template = {
      type: "periodic",
      amount: 0,
      period: { period: "month", amount: 1 },
      priority: 0,
      directive: "template",
    };
    expect(validateAutomation(fixed, "fixed", [fixed], [], TODAY)).toEqual({
      kind: "amount-zero",
    });

    const goal: Template = { type: "goal", amount: 0, directive: "goal" };
    expect(validateAutomation(goal, "goal", [goal], [], TODAY)).toEqual({ kind: "amount-zero" });
  });

  it("checks a refill-to-cap's amount inside its limit", () => {
    const refillToCap: Template = {
      type: "simple",
      limit: { amount: 0, hold: false, period: "monthly" },
      priority: 0,
      directive: "template",
    };
    expect(validateAutomation(refillToCap, "fixed", [refillToCap], [], TODAY)).toEqual({
      kind: "amount-zero",
    });
  });

  it("leaves types whose amount is derived elsewhere alone", () => {
    const remainder: Template = { type: "remainder", weight: 1, directive: "template" };
    expect(validateAutomation(remainder, "remainder", [remainder], [], TODAY)).toBeNull();
  });
});

describe("validateAutomation — schedule", () => {
  const schedule = (over: Partial<ScheduleTemplate> = {}): ScheduleTemplate => ({
    type: "schedule",
    name: "Internet",
    scheduleId: "s1",
    priority: 0,
    directive: "template",
    ...over,
  });

  it("accepts a schedule that resolves", () => {
    expect(validateAutomation(schedule(), "schedule", [], SCHEDULES, TODAY)).toBeNull();
  });

  it("flags an unlinked schedule", () => {
    const t = schedule({ name: "", scheduleId: undefined });
    expect(validateAutomation(t, "schedule", [], SCHEDULES, TODAY)).toEqual({
      kind: "schedule-not-found",
      name: "",
    });
  });

  it("flags a schedule that no longer exists", () => {
    const t = schedule({ name: "Gone", scheduleId: "missing" });
    expect(validateAutomation(t, "schedule", [], SCHEDULES, TODAY)).toMatchObject({
      kind: "schedule-not-found",
    });
  });

  it("flags a completed schedule — it will never budget again", () => {
    const t = schedule({ name: "Done", scheduleId: "s2" });
    expect(validateAutomation(t, "schedule", [], SCHEDULES, TODAY)).toMatchObject({
      kind: "schedule-not-found",
    });
  });

  it("treats SQLite's integer flags as completed", () => {
    const t = schedule({ name: "Int", scheduleId: "s3" });
    const schedules = [{ id: "s3", name: "Int", completed: 1 }];
    expect(validateAutomation(t, "schedule", [], schedules, TODAY)).toMatchObject({
      kind: "schedule-not-found",
    });
  });

  it("flags an out-of-range percent adjustment", () => {
    const t = schedule({ adjustment: -100, adjustmentType: "percent" });
    expect(validateAutomation(t, "schedule", [], SCHEDULES, TODAY)).toEqual({
      kind: "adjustment-out-of-range",
    });
  });

  it("allows a large fixed adjustment (only percentages are bounded)", () => {
    const t = schedule({ adjustment: 5000, adjustmentType: "fixed" });
    expect(validateAutomation(t, "schedule", [], SCHEDULES, TODAY)).toBeNull();
  });
});

describe("validateAutomation — refill and limit", () => {
  const refill: Template = { type: "refill", priority: 0, directive: "template" };
  const limit: Template = {
    type: "limit",
    amount: 100,
    hold: false,
    period: "monthly",
    directive: "template",
  };
  const fixed: Template = {
    type: "periodic",
    amount: 10,
    period: { period: "month", amount: 1 },
    priority: 0,
    directive: "template",
  };

  it("flags a refill with no cap to refill to", () => {
    expect(validateAutomation(refill, "refill", [refill], [], TODAY)).toEqual({
      kind: "refill-no-cap",
    });
  });

  it("accepts a refill paired with a limit", () => {
    expect(validateAutomation(refill, "refill", [refill, limit], [], TODAY)).toBeNull();
  });

  it("flags a limit with nothing contributing money to cap", () => {
    expect(validateAutomation(limit, "limit", [limit], [], TODAY)).toEqual({
      kind: "limit-no-contributor",
    });
  });

  it("does not count a long-term goal as a contributor — it budgets nothing", () => {
    const goal: Template = { type: "goal", amount: 500, directive: "goal" };
    expect(validateAutomation(limit, "limit", [limit, goal], [], TODAY)).toEqual({
      kind: "limit-no-contributor",
    });
  });

  it("accepts a limit alongside a contributor", () => {
    expect(validateAutomation(limit, "limit", [limit, fixed], [], TODAY)).toBeNull();
  });
});

describe("validateAutomation — percentage", () => {
  const pct = (over: Partial<PercentageTemplate> = {}): PercentageTemplate => ({
    type: "percentage",
    percent: 10,
    previous: false,
    category: "all-income",
    priority: 0,
    directive: "template",
    ...over,
  });

  it("accepts a valid percentage", () => {
    expect(validateAutomation(pct(), "percentage", [], [], TODAY)).toBeNull();
  });

  it("flags a missing source", () => {
    expect(validateAutomation(pct({ category: "" }), "percentage", [], [], TODAY)).toEqual({
      kind: "percentage-no-source",
    });
  });

  it.each([0, -5, 101])("flags an out-of-range percent (%i)", (percent) => {
    expect(validateAutomation(pct({ percent }), "percentage", [], [], TODAY)).toMatchObject({
      kind: "percentage-out-of-range",
    });
  });

  it("flags a source that isn't a known income category", () => {
    const sources = new Set(["all-income", "cat-1"]);
    expect(
      validateAutomation(pct({ category: "gone" }), "percentage", [], [], TODAY, sources),
    ).toEqual({ kind: "percentage-source-not-found", source: "gone" });
  });

  it("skips the source check when no source set is supplied", () => {
    expect(validateAutomation(pct({ category: "gone" }), "percentage", [], [], TODAY)).toBeNull();
  });
});

describe("validateAutomation — by and spend", () => {
  const by = (over: Partial<ByTemplate> = {}): ByTemplate => ({
    type: "by",
    amount: 1000,
    month: "2027-01",
    priority: 0,
    directive: "template",
    ...over,
  });

  it("accepts a future target", () => {
    expect(validateAutomation(by(), "fixed", [], [], TODAY)).toBeNull();
  });

  it("flags a missing or malformed target month", () => {
    expect(validateAutomation(by({ month: "" }), "fixed", [], [], TODAY)).toEqual({
      kind: "by-no-month",
    });
    expect(validateAutomation(by({ month: "2027-13" }), "fixed", [], [], TODAY)).toEqual({
      kind: "by-no-month",
    });
  });

  it("flags a one-shot target in the past", () => {
    expect(validateAutomation(by({ month: "2026-01" }), "fixed", [], [], TODAY)).toEqual({
      kind: "by-target-past",
      month: "2026-01",
    });
  });

  it("allows a recurring goal anchored in the past — the engine rolls it forward", () => {
    const t = by({ month: "2026-01", annual: true, repeat: 1 });
    expect(validateAutomation(t, "fixed", [], [], TODAY)).toBeNull();
  });

  it("accepts the current month as a target", () => {
    expect(validateAutomation(by({ month: "2026-07" }), "fixed", [], [], TODAY)).toBeNull();
  });

  it("flags a spend template with no start month", () => {
    const t: Template = { ...by(), type: "spend", from: "" } as Template;
    expect(validateAutomation(t, "fixed", [], [], TODAY)).toEqual({ kind: "spend-no-from" });
  });

  it("flags a spend window that starts after it ends", () => {
    const t: Template = { ...by({ month: "2027-01" }), type: "spend", from: "2027-06" } as Template;
    expect(validateAutomation(t, "fixed", [], [], TODAY)).toEqual({
      kind: "spend-from-after-target",
    });
  });

  it("accepts a valid spend window", () => {
    const t: Template = { ...by({ month: "2027-01" }), type: "spend", from: "2026-11" } as Template;
    expect(validateAutomation(t, "fixed", [], [], TODAY)).toBeNull();
  });
});

describe("validatePercentageAllocation", () => {
  const pct = (percent: number, category: string, previous = false): Template => ({
    type: "percentage",
    percent,
    previous,
    category,
    priority: 0,
    directive: "template",
  });

  it("allows allocations that stay within one source", () => {
    expect(validatePercentageAllocation([pct(60, "all-income"), pct(40, "all-income")])).toBeNull();
  });

  it("flags more than 100% of one source", () => {
    expect(validatePercentageAllocation([pct(60, "all-income"), pct(50, "all-income")])).toEqual({
      kind: "percent-over-100",
      total: 110,
    });
  });

  it("totals each source separately", () => {
    expect(validatePercentageAllocation([pct(80, "all-income"), pct(80, "salary")])).toBeNull();
  });

  it("treats this month's and last month's income as different sources", () => {
    expect(
      validatePercentageAllocation([pct(80, "all-income"), pct(80, "all-income", true)]),
    ).toBeNull();
  });
});

describe("validateSchedulePriorities", () => {
  it("accepts schedules and by-dates that share a priority", () => {
    const templates: Template[] = [
      { type: "schedule", name: "A", priority: 1, directive: "template" },
      { type: "by", amount: 5, month: "2027-01", priority: 1, directive: "template" },
    ];
    expect(validateSchedulePriorities(templates)).toBeNull();
  });

  it("flags a priority mismatch — the engine would budget none of them", () => {
    const templates: Template[] = [
      { type: "schedule", name: "A", priority: 0, directive: "template" },
      { type: "by", amount: 5, month: "2027-01", priority: 1, directive: "template" },
    ];
    expect(validateSchedulePriorities(templates)).toEqual({ kind: "schedule-priority-mismatch" });
  });

  it("ignores other template types", () => {
    const templates: Template[] = [
      { type: "average", numMonths: 3, priority: 0, directive: "template" },
      { type: "copy", lookBack: 2, priority: 1, directive: "template" },
    ];
    expect(validateSchedulePriorities(templates)).toBeNull();
  });
});
