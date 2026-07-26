import { describe, it, expect } from "vitest";
import en from "@/i18n/locales/en/budget.json";
import { describeTemplateShort } from "./describeShort";
import type {
  SimpleTemplate,
  GoalTemplate,
  ByTemplate,
  AverageTemplate,
  CopyTemplate,
  PeriodicTemplate,
  SpendTemplate,
  PercentageTemplate,
  RemainderTemplate,
  RefillTemplate,
  LimitTemplate,
  ScheduleTemplate,
  Template,
} from "@/core/types/models";

/**
 * Resolves against the real `budget.json` rather than a hand-written map, so a
 * template reaching for a key nobody wrote fails here instead of rendering the
 * raw key in the row. Returns the key on a miss, exactly as i18next would.
 */
function t(key: string, params?: Record<string, unknown>): string {
  const path = key.replace(/^budget:/, "").split(".");
  let node: unknown = en;
  for (const part of path) {
    node = (node as Record<string, unknown>)?.[part];
  }
  if (typeof node !== "string") return key;

  let out = node;
  for (const [k, v] of Object.entries(params ?? {})) {
    out = out.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), String(v));
  }
  return out;
}

const short = (tmpl: Template) => describeTemplateShort(tmpl, t, "en");

describe("describeTemplateShort", () => {
  it("simple monthly says only the cadence — the amount is the line above", () => {
    const tmpl: SimpleTemplate = {
      type: "simple",
      monthly: 200,
      priority: 0,
      directive: "template",
    };
    expect(short(tmpl)).toBe("monthly");
  });

  // Keeps its noun on purpose: a bare "weekly" would read as a plain weekly
  // contribution, and a refill is not that.
  it("simple with a cap and no contribution is a refill, with its cadence", () => {
    const tmpl: SimpleTemplate = {
      type: "simple",
      limit: { amount: 80, hold: false, period: "weekly" },
      priority: 0,
      directive: "template",
    };
    expect(short(tmpl)).toBe("refill weekly");
  });

  it("goal", () => {
    const tmpl: GoalTemplate = { type: "goal", amount: 5000, directive: "goal" };
    expect(short(tmpl)).toBe("balance target");
  });

  it("by", () => {
    const tmpl: ByTemplate = {
      type: "by",
      amount: 1200,
      month: "2026-12",
      priority: 0,
      directive: "template",
    };
    expect(short(tmpl)).toBe("by Dec 2026");
  });

  it("by, repeating annually", () => {
    const tmpl: ByTemplate = {
      type: "by",
      amount: 600,
      month: "2026-06",
      annual: true,
      repeat: 1,
      priority: 0,
      directive: "template",
    };
    expect(short(tmpl)).toBe("by Jun 2026, yearly");
  });

  it("by, repeating every N months", () => {
    const tmpl: ByTemplate = {
      type: "by",
      amount: 300,
      month: "2026-09",
      repeat: 3,
      priority: 0,
      directive: "template",
    };
    expect(short(tmpl)).toBe("by Sep 2026, every 3m");
  });

  it("spend reads like `by` — it has no recurrence to report", () => {
    const tmpl: SpendTemplate = {
      type: "spend",
      amount: 600,
      month: "2026-06",
      from: "2026-01",
      priority: 0,
      directive: "template",
    };
    expect(short(tmpl)).toBe("by Jun 2026");
  });

  it("percentage keeps the percent — it is the shape, not the amount", () => {
    const tmpl: PercentageTemplate = {
      type: "percentage",
      percent: 20,
      previous: false,
      category: "all-income",
      priority: 0,
      directive: "template",
    };
    expect(short(tmpl)).toBe("20% of income");
  });

  it("average", () => {
    const tmpl: AverageTemplate = {
      type: "average",
      numMonths: 3,
      priority: 0,
      directive: "template",
    };
    expect(short(tmpl)).toBe("avg. 3 months");
  });

  it("copy", () => {
    const tmpl: CopyTemplate = { type: "copy", lookBack: 2, priority: 0, directive: "template" };
    expect(short(tmpl)).toBe("copy 2m ago");
  });

  it("periodic every single period collapses to the adverb", () => {
    const tmpl: PeriodicTemplate = {
      type: "periodic",
      amount: 100,
      period: { period: "week", amount: 1 },
      priority: 0,
      directive: "template",
    };
    expect(short(tmpl)).toBe("weekly");
  });

  it("periodic yearly", () => {
    const tmpl: PeriodicTemplate = {
      type: "periodic",
      amount: 900,
      period: { period: "year", amount: 1 },
      priority: 0,
      directive: "template",
    };
    expect(short(tmpl)).toBe("yearly");
  });

  it("periodic every N spells it out, and pluralises", () => {
    const tmpl: PeriodicTemplate = {
      type: "periodic",
      amount: 100,
      period: { period: "week", amount: 2 },
      priority: 0,
      directive: "template",
    };
    expect(short(tmpl)).toBe("every 2 weeks");
  });

  it("remainder", () => {
    const tmpl: RemainderTemplate = { type: "remainder", weight: 1, directive: "template" };
    expect(short(tmpl)).toBe("remaining budget");
  });

  it("refill", () => {
    const tmpl: RefillTemplate = { type: "refill", priority: 0, directive: "template" };
    expect(short(tmpl)).toBe("refill to limit");
  });

  // Also keeps its noun: a limit is a ceiling on spending, the opposite of a
  // bare "monthly", which reads as money going in.
  it("limit", () => {
    const tmpl: LimitTemplate = {
      type: "limit",
      amount: 400,
      hold: false,
      period: "monthly",
      directive: "template",
    };
    expect(short(tmpl)).toBe("monthly limit");
  });

  it("daily limit", () => {
    const tmpl: LimitTemplate = {
      type: "limit",
      amount: 25,
      hold: false,
      period: "daily",
      directive: "template",
    };
    expect(short(tmpl)).toBe("daily limit");
  });

  it("schedule", () => {
    const tmpl: ScheduleTemplate = {
      type: "schedule",
      name: "Rent",
      priority: 0,
      directive: "template",
    };
    expect(short(tmpl)).toBe("scheduled");
  });

  // The contract of this module in one test: the row shows the goal figure
  // right above this line, so echoing it here would burn the only space there
  // is. Each case pairs a template with an amount that must not surface.
  it.each([
    [{ type: "simple", monthly: 1200, priority: 0, directive: "template" } as Template, 1200],
    [{ type: "goal", amount: 5000, directive: "goal" } as Template, 5000],
    [
      {
        type: "by",
        amount: 1350,
        month: "2027-12",
        priority: 0,
        directive: "template",
      } as Template,
      1350,
    ],
    [
      {
        type: "limit",
        amount: 480,
        hold: false,
        period: "monthly",
        directive: "template",
      } as Template,
      480,
    ],
    [
      {
        type: "periodic",
        amount: 175,
        period: { period: "week", amount: 2 },
        priority: 0,
        directive: "template",
      } as Template,
      175,
    ],
  ])("never echoes the amount (%#)", (tmpl, amount) => {
    const out = short(tmpl);
    expect(out).not.toContain("$");
    expect(out).not.toContain(String(amount));
    expect(out).not.toContain(amount.toLocaleString("en-US"));
  });
});
