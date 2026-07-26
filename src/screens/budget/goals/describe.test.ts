import { describe, it, expect, beforeAll } from "vitest";

import { setCurrencyConfig } from "@/core/shared/util";
import { describeTemplate } from "./describe";
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

// Set up currency symbol so formatted amounts include "$"
// applyCurrencyStyling wraps with LTR marks: ‪$‬
const $ = "‪$‬";

beforeAll(() => {
  setCurrencyConfig({ symbol: "$", position: "before", spaceBetween: false });
});

// The English strings from budget.json. Asserting the finished sentence rather
// than a key means a template that reaches for a key nobody wrote fails here
// instead of rendering the raw key at the user.
const translations: Record<string, string> = {
  "budget:describe.budgetMonthly": "Budget {{amount}} monthly",
  "budget:describe.budgetMonthlyBase": "Budget monthly",
  "budget:describe.budgetMonthlyWithLimit": "Budget {{amount}} monthly (up to {{limit}})",
  "budget:describe.reachBalance": "Reach {{amount}} balance",
  "budget:describe.saveBy": "Save {{amount}} by {{date}}",
  "budget:describe.saveByRepeatsAnnually": "Save {{amount}} by {{date}} (repeats annually)",
  "budget:describe.saveByEveryNMonths": "Save {{amount}} by {{date}} (every {{count}} months)",
  "budget:describe.averageOfLast": "Average of last {{count}} months",
  "budget:describe.averageOfLastWithAdjustment":
    "Average of last {{count}} months ({{sign}}{{value}}{{suffix}})",
  "budget:describe.copyFrom": "Copy budget from {{count}} months ago",
  "budget:describe.budgetEvery": "Budget {{amount}} every {{period}}",
  "budget:describe.spendBy": "Spend {{amount}} by {{date}}",
  "budget:describe.percentOfIncome": "Budget {{percent}}% of income",
  "budget:describe.percentOfLastIncome": "Budget {{percent}}% of last month's income",
  "budget:describe.fillRemaining": "Fill with remaining budget",
  "budget:describe.fillRemainingWeight": "Fill with remaining budget (weight: {{weight}})",
  "budget:describe.refillToLimit": "Refill to limit",
  "budget:describe.refillUpTo": "Refill up to {{amount}} each {{period}}",
  "budget:describe.limitPeriod": "Limit: {{amount}} {{period}}",
  "budget:describe.limitPeriodHold": "Limit: {{amount}} {{period}}, hold",
  "budget:describe.linkedToSchedule": "Linked to schedule",
  "budget:describe.period.day": "day",
  "budget:describe.period.week": "week",
  "budget:describe.period.month": "month",
  "budget:describe.period.year": "year",
  "budget:describe.period.days": "days",
  "budget:describe.period.weeks": "weeks",
  "budget:describe.period.months": "months",
  "budget:describe.period.years": "years",
};

// A missing key returns the key itself, exactly as i18next would — that is what
// makes the assertions below able to catch one.
function t(key: string, params?: Record<string, unknown>): string {
  let out = translations[key] ?? key;
  for (const [k, v] of Object.entries(params ?? {})) {
    out = out.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), String(v));
  }
  return out;
}

const describeEn = (tmpl: Template) => describeTemplate(tmpl, t, "en");

describe("describeTemplate", () => {
  it("simple monthly", () => {
    const tmpl: SimpleTemplate = {
      type: "simple",
      monthly: 200,
      priority: 0,
      directive: "template",
    };
    expect(describeEn(tmpl)).toBe(`Budget ${$}200.00 monthly`);
  });

  it("simple monthly with limit", () => {
    const tmpl: SimpleTemplate = {
      type: "simple",
      monthly: 200,
      limit: { amount: 500, hold: false, period: "monthly" },
      priority: 0,
      directive: "template",
    };
    expect(describeEn(tmpl)).toBe(`Budget ${$}200.00 monthly (up to ${$}500.00)`);
  });

  it("simple with no monthly", () => {
    const tmpl: SimpleTemplate = { type: "simple", priority: 0, directive: "template" };
    expect(describeEn(tmpl)).toBe("Budget monthly");
  });

  it("simple with only a limit is a refill, and names the period", () => {
    const tmpl: SimpleTemplate = {
      type: "simple",
      limit: { amount: 80, hold: false, period: "weekly" },
      priority: 0,
      directive: "template",
    };
    expect(describeEn(tmpl)).toBe(`Refill up to ${$}80.00 each week`);
  });

  it("goal (balance target)", () => {
    const tmpl: GoalTemplate = { type: "goal", amount: 5000, directive: "goal" };
    expect(describeEn(tmpl)).toBe(`Reach ${$}5,000.00 balance`);
  });

  it("by (sinking fund)", () => {
    const tmpl: ByTemplate = {
      type: "by",
      amount: 1200,
      month: "2026-12",
      priority: 0,
      directive: "template",
    };
    const out = describeEn(tmpl);
    expect(out).toContain(`Save ${$}1,200.00 by`);
    expect(out).toContain("2026");
  });

  it("by with annual repeat", () => {
    const tmpl: ByTemplate = {
      type: "by",
      amount: 600,
      month: "2026-06",
      annual: true,
      repeat: 1,
      priority: 0,
      directive: "template",
    };
    expect(describeEn(tmpl)).toContain("(repeats annually)");
  });

  it("by with monthly repeat", () => {
    const tmpl: ByTemplate = {
      type: "by",
      amount: 300,
      month: "2026-09",
      repeat: 3,
      priority: 0,
      directive: "template",
    };
    expect(describeEn(tmpl)).toContain("(every 3 months)");
  });

  it("average", () => {
    const tmpl: AverageTemplate = {
      type: "average",
      numMonths: 3,
      priority: 0,
      directive: "template",
    };
    expect(describeEn(tmpl)).toBe("Average of last 3 months");
  });

  it("average with percent adjustment", () => {
    const tmpl: AverageTemplate = {
      type: "average",
      numMonths: 6,
      adjustment: 10,
      adjustmentType: "percent",
      priority: 0,
      directive: "template",
    };
    expect(describeEn(tmpl)).toBe("Average of last 6 months (+10%)");
  });

  it("average with negative fixed adjustment", () => {
    const tmpl: AverageTemplate = {
      type: "average",
      numMonths: 3,
      adjustment: -50,
      adjustmentType: "fixed",
      priority: 0,
      directive: "template",
    };
    expect(describeEn(tmpl)).toBe("Average of last 3 months (-50)");
  });

  it("copy", () => {
    const tmpl: CopyTemplate = { type: "copy", lookBack: 1, priority: 0, directive: "template" };
    expect(describeEn(tmpl)).toBe("Copy budget from 1 months ago");
  });

  it("copy multiple months", () => {
    const tmpl: CopyTemplate = { type: "copy", lookBack: 3, priority: 0, directive: "template" };
    expect(describeEn(tmpl)).toBe("Copy budget from 3 months ago");
  });

  it("periodic monthly", () => {
    const tmpl: PeriodicTemplate = {
      type: "periodic",
      amount: 50,
      period: { period: "month", amount: 1 },
      priority: 0,
      directive: "template",
    };
    expect(describeEn(tmpl)).toBe(`Budget ${$}50.00 every month`);
  });

  it("periodic every 2 weeks pluralises the period", () => {
    const tmpl: PeriodicTemplate = {
      type: "periodic",
      amount: 100,
      period: { period: "week", amount: 2 },
      priority: 0,
      directive: "template",
    };
    expect(describeEn(tmpl)).toBe(`Budget ${$}100.00 every weeks`);
  });

  it("spend", () => {
    const tmpl: SpendTemplate = {
      type: "spend",
      amount: 600,
      month: "2026-06",
      from: "2026-01",
      priority: 0,
      directive: "template",
    };
    expect(describeEn(tmpl)).toContain(`Spend ${$}600.00 by`);
  });

  it("percentage", () => {
    const tmpl: PercentageTemplate = {
      type: "percentage",
      percent: 10,
      previous: false,
      category: "all-income",
      priority: 0,
      directive: "template",
    };
    expect(describeEn(tmpl)).toBe("Budget 10% of income");
  });

  it("percentage of previous month", () => {
    const tmpl: PercentageTemplate = {
      type: "percentage",
      percent: 5,
      previous: true,
      category: "all-income",
      priority: 0,
      directive: "template",
    };
    expect(describeEn(tmpl)).toBe("Budget 5% of last month's income");
  });

  it("remainder weight 1 (default)", () => {
    const tmpl: RemainderTemplate = { type: "remainder", weight: 1, directive: "template" };
    expect(describeEn(tmpl)).toBe("Fill with remaining budget");
  });

  it("remainder weight 2", () => {
    const tmpl: RemainderTemplate = { type: "remainder", weight: 2, directive: "template" };
    expect(describeEn(tmpl)).toBe("Fill with remaining budget (weight: 2)");
  });

  it("refill", () => {
    const tmpl: RefillTemplate = { type: "refill", priority: 0, directive: "template" };
    expect(describeEn(tmpl)).toBe("Refill to limit");
  });

  it("schedule", () => {
    const tmpl: ScheduleTemplate = {
      type: "schedule",
      name: "Rent",
      priority: 0,
      directive: "template",
    };
    expect(describeEn(tmpl)).toBe("Linked to schedule");
  });

  // Recurrences are stored as adverbs but the period key set holds nouns; a
  // limit used to ask for `period.monthly`, which nobody ever wrote.
  it("limit names the period as a noun", () => {
    const tmpl: LimitTemplate = {
      type: "limit",
      amount: 400,
      hold: false,
      period: "monthly",
      directive: "template",
    };
    expect(describeEn(tmpl)).toBe(`Limit: ${$}400.00 month`);
  });

  it("limit with hold", () => {
    const tmpl: LimitTemplate = {
      type: "limit",
      amount: 400,
      hold: true,
      period: "monthly",
      directive: "template",
    };
    expect(describeEn(tmpl)).toBe(`Limit: ${$}400.00 month, hold`);
  });

  it("daily limit", () => {
    const tmpl: LimitTemplate = {
      type: "limit",
      amount: 25,
      hold: false,
      period: "daily",
      directive: "template",
    };
    expect(describeEn(tmpl)).toBe(`Limit: ${$}25.00 day`);
  });
});
