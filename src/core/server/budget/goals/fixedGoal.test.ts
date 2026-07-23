import { describe, it, expect } from "vitest";
import {
  allowedCustomModes,
  dayOfMonthOf,
  fixedConfigFromTemplate,
  isFixedTemplate,
  monthOf,
  nextDateForDayOfMonth,
  nextDateForWeekday,
  nextYearMonth,
  normalizeCustomConfig,
  templateFromFixedConfig,
  weekdayOf,
} from "./fixedGoal";
import type { ByTemplate, PeriodicTemplate, SimpleTemplate, Template } from "@/core/types/models";

describe("date helpers", () => {
  const FROM = new Date(2026, 6, 17); // Friday 2026-07-17

  it("finds the next date for a weekday, today included", () => {
    expect(nextDateForWeekday(5, FROM)).toBe("2026-07-17"); // Friday → today
    expect(nextDateForWeekday(6, FROM)).toBe("2026-07-18"); // Saturday
    expect(nextDateForWeekday(1, FROM)).toBe("2026-07-20"); // Monday
    expect(weekdayOf(nextDateForWeekday(3, FROM))).toBe(3);
  });

  it("finds the next date for a day of month, today included", () => {
    expect(nextDateForDayOfMonth(17, FROM)).toBe("2026-07-17");
    expect(nextDateForDayOfMonth(25, FROM)).toBe("2026-07-25");
    expect(nextDateForDayOfMonth(5, FROM)).toBe("2026-08-05"); // passed this month
  });

  it("skips months too short for the chosen day", () => {
    const fromJan30 = new Date(2026, 0, 30);
    expect(nextDateForDayOfMonth(31, fromJan30)).toBe("2026-01-31");
    const fromFeb1 = new Date(2026, 1, 1);
    expect(nextDateForDayOfMonth(31, fromFeb1)).toBe("2026-03-31"); // Feb has no 31st
  });

  it("finds the next occurrence of a month of the year", () => {
    expect(nextYearMonth(7, FROM)).toBe("2026-07"); // this month counts
    expect(nextYearMonth(12, FROM)).toBe("2026-12");
    expect(nextYearMonth(3, FROM)).toBe("2027-03"); // passed → next year
    expect(monthOf(nextYearMonth(3, FROM))).toBe(3);
  });

  it("reads day parts back from stored strings", () => {
    expect(weekdayOf("2026-07-18")).toBe(6);
    expect(dayOfMonthOf("2026-07-18")).toBe(18);
    expect(weekdayOf(undefined)).toBeNull();
    expect(monthOf("2026-13")).toBeNull();
  });
});

describe("isFixedTemplate", () => {
  it("owns periodic, simple, and plain-annual by templates", () => {
    expect(
      isFixedTemplate({ type: "simple", monthly: 5, priority: 0, directive: "template" }),
    ).toBe(true);
    expect(
      isFixedTemplate({
        type: "by",
        amount: 5,
        month: "2027-03",
        annual: true,
        repeat: 1,
        priority: 0,
        directive: "template",
      }),
    ).toBe(true);
  });

  it("owns one-shot and every-N-months by templates too — they are Custom", () => {
    const oneShot: Template = {
      type: "by",
      amount: 5,
      month: "2027-03",
      priority: 0,
      directive: "template",
    };
    const everySix: Template = { ...oneShot, repeat: 6 } as Template;
    expect(isFixedTemplate(oneShot)).toBe(true);
    expect(isFixedTemplate(everySix)).toBe(true);
  });

  it("owns spending windows too — Custom's spend mode", () => {
    const spend: Template = {
      type: "spend",
      amount: 5,
      month: "2027-03",
      from: "2026-12",
      priority: 0,
      directive: "template",
    };
    expect(isFixedTemplate(spend)).toBe(true);
  });
});

describe("fixedConfigFromTemplate", () => {
  it("reads a weekly set-aside, taking the weekday from the starting date", () => {
    const t: PeriodicTemplate = {
      type: "periodic",
      amount: 50,
      period: { period: "week", amount: 1 },
      starting: "2026-07-18", // Saturday
      priority: 0,
      directive: "template",
    };
    expect(fixedConfigFromTemplate(t)).toEqual({
      segment: "weekly",
      mode: "setAside",
      amountCents: 5000,
      weekday: 6,
    });
  });

  it("reads a weekly refill from a simple template with a weekly limit", () => {
    const t: SimpleTemplate = {
      type: "simple",
      limit: { amount: 120, hold: false, period: "weekly", start: "2026-07-20" }, // Monday
      priority: 0,
      directive: "template",
    };
    expect(fixedConfigFromTemplate(t)).toEqual({
      segment: "weekly",
      mode: "refill",
      amountCents: 12000,
      weekday: 1,
    });
  });

  it("reads a monthly set-aside, taking the day from the starting date", () => {
    const t: PeriodicTemplate = {
      type: "periodic",
      amount: 1200,
      period: { period: "month", amount: 1 },
      starting: "2026-06-15",
      priority: 0,
      directive: "template",
    };
    expect(fixedConfigFromTemplate(t)).toEqual({
      segment: "monthly",
      mode: "setAside",
      amountCents: 120000,
      dayOfMonth: 15,
    });
  });

  it("reads a monthly refill from a simple template with a monthly limit", () => {
    const t: SimpleTemplate = {
      type: "simple",
      limit: { amount: 1080, hold: true, period: "monthly" },
      priority: 0,
      directive: "template",
    };
    expect(fixedConfigFromTemplate(t)).toMatchObject({
      segment: "monthly",
      mode: "refill",
      amountCents: 108000,
    });
  });

  it("reads an annual by-date as a yearly refill, day collapsing to the 1st", () => {
    const t: ByTemplate = {
      type: "by",
      amount: 600,
      month: "2027-03",
      annual: true,
      repeat: 1,
      priority: 0,
      directive: "template",
    };
    expect(fixedConfigFromTemplate(t)).toEqual({
      segment: "yearly",
      mode: "refill",
      amountCents: 60000,
      date: "2027-03-01",
    });
  });

  it("reads a yearly periodic as a yearly set-aside keeping the exact date", () => {
    const t: PeriodicTemplate = {
      type: "periodic",
      amount: 600,
      period: { period: "year", amount: 1 },
      starting: "2027-03-15",
      priority: 0,
      directive: "template",
    };
    expect(fixedConfigFromTemplate(t)).toEqual({
      segment: "yearly",
      mode: "setAside",
      amountCents: 60000,
      date: "2027-03-15",
    });
  });

  it("reads a legacy plain simple template as a monthly set-aside", () => {
    const t: SimpleTemplate = { type: "simple", monthly: 75, priority: 0, directive: "template" };
    expect(fixedConfigFromTemplate(t)).toMatchObject({
      segment: "monthly",
      mode: "setAside",
      amountCents: 7500,
    });
  });

  it("keeps reading a preset-shaped template as custom when asked", () => {
    // "Every 1 month" IS the Monthly preset's template — the editor has to be
    // able to stay in Custom while the user dials an interval down to 1.
    const monthly: PeriodicTemplate = {
      type: "periodic",
      amount: 50,
      period: { period: "month", amount: 1 },
      starting: "2026-09-07",
      priority: 0,
      directive: "template",
    };
    expect(fixedConfigFromTemplate(monthly).segment).toBe("monthly");
    expect(fixedConfigFromTemplate(monthly, true)).toEqual({
      segment: "custom",
      mode: "setAside",
      amountCents: 5000,
      dueDate: "2026-09-07",
      repeat: { unit: "month", interval: 1 },
    });

    const annual: ByTemplate = {
      type: "by",
      amount: 600,
      month: "2027-03",
      annual: true,
      repeat: 1,
      priority: 0,
      directive: "template",
    };
    expect(fixedConfigFromTemplate(annual).segment).toBe("yearly");
    expect(fixedConfigFromTemplate(annual, true)).toMatchObject({
      segment: "custom",
      mode: "refill",
      repeat: { unit: "year", interval: 1 },
    });
  });

  it("reads an off-preset cadence as a custom set-aside with its repeat", () => {
    const t: PeriodicTemplate = {
      type: "periodic",
      amount: 10,
      period: { period: "week", amount: 2 },
      starting: "2026-08-03",
      priority: 0,
      directive: "template",
    };
    expect(fixedConfigFromTemplate(t)).toEqual({
      segment: "custom",
      mode: "setAside",
      amountCents: 1000,
      dueDate: "2026-08-03",
      repeat: { unit: "week", interval: 2 },
    });
  });

  it("reads a one-shot by-date as a custom refill with no repeat", () => {
    const t: ByTemplate = {
      type: "by",
      amount: 1000,
      month: "2027-05",
      priority: 0,
      directive: "template",
    };
    expect(fixedConfigFromTemplate(t)).toEqual({
      segment: "custom",
      mode: "refill",
      amountCents: 100000,
      dueDate: "2027-05-01",
      repeat: null,
    });
  });

  it("reads an every-N-months by-date as a custom refill repeating in months", () => {
    const t: ByTemplate = {
      type: "by",
      amount: 300,
      month: "2027-05",
      repeat: 6,
      priority: 0,
      directive: "template",
    };
    expect(fixedConfigFromTemplate(t)).toMatchObject({
      segment: "custom",
      mode: "refill",
      repeat: { unit: "month", interval: 6 },
    });
  });

  it("reads a multi-year by-date as a custom refill repeating in years", () => {
    const t: ByTemplate = {
      type: "by",
      amount: 300,
      month: "2028-05",
      annual: true,
      repeat: 2,
      priority: 0,
      directive: "template",
    };
    expect(fixedConfigFromTemplate(t)).toMatchObject({
      segment: "custom",
      mode: "refill",
      repeat: { unit: "year", interval: 2 },
    });
  });
});

describe("allowedCustomModes / normalizeCustomConfig", () => {
  const base = { segment: "custom", amountCents: 5000, dueDate: "2027-05-10" } as const;

  it("offers refill and spend for a one-shot target — both work toward a date", () => {
    expect(allowedCustomModes(null)).toEqual(["refill", "spend"]);
    expect(normalizeCustomConfig({ ...base, mode: "setAside", repeat: null }).mode).toBe("refill");
    expect(normalizeCustomConfig({ ...base, mode: "spend", repeat: null }).mode).toBe("spend");
  });

  it("offers only set-aside for daily and weekly repeats — by has no such cadence", () => {
    expect(allowedCustomModes({ unit: "day", interval: 3 })).toEqual(["setAside"]);
    expect(allowedCustomModes({ unit: "week", interval: 2 })).toEqual(["setAside"]);
    expect(
      normalizeCustomConfig({ ...base, mode: "refill", repeat: { unit: "week", interval: 2 } })
        .mode,
    ).toBe("setAside");
  });

  it("offers all three for month and year repeats", () => {
    expect(allowedCustomModes({ unit: "month", interval: 3 })).toEqual([
      "setAside",
      "refill",
      "spend",
    ]);
    expect(allowedCustomModes({ unit: "year", interval: 2 })).toEqual([
      "setAside",
      "refill",
      "spend",
    ]);
    expect(
      normalizeCustomConfig({ ...base, mode: "refill", repeat: { unit: "month", interval: 3 } })
        .mode,
    ).toBe("refill");
  });

  it("clamps the interval to its unit's range", () => {
    expect(
      normalizeCustomConfig({ ...base, mode: "setAside", repeat: { unit: "day", interval: 99 } })
        .repeat,
    ).toEqual({ unit: "day", interval: 30 });
    expect(
      normalizeCustomConfig({ ...base, mode: "setAside", repeat: { unit: "year", interval: 5 } })
        .repeat,
    ).toEqual({ unit: "year", interval: 2 });
    expect(
      normalizeCustomConfig({ ...base, mode: "setAside", repeat: { unit: "month", interval: 0 } })
        .repeat,
    ).toEqual({ unit: "month", interval: 1 });
  });
});

describe("templateFromFixedConfig", () => {
  const prev: Template = {
    type: "periodic",
    amount: 1,
    period: { period: "month", amount: 1 },
    priority: 4,
    directive: "template",
  };

  it("writes a weekly set-aside whose starting date lands on the weekday", () => {
    const t = templateFromFixedConfig(
      { segment: "weekly", mode: "setAside", amountCents: 5000, weekday: 6 },
      prev,
    );
    expect(t).toMatchObject({
      type: "periodic",
      amount: 50,
      period: { period: "week", amount: 1 },
      priority: 4,
    });
    expect(weekdayOf((t as PeriodicTemplate).starting)).toBe(6);
  });

  it("writes a weekly refill as a simple template with a weekly limit", () => {
    const t = templateFromFixedConfig(
      { segment: "weekly", mode: "refill", amountCents: 12000, weekday: 1 },
      prev,
    );
    expect(t).toMatchObject({
      type: "simple",
      limit: { amount: 120, period: "weekly", hold: false },
      priority: 4,
    });
    expect(weekdayOf((t as SimpleTemplate).limit?.start)).toBe(1);
  });

  it("writes a monthly refill without a start date — the engine has no day there", () => {
    const t = templateFromFixedConfig(
      { segment: "monthly", mode: "refill", amountCents: 108000, dayOfMonth: 10 },
      prev,
    );
    expect(t).toMatchObject({ type: "simple", limit: { amount: 1080, period: "monthly" } });
    expect((t as SimpleTemplate).limit?.start).toBeUndefined();
  });

  it("writes a yearly refill as an annual by-date on the chosen month", () => {
    const t = templateFromFixedConfig(
      { segment: "yearly", mode: "refill", amountCents: 60000, date: "2027-03-15" },
      prev,
    );
    expect(t).toMatchObject({
      type: "by",
      amount: 600,
      month: "2027-03",
      annual: true,
      repeat: 1,
      priority: 4,
    });
  });

  it("writes a yearly set-aside as a yearly periodic keeping the exact date", () => {
    const t = templateFromFixedConfig(
      { segment: "yearly", mode: "setAside", amountCents: 60000, date: "2027-03-15" },
      prev,
    );
    expect(t).toMatchObject({
      type: "periodic",
      amount: 600,
      period: { period: "year", amount: 1 },
      starting: "2027-03-15",
      priority: 4,
    });
  });

  it("writes a custom one-shot refill as a plain by-date", () => {
    const t = templateFromFixedConfig(
      {
        segment: "custom",
        mode: "refill",
        amountCents: 100000,
        dueDate: "2027-05-20",
        repeat: null,
      },
      prev,
    );
    expect(t).toMatchObject({ type: "by", amount: 1000, month: "2027-05", priority: 4 });
    expect(t).not.toHaveProperty("repeat");
    expect(t).not.toHaveProperty("annual");
  });

  it("writes a custom weekly set-aside as a periodic keeping the due date", () => {
    const t = templateFromFixedConfig(
      {
        segment: "custom",
        mode: "setAside",
        amountCents: 5000,
        dueDate: "2026-08-03",
        repeat: { unit: "week", interval: 2 },
      },
      prev,
    );
    expect(t).toMatchObject({
      type: "periodic",
      amount: 50,
      period: { period: "week", amount: 2 },
      starting: "2026-08-03",
    });
  });

  it("writes a custom monthly refill as a repeating by-date", () => {
    const t = templateFromFixedConfig(
      {
        segment: "custom",
        mode: "refill",
        amountCents: 30000,
        dueDate: "2027-05-01",
        repeat: { unit: "month", interval: 6 },
      },
      prev,
    );
    expect(t).toMatchObject({ type: "by", month: "2027-05", repeat: 6 });
    expect(t).not.toHaveProperty("annual");
  });

  it("writes a custom multi-year refill as an annual by-date", () => {
    const t = templateFromFixedConfig(
      {
        segment: "custom",
        mode: "refill",
        amountCents: 30000,
        dueDate: "2028-05-01",
        repeat: { unit: "year", interval: 2 },
      },
      prev,
    );
    expect(t).toMatchObject({ type: "by", month: "2028-05", annual: true, repeat: 2 });
  });

  it("round-trips every editable combination", () => {
    const configs = [
      { segment: "weekly", mode: "setAside", amountCents: 2500, weekday: 3 },
      { segment: "weekly", mode: "refill", amountCents: 2500, weekday: 0 },
      { segment: "monthly", mode: "setAside", amountCents: 99900, dayOfMonth: 28 },
      { segment: "monthly", mode: "refill", amountCents: 99900, dayOfMonth: 1 },
      { segment: "yearly", mode: "setAside", amountCents: 120000, date: "2027-12-24" },
      { segment: "yearly", mode: "refill", amountCents: 120000, date: "2027-12-01" },
      {
        segment: "custom",
        mode: "refill",
        amountCents: 45000,
        dueDate: "2027-05-01",
        repeat: null,
      },
      {
        segment: "custom",
        mode: "setAside",
        amountCents: 45000,
        dueDate: "2026-09-07",
        repeat: { unit: "day", interval: 10 },
      },
      {
        segment: "custom",
        mode: "setAside",
        amountCents: 45000,
        dueDate: "2026-09-07",
        repeat: { unit: "week", interval: 3 },
      },
      {
        segment: "custom",
        mode: "refill",
        amountCents: 45000,
        dueDate: "2027-05-01",
        repeat: { unit: "month", interval: 4 },
      },
      {
        segment: "custom",
        mode: "refill",
        amountCents: 45000,
        dueDate: "2028-05-01",
        repeat: { unit: "year", interval: 2 },
      },
      {
        segment: "custom",
        mode: "spend",
        amountCents: 45000,
        dueDate: "2027-05-01",
        from: "2026-09-01",
        repeat: null,
      },
      {
        segment: "custom",
        mode: "spend",
        amountCents: 45000,
        dueDate: "2027-05-01",
        from: "2026-09-01",
        repeat: { unit: "month", interval: 6 },
      },
    ] as const;

    for (const config of configs) {
      const template = templateFromFixedConfig(config, prev);
      const back = fixedConfigFromTemplate(
        template as PeriodicTemplate | SimpleTemplate | ByTemplate,
      );
      if (config.segment === "monthly" && config.mode === "refill") {
        // The day never persists for a monthly refill; everything else must.
        expect(back).toMatchObject({
          segment: "monthly",
          mode: "refill",
          amountCents: config.amountCents,
        });
      } else {
        expect(back).toEqual(config);
      }
    }
  });
});
