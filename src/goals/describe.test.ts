import { describe, it, expect, vi, beforeAll } from "vitest";

// Mock modules that transitively import native dependencies (via format → privacyStore)
vi.mock("../stores/privacyStore", () => ({
  usePrivacyStore: { getState: () => ({ privacyMode: false }) },
}));

import { setCurrencyConfig } from "../lib/format";
import { describeTemplate, translateDescription, type TemplateDescription } from "./describe";

// Set up currency symbol so formatted amounts include "$"
// applyCurrencyStyling wraps with LTR marks: \u202A$\u202C
const $ = "\u202A$\u202C";

beforeAll(() => {
  setCurrencyConfig({ symbol: "$", position: "before", spaceBetween: false });
});
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
} from "./types";

// Helper: translates a TemplateDescription using English budget.json values
function translateEn(desc: TemplateDescription): string {
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
    "budget:describe.copyFrom": 'Copy budget from {{count}} month{{count > 1 ? "s" : ""}} ago',
    "budget:describe.budgetEvery": "Budget {{amount}} every {{period}}",
    "budget:describe.spendBy": "Spend {{amount}} by {{date}}",
    "budget:describe.percentOfIncome": "Budget {{percent}}% of income",
    "budget:describe.percentOfLastIncome": "Budget {{percent}}% of last month's income",
    "budget:describe.fillRemaining": "Fill with remaining budget",
    "budget:describe.fillRemainingWeight": "Fill with remaining budget (weight: {{weight}})",
    "budget:describe.refillToLimit": "Refill to limit",
    "budget:describe.limitPeriod": "Limit: {{amount}} {{period}}",
    "budget:describe.limitPeriodHold": "Limit: {{amount}} {{period}}, hold",
    "budget:describe.period.day": "day",
    "budget:describe.period.week": "week",
    "budget:describe.period.month": "month",
    "budget:describe.period.year": "year",
    "budget:describe.period.days": "days",
    "budget:describe.period.weeks": "weeks",
    "budget:describe.period.months": "months",
    "budget:describe.period.years": "years",
  };

  const t = (key: string, params?: Record<string, unknown>): string => {
    let template = translations[key] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        template = template.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), String(v));
      }
    }
    return template;
  };

  return translateDescription(desc, t);
}

describe("describeTemplate", () => {
  it("simple monthly", () => {
    const t: SimpleTemplate = { type: "simple", monthly: 200, priority: 0, directive: "template" };
    const desc = describeTemplate(t, "en");
    expect(desc.key).toBe("budget:describe.budgetMonthly");
    expect(translateEn(desc)).toBe(`Budget ${$}200.00 monthly`);
  });

  it("simple monthly with limit", () => {
    const t: SimpleTemplate = {
      type: "simple",
      monthly: 200,
      limit: { amount: 500, hold: false, period: "monthly" },
      priority: 0,
      directive: "template",
    };
    const desc = describeTemplate(t, "en");
    expect(desc.key).toBe("budget:describe.budgetMonthlyWithLimit");
    expect(translateEn(desc)).toBe(`Budget ${$}200.00 monthly (up to ${$}500.00)`);
  });

  it("simple with no monthly", () => {
    const t: SimpleTemplate = { type: "simple", priority: 0, directive: "template" };
    const desc = describeTemplate(t, "en");
    expect(translateEn(desc)).toBe("Budget monthly");
  });

  it("goal (balance target)", () => {
    const t: GoalTemplate = { type: "goal", amount: 5000, directive: "goal" };
    const desc = describeTemplate(t, "en");
    expect(translateEn(desc)).toBe(`Reach ${$}5,000.00 balance`);
  });

  it("by (sinking fund)", () => {
    const t: ByTemplate = {
      type: "by",
      amount: 1200,
      month: "2026-12",
      priority: 0,
      directive: "template",
    };
    const desc = describeTemplate(t, "en");
    expect(desc.key).toBe("budget:describe.saveBy");
    expect(desc.params!.amount).toBe(`${$}1,200.00`);
    // Date formatted with 'en' locale
    expect(desc.params!.date).toContain("2026");
  });

  it("by with annual repeat", () => {
    const t: ByTemplate = {
      type: "by",
      amount: 600,
      month: "2026-06",
      annual: true,
      repeat: 1,
      priority: 0,
      directive: "template",
    };
    const desc = describeTemplate(t, "en");
    expect(desc.key).toBe("budget:describe.saveByRepeatsAnnually");
  });

  it("by with monthly repeat", () => {
    const t: ByTemplate = {
      type: "by",
      amount: 300,
      month: "2026-09",
      repeat: 3,
      priority: 0,
      directive: "template",
    };
    const desc = describeTemplate(t, "en");
    expect(desc.key).toBe("budget:describe.saveByEveryNMonths");
    expect(desc.params!.count).toBe(3);
  });

  it("average", () => {
    const t: AverageTemplate = {
      type: "average",
      numMonths: 3,
      priority: 0,
      directive: "template",
    };
    const desc = describeTemplate(t, "en");
    expect(translateEn(desc)).toBe("Average of last 3 months");
  });

  it("average with percent adjustment", () => {
    const t: AverageTemplate = {
      type: "average",
      numMonths: 6,
      adjustment: 10,
      adjustmentType: "percent",
      priority: 0,
      directive: "template",
    };
    const desc = describeTemplate(t, "en");
    expect(translateEn(desc)).toBe("Average of last 6 months (+10%)");
  });

  it("average with negative fixed adjustment", () => {
    const t: AverageTemplate = {
      type: "average",
      numMonths: 3,
      adjustment: -50,
      adjustmentType: "fixed",
      priority: 0,
      directive: "template",
    };
    const desc = describeTemplate(t, "en");
    expect(translateEn(desc)).toBe("Average of last 3 months (-50)");
  });

  it("copy", () => {
    const t: CopyTemplate = { type: "copy", lookBack: 1, priority: 0, directive: "template" };
    const desc = describeTemplate(t, "en");
    expect(desc.key).toBe("budget:describe.copyFrom");
    expect(desc.params!.count).toBe(1);
  });

  it("copy multiple months", () => {
    const t: CopyTemplate = { type: "copy", lookBack: 3, priority: 0, directive: "template" };
    const desc = describeTemplate(t, "en");
    expect(desc.params!.count).toBe(3);
  });

  it("periodic monthly", () => {
    const t: PeriodicTemplate = {
      type: "periodic",
      amount: 50,
      period: { period: "month", amount: 1 },
      priority: 0,
      directive: "template",
    };
    const desc = describeTemplate(t, "en");
    expect(desc.periodKey).toBe("month");
    expect(translateEn(desc)).toBe(`Budget ${$}50.00 every month`);
  });

  it("periodic every 2 weeks", () => {
    const t: PeriodicTemplate = {
      type: "periodic",
      amount: 100,
      period: { period: "week", amount: 2 },
      priority: 0,
      directive: "template",
    };
    const desc = describeTemplate(t, "en");
    expect(desc.periodKey).toBe("weeks");
    expect(translateEn(desc)).toBe(`Budget ${$}100.00 every weeks`);
  });

  it("spend", () => {
    const t: SpendTemplate = {
      type: "spend",
      amount: 600,
      month: "2026-06",
      from: "2026-01",
      priority: 0,
      directive: "template",
    };
    const desc = describeTemplate(t, "en");
    expect(desc.key).toBe("budget:describe.spendBy");
  });

  it("percentage", () => {
    const t: PercentageTemplate = {
      type: "percentage",
      percent: 10,
      previous: false,
      category: "all-income",
      priority: 0,
      directive: "template",
    };
    const desc = describeTemplate(t, "en");
    expect(translateEn(desc)).toBe("Budget 10% of income");
  });

  it("percentage of previous month", () => {
    const t: PercentageTemplate = {
      type: "percentage",
      percent: 5,
      previous: true,
      category: "all-income",
      priority: 0,
      directive: "template",
    };
    const desc = describeTemplate(t, "en");
    expect(translateEn(desc)).toBe("Budget 5% of last month's income");
  });

  it("remainder weight 1 (default)", () => {
    const t: RemainderTemplate = { type: "remainder", weight: 1, directive: "template" };
    const desc = describeTemplate(t, "en");
    expect(translateEn(desc)).toBe("Fill with remaining budget");
  });

  it("remainder weight 2", () => {
    const t: RemainderTemplate = { type: "remainder", weight: 2, directive: "template" };
    const desc = describeTemplate(t, "en");
    expect(translateEn(desc)).toBe("Fill with remaining budget (weight: 2)");
  });

  it("refill", () => {
    const t: RefillTemplate = { type: "refill", priority: 0, directive: "template" };
    const desc = describeTemplate(t, "en");
    expect(translateEn(desc)).toBe("Refill to limit");
  });

  it("limit monthly", () => {
    const t: LimitTemplate = {
      type: "limit",
      amount: 400,
      hold: false,
      period: "monthly",
      directive: "template",
    };
    const desc = describeTemplate(t, "en");
    expect(desc.key).toBe("budget:describe.limitPeriod");
    expect(desc.periodKey).toBe("monthly");
  });

  it("limit monthly with hold", () => {
    const t: LimitTemplate = {
      type: "limit",
      amount: 400,
      hold: true,
      period: "monthly",
      directive: "template",
    };
    const desc = describeTemplate(t, "en");
    expect(desc.key).toBe("budget:describe.limitPeriodHold");
  });
});
