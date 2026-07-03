import { describe, it, expect } from "vitest";
import { parseTemplateNoteLine, parseTemplateNotes, templateToNoteLine } from "./parse";
import type { Template } from "./types";

describe("parseTemplateNoteLine (fix #12 — legacy notes parsing)", () => {
  it("parses a simple monthly template", () => {
    expect(parseTemplateNoteLine("#template 50")).toEqual({
      type: "simple",
      monthly: 50,
      limit: null,
      priority: 0,
      directive: "template",
    });
  });

  it("parses a prioritized simple template", () => {
    expect(parseTemplateNoteLine("#template-2 50")).toMatchObject({ type: "simple", priority: 2 });
  });

  it("parses a goal (balance target) line", () => {
    expect(parseTemplateNoteLine("#goal 500")).toEqual({
      type: "goal",
      amount: 500,
      directive: "goal",
    });
  });

  it("parses a limit-only template (refill-style) with no monthly amount", () => {
    const result = parseTemplateNoteLine("#template up to 200 hold");
    expect(result).toMatchObject({
      type: "simple",
      monthly: undefined,
      limit: { amount: 200, hold: true, period: "monthly" },
    });
  });

  it("parses a monthly amount combined with a limit clause", () => {
    const result = parseTemplateNoteLine("#template 50 up to 200");
    expect(result).toMatchObject({
      type: "simple",
      monthly: 50,
      limit: { amount: 200, hold: false, period: "monthly" },
    });
  });

  it("parses a daily limit clause", () => {
    const result = parseTemplateNoteLine("#template up to 20 per day");
    expect(result).toMatchObject({ limit: { amount: 20, hold: false, period: "daily" } });
  });

  it("parses a weekly limit clause with a starting date", () => {
    const result = parseTemplateNoteLine("#template up to 100 per week starting 2026-01-05");
    expect(result).toMatchObject({
      limit: { amount: 100, hold: false, period: "weekly", start: "2026-01-05" },
    });
  });

  it("parses a by-template (sinking fund)", () => {
    expect(parseTemplateNoteLine("#template 1200 by 2026-12")).toEqual({
      type: "by",
      amount: 1200,
      month: "2026-12",
      annual: false,
      repeat: undefined,
      priority: 0,
      directive: "template",
    });
  });

  it("parses a by-template with an annual repeat", () => {
    const result = parseTemplateNoteLine("#template 1200 by 2026-12 repeat every year");
    expect(result).toMatchObject({ type: "by", annual: true, repeat: 1 });
  });

  it("parses a by-template with a monthly repeat count", () => {
    const result = parseTemplateNoteLine("#template 1200 by 2026-12 repeat every 3 months");
    expect(result).toMatchObject({ type: "by", annual: false, repeat: 3 });
  });

  it("parses a spend template", () => {
    expect(parseTemplateNoteLine("#template 600 by 2026-06 spend from 2026-01")).toMatchObject({
      type: "spend",
      amount: 600,
      month: "2026-06",
      from: "2026-01",
    });
  });

  it("parses an average template with an adjustment", () => {
    const result = parseTemplateNoteLine("#template average 3 months [increase 10%]");
    expect(result).toMatchObject({
      type: "average",
      numMonths: 3,
      adjustment: 10,
      adjustmentType: "percent",
    });
  });

  it("parses a copy template", () => {
    expect(parseTemplateNoteLine("#template copy from 2 months ago")).toMatchObject({
      type: "copy",
      lookBack: 2,
    });
  });

  it("parses a periodic template", () => {
    const result = parseTemplateNoteLine("#template 25 repeat every 2 weeks starting 2026-01-05");
    expect(result).toMatchObject({
      type: "periodic",
      amount: 25,
      period: { period: "week", amount: 2 },
      starting: "2026-01-05",
    });
  });

  it("parses a remainder template", () => {
    expect(parseTemplateNoteLine("#template remainder 2")).toMatchObject({
      type: "remainder",
      weight: 2,
    });
    expect(parseTemplateNoteLine("#template remainder")).toMatchObject({
      type: "remainder",
      weight: 1,
    });
  });

  it("parses a refill template", () => {
    expect(parseTemplateNoteLine("#template refill")).toEqual({
      type: "refill",
      priority: 0,
      directive: "template",
    });
  });

  it("parses a percentage template using the category name map", () => {
    const map = new Map([["Freelance", "cat-123"]]);
    const result = parseTemplateNoteLine("#template 15% of Freelance", map);
    expect(result).toMatchObject({
      type: "percentage",
      percent: 15,
      previous: false,
      category: "cat-123",
    });
  });

  it("parses a percentage-of-previous-income template referencing all income", () => {
    const result = parseTemplateNoteLine("#template 10% of previous all income");
    expect(result).toMatchObject({
      type: "percentage",
      percent: 10,
      previous: true,
      category: "all-income",
    });
  });

  it("skips a percentage template when the category name can't be resolved", () => {
    expect(parseTemplateNoteLine("#template 15% of Unknown Category")).toBeNull();
  });

  it("parses a schedule template", () => {
    expect(parseTemplateNoteLine("#template schedule Rent")).toMatchObject({
      type: "schedule",
      name: "Rent",
      full: false,
    });
  });

  it("parses a schedule template with the full flag and an adjustment", () => {
    const result = parseTemplateNoteLine("#template schedule full Rent [increase 10%]");
    expect(result).toMatchObject({
      type: "schedule",
      name: "Rent",
      full: true,
      adjustment: 10,
      adjustmentType: "percent",
    });
  });

  it("returns null for ordinary note text", () => {
    expect(parseTemplateNoteLine("Just a regular note about this category")).toBeNull();
    expect(parseTemplateNoteLine("")).toBeNull();
  });

  it("parses multiple lines via parseTemplateNotes, skipping non-template lines", () => {
    const notes = "Remember to check this category\n#template 50\nAnother note\n#goal 500";
    const templates = parseTemplateNotes(notes);
    expect(templates).toHaveLength(2);
    expect(templates[0]).toMatchObject({ type: "simple", monthly: 50 });
    expect(templates[1]).toMatchObject({ type: "goal", amount: 500 });
  });
});

describe("parseTemplateNoteLine — round-trips with templateToNoteLine", () => {
  const categoryNames = new Map([["cat-1", "Groceries"]]);
  const nameToId = new Map([["Groceries", "cat-1"]]);

  const cases: Template[] = [
    { type: "simple", monthly: 50, priority: 0, directive: "template" },
    {
      type: "simple",
      monthly: 50,
      limit: { amount: 200, hold: false, period: "monthly" },
      priority: 1,
      directive: "template",
    },
    { type: "goal", amount: 500, directive: "goal" },
    { type: "by", amount: 1200, month: "2026-12", priority: 0, directive: "template" },
    {
      type: "by",
      amount: 1200,
      month: "2026-12",
      annual: true,
      repeat: 2,
      priority: 0,
      directive: "template",
    },
    {
      type: "spend",
      amount: 600,
      month: "2026-06",
      from: "2026-01",
      priority: 0,
      directive: "template",
    },
    { type: "average", numMonths: 3, priority: 0, directive: "template" },
    {
      type: "average",
      numMonths: 3,
      adjustment: 15,
      adjustmentType: "percent",
      priority: 0,
      directive: "template",
    },
    { type: "copy", lookBack: 2, priority: 0, directive: "template" },
    {
      type: "periodic",
      amount: 25,
      period: { period: "week", amount: 2 },
      starting: "2026-01-05",
      priority: 0,
      directive: "template",
    },
    {
      type: "percentage",
      percent: 15,
      previous: false,
      category: "cat-1",
      priority: 0,
      directive: "template",
    },
    { type: "remainder", weight: 2, directive: "template" },
    { type: "schedule", name: "Rent", priority: 0, directive: "template" },
    {
      type: "schedule",
      name: "Rent",
      full: true,
      adjustment: 10,
      adjustmentType: "percent",
      priority: 0,
      directive: "template",
    },
  ];

  for (const original of cases) {
    it(`round-trips ${original.type}`, () => {
      const catName =
        original.type === "percentage" ? categoryNames.get(original.category) : undefined;
      const line = templateToNoteLine(original, catName);
      const parsed = parseTemplateNoteLine(line, nameToId);
      expect(parsed).toMatchObject(
        Object.fromEntries(Object.entries(original).filter(([, v]) => v !== undefined)),
      );
    });
  }
});
