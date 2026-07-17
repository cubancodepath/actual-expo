import { describe, it, expect } from "vitest";
import {
  amountCentsOf,
  applySegment,
  createDefaultTemplate,
  entriesToTemplates,
  hydrateScheduleTemplate,
  retypeTemplate,
  segmentFromTemplate,
  templatesToEntries,
  toDisplayType,
  toPeriodic,
  withAmountCents,
} from "./automations";
import type { PeriodicTemplate, Template } from "./types";

describe("toDisplayType", () => {
  it("groups the raw types onto the nine editor types", () => {
    const cases: [Template["type"], string][] = [
      ["simple", "fixed"],
      ["periodic", "fixed"],
      ["average", "historical"],
      ["copy", "historical"],
      // Every date-targeted shape belongs to the fixed editor: by-dates are
      // Yearly/Custom refill, spending windows are Custom's spend mode.
      ["by", "fixed"],
      ["spend", "fixed"],
      ["percentage", "percentage"],
      ["schedule", "schedule"],
      ["remainder", "remainder"],
      ["limit", "limit"],
      ["refill", "refill"],
      ["goal", "goal"],
    ];
    for (const [type, expected] of cases) {
      expect(toDisplayType({ type } as Template)).toBe(expected);
    }
  });
});

describe("templatesToEntries", () => {
  it("canonicalizes a legacy simple monthly template to a fixed periodic entry", () => {
    const entries = templatesToEntries([
      { type: "simple", monthly: 50, priority: 0, directive: "template" },
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0].displayType).toBe("fixed");
    expect(entries[0].template).toMatchObject({
      type: "periodic",
      amount: 50,
      period: { period: "month", amount: 1 },
    });
  });

  it("splits a simple template with a limit into a limit entry and a fixed entry", () => {
    const entries = templatesToEntries([
      {
        type: "simple",
        monthly: 50,
        limit: { amount: 300, hold: true, period: "monthly" },
        priority: 0,
        directive: "template",
      },
    ]);
    expect(entries.map((e) => e.displayType)).toEqual(["limit", "fixed"]);
    expect(entries[0].template).toMatchObject({ type: "limit", amount: 300, hold: true });
    expect(entries[1].template).toMatchObject({ type: "periodic", amount: 50 });
  });

  it("fuses a desktop limit + refill pair into one fixed entry", () => {
    // The engine runs both forms with the same expression, so showing two
    // rows would be telling one goal twice.
    const entries = templatesToEntries([
      { type: "limit", amount: 1080, hold: true, period: "monthly", directive: "template" },
      { type: "refill", priority: 2, directive: "template" },
    ]);
    expect(entries.map((e) => e.displayType)).toEqual(["fixed"]);
    expect(entries[0].template).toEqual({
      type: "simple",
      limit: { amount: 1080, hold: true, period: "monthly", start: undefined },
      priority: 2,
      directive: "template",
    });
  });

  it("fuses the pair whatever order it comes in, keeping the other goals", () => {
    const entries = templatesToEntries([
      { type: "refill", priority: 0, directive: "template" },
      { type: "average", numMonths: 3, priority: 1, directive: "template" },
      {
        type: "limit",
        amount: 50,
        hold: false,
        period: "weekly",
        start: "2026-07-18",
        directive: "template",
      },
    ]);
    expect(entries.map((e) => e.displayType)).toEqual(["fixed", "historical"]);
    expect(entries[0].template).toMatchObject({
      type: "simple",
      limit: { amount: 50, period: "weekly", start: "2026-07-18" },
    });
  });

  it("leaves a refill with no cap alone — there's nothing to fuse it with", () => {
    const entries = templatesToEntries([{ type: "refill", priority: 0, directive: "template" }]);
    expect(entries.map((e) => e.displayType)).toEqual(["refill"]);
  });

  it("leaves a cap that caps another goal as its own entry", () => {
    // No refill here: the limit caps the contribution, it isn't a goal itself.
    const entries = templatesToEntries([
      {
        type: "simple",
        monthly: 50,
        limit: { amount: 300, hold: false, period: "monthly" },
        priority: 0,
        directive: "template",
      },
    ]);
    expect(entries.map((e) => e.displayType)).toEqual(["limit", "fixed"]);
  });

  it("keeps a limit-only simple template ('refill up to') as one fixed entry", () => {
    const stored: Template = {
      type: "simple",
      limit: { amount: 150, hold: false, period: "monthly" },
      priority: 3,
      directive: "template",
    };
    const entries = templatesToEntries([stored]);
    expect(entries.map((e) => e.displayType)).toEqual(["fixed"]);
    expect(entries[0].template).toBe(stored);
  });

  it("lifts a limit off a periodic template into its own entry", () => {
    const entries = templatesToEntries([
      {
        type: "periodic",
        amount: 10,
        period: { period: "week", amount: 1 },
        limit: { amount: 400, hold: false, period: "monthly" },
        priority: 0,
        directive: "template",
      },
    ]);
    expect(entries.map((e) => e.displayType)).toEqual(["fixed", "limit"]);
    expect(entries[0].template).not.toHaveProperty("limit");
    expect(entries[1].template).toMatchObject({ type: "limit", amount: 400 });
  });

  it("drops a simple template that budgets nothing rather than showing an empty row", () => {
    expect(templatesToEntries([{ type: "simple", priority: 0, directive: "template" }])).toEqual(
      [],
    );
  });

  it("keeps a zero-amount simple template with no limit as an editable fixed entry", () => {
    const entries = templatesToEntries([
      { type: "simple", monthly: 0, priority: 0, directive: "template" },
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0].template).toMatchObject({ type: "periodic", amount: 0 });
  });

  it("hydrates a schedule template's id from its name", () => {
    const entries = templatesToEntries(
      [{ type: "schedule", name: "Internet", priority: 0, directive: "template" }],
      [{ id: "sched-1", name: "Internet" }],
    );
    expect(entries[0].template).toMatchObject({ scheduleId: "sched-1", name: "Internet" });
  });

  it("gives every entry a distinct id", () => {
    const entries = templatesToEntries([
      { type: "remainder", weight: 1, directive: "template" },
      { type: "goal", amount: 500, directive: "goal" },
    ]);
    expect(new Set(entries.map((e) => e.id)).size).toBe(2);
  });
});

describe("hydrateScheduleTemplate", () => {
  it("refreshes a stale name from the schedule id", () => {
    const result = hydrateScheduleTemplate(
      { type: "schedule", scheduleId: "s1", name: "Old name", priority: 0, directive: "template" },
      [{ id: "s1", name: "New name" }],
    );
    expect(result.name).toBe("New name");
  });

  it("leaves the template alone when the schedule is gone", () => {
    const template = {
      type: "schedule" as const,
      name: "Deleted",
      priority: 0,
      directive: "template" as const,
    };
    expect(hydrateScheduleTemplate(template, [])).toBe(template);
  });
});

describe("entriesToTemplates", () => {
  it("assigns priority from list order, skipping types that have none", () => {
    const entries = templatesToEntries([
      {
        type: "periodic",
        amount: 1,
        period: { period: "month", amount: 1 },
        priority: 9,
        directive: "template",
      },
      { type: "limit", amount: 100, hold: false, period: "monthly", directive: "template" },
      { type: "average", numMonths: 3, priority: 9, directive: "template" },
    ]);

    const templates = entriesToTemplates(entries);
    expect(templates[0]).toMatchObject({ type: "periodic", priority: 0 });
    expect(templates[1]).toMatchObject({ type: "limit" });
    expect(templates[1]).not.toHaveProperty("priority");
    expect(templates[2]).toMatchObject({ type: "average", priority: 1 });
  });

  it("pins schedule and by templates to a shared priority so the engine budgets them", () => {
    const entries = templatesToEntries([
      { type: "schedule", name: "Rent", priority: 0, directive: "template" },
      { type: "average", numMonths: 3, priority: 0, directive: "template" },
      { type: "by", amount: 500, month: "2027-01", priority: 0, directive: "template" },
    ]);

    const templates = entriesToTemplates(entries);
    const schedule = templates.find((t) => t.type === "schedule");
    const by = templates.find((t) => t.type === "by");
    expect(schedule).toMatchObject({ priority: 0 });
    expect(by).toMatchObject({ priority: 0 });
    // the average keeps its own list-order priority
    expect(templates.find((t) => t.type === "average")).toMatchObject({ priority: 1 });
  });

  it("round-trips a desktop-authored stack without changing its shape", () => {
    const stored: Template[] = [
      {
        type: "periodic",
        amount: 25,
        period: { period: "week", amount: 1 },
        priority: 0,
        directive: "template",
      },
      { type: "limit", amount: 200, hold: false, period: "monthly", directive: "template" },
      { type: "goal", amount: 1000, directive: "goal" },
    ];
    const result = entriesToTemplates(templatesToEntries(stored));
    expect(result).toEqual(stored);
  });
});

describe("segmentFromTemplate", () => {
  const periodic = (
    period: "day" | "week" | "month" | "year",
    amount: number,
  ): PeriodicTemplate => ({
    type: "periodic",
    amount: 10,
    period: { period, amount },
    priority: 0,
    directive: "template",
  });

  it("maps the three presets", () => {
    expect(segmentFromTemplate(periodic("week", 1))).toBe("weekly");
    expect(segmentFromTemplate(periodic("month", 1))).toBe("monthly");
    expect(segmentFromTemplate(periodic("year", 1))).toBe("yearly");
  });

  it("treats a multi-interval or daily cadence as custom", () => {
    expect(segmentFromTemplate(periodic("month", 2))).toBe("custom");
    expect(segmentFromTemplate(periodic("day", 1))).toBe("custom");
  });

  it("reads a legacy simple template as monthly", () => {
    expect(
      segmentFromTemplate({ type: "simple", monthly: 50, priority: 0, directive: "template" }),
    ).toBe("monthly");
  });

  it("returns null for templates that have no cadence", () => {
    expect(segmentFromTemplate({ type: "goal", amount: 5, directive: "goal" })).toBeNull();
  });
});

describe("applySegment", () => {
  const base: PeriodicTemplate = {
    type: "periodic",
    amount: 10,
    period: { period: "month", amount: 1 },
    priority: 0,
    directive: "template",
  };

  it("sets the period for each preset and keeps the amount", () => {
    expect(applySegment(base, "weekly").period).toEqual({ period: "week", amount: 1 });
    expect(applySegment(base, "yearly").period).toEqual({ period: "year", amount: 1 });
    expect(applySegment(base, "weekly").amount).toBe(10);
  });

  it("leaves the period untouched for custom so the editor starts where the user was", () => {
    expect(applySegment(base, "custom")).toBe(base);
  });
});

describe("toPeriodic", () => {
  it("converts a simple template, carrying the amount and limit over", () => {
    const result = toPeriodic({
      type: "simple",
      monthly: 75,
      limit: { amount: 300, hold: false, period: "monthly" },
      priority: 2,
      directive: "template",
    });
    expect(result).toMatchObject({
      type: "periodic",
      amount: 75,
      period: { period: "month", amount: 1 },
      limit: { amount: 300 },
      priority: 2,
    });
  });

  it("passes a periodic template through untouched", () => {
    const t: PeriodicTemplate = {
      type: "periodic",
      amount: 5,
      period: { period: "day", amount: 3 },
      priority: 0,
      directive: "template",
    };
    expect(toPeriodic(t)).toBe(t);
  });
});

describe("createDefaultTemplate", () => {
  it("starts amounts at zero so the keypad opens empty", () => {
    expect(createDefaultTemplate("fixed")).toMatchObject({ type: "periodic", amount: 0 });
    expect(createDefaultTemplate("goal")).toMatchObject({ type: "goal", amount: 0 });
    expect(createDefaultTemplate("limit")).toMatchObject({ type: "limit", amount: 0 });
  });

  it("produces a template whose display type matches what was asked for", () => {
    for (const type of [
      "fixed",
      "schedule",
      "percentage",
      "historical",
      "limit",
      "refill",
      "remainder",
      "goal",
    ] as const) {
      expect(toDisplayType(createDefaultTemplate(type))).toBe(type);
    }
  });
});

describe("amountCentsOf / withAmountCents", () => {
  it("converts between the stored display units and the keypad's cents", () => {
    const t: Template = {
      type: "periodic",
      amount: 12.5,
      period: { period: "month", amount: 1 },
      priority: 0,
      directive: "template",
    };
    expect(amountCentsOf(t)).toBe(1250);
    expect(withAmountCents(t, 999)).toMatchObject({ amount: 9.99 });
  });

  it("reports no amount for the types whose amount is derived elsewhere", () => {
    expect(amountCentsOf({ type: "remainder", weight: 1, directive: "template" })).toBeNull();
    expect(
      amountCentsOf({ type: "schedule", name: "X", priority: 0, directive: "template" }),
    ).toBeNull();
    expect(
      amountCentsOf({ type: "average", numMonths: 3, priority: 0, directive: "template" }),
    ).toBeNull();
  });

  it("leaves a template without an amount untouched", () => {
    const t: Template = { type: "remainder", weight: 2, directive: "template" };
    expect(withAmountCents(t, 500)).toBe(t);
  });
});

describe("retypeTemplate", () => {
  const by: Template = {
    type: "by",
    amount: 500,
    month: "2027-01",
    priority: 0,
    directive: "template",
  };

  it("carries the amount over when both types have one", () => {
    expect(retypeTemplate(by, "fixed")).toMatchObject({ type: "periodic", amount: 500 });
    expect(retypeTemplate(by, "goal")).toMatchObject({ type: "goal", amount: 500 });
  });

  it("falls back to a blank template when the new type has no amount", () => {
    expect(retypeTemplate(by, "remainder")).toMatchObject({ type: "remainder", weight: 1 });
  });

  it("does not invent an amount when the old type had none", () => {
    const remainder: Template = { type: "remainder", weight: 3, directive: "template" };
    expect(retypeTemplate(remainder, "fixed")).toMatchObject({ type: "periodic", amount: 0 });
  });
});
