import { describe, it, expect } from "vitest";
import { createDefaultTemplate } from "@/core/domain/goals";
import type { Schedule } from "@/core/types/models";
import {
  entriesWithDraft,
  makeGoalFormSchema,
  validateDraft,
  type GoalFormValues,
  type GoalValidationCtx,
} from "../goalForm.schema";

function makeCtx(overrides: Partial<GoalValidationCtx> = {}): GoalValidationCtx {
  return {
    savedEntries: [],
    schedules: [],
    validPercentageSources: new Set(["all-income"]),
    ...overrides,
  };
}

function makeValues(overrides: Partial<GoalFormValues> = {}): GoalFormValues {
  return {
    entryId: null,
    displayType: "fixed",
    template: createDefaultTemplate("fixed"),
    ...overrides,
  };
}

const activeSchedule: Schedule = {
  id: "sched-1",
  name: "Rent",
  rule: "",
  completed: false,
  posts_transaction: false,
  tombstone: false,
  custom_upcoming_length: null,
  next_date: null,
  _payee: null,
  _account: null,
  _amount: null,
  _amountOp: null,
  _date: null,
  _category: null,
  _conditions: [],
};

describe("entriesWithDraft", () => {
  it("appends the draft when entryId is null (create session)", () => {
    const saved = [
      { id: "a", displayType: "fixed" as const, template: createDefaultTemplate("fixed") },
    ];
    const result = entriesWithDraft(saved, makeValues({ entryId: null }));
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("a");
    expect(result[1].id).toBe("__draft__");
  });

  it("replaces the matching saved entry when entryId matches (edit session)", () => {
    const saved = [
      { id: "a", displayType: "fixed" as const, template: createDefaultTemplate("fixed") },
      {
        id: "b",
        displayType: "historical" as const,
        template: createDefaultTemplate("historical"),
      },
    ];
    const result = entriesWithDraft(saved, makeValues({ entryId: "a" }));
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("a");
    expect(result[1].id).toBe("b");
  });

  it("appends (does not replace) when entryId doesn't match any saved entry", () => {
    const saved = [
      { id: "a", displayType: "fixed" as const, template: createDefaultTemplate("fixed") },
    ];
    const result = entriesWithDraft(saved, makeValues({ entryId: "ghost" }));
    expect(result).toHaveLength(2);
  });
});

describe("validateDraft — per-type valid minimal input", () => {
  it("fixed: a periodic template with a positive amount is valid", () => {
    const values = makeValues({
      displayType: "fixed",
      template: { ...createDefaultTemplate("fixed"), amount: 50 } as GoalFormValues["template"],
    });
    const result = validateDraft(values, makeCtx());
    expect(result.error).toBeNull();
    expect(result.conflicts).toEqual([]);
  });

  it("schedule: a template pointing at a real, active schedule is valid", () => {
    const values = makeValues({
      displayType: "schedule",
      template: { type: "schedule", scheduleId: "sched-1", priority: 0, directive: "template" },
    });
    const result = validateDraft(values, makeCtx({ schedules: [activeSchedule] }));
    expect(result.error).toBeNull();
  });

  it("percentage: a valid percent + recognized source is valid", () => {
    const values = makeValues({
      displayType: "percentage",
      template: createDefaultTemplate("percentage"),
    });
    const result = validateDraft(values, makeCtx());
    expect(result.error).toBeNull();
  });

  it("historical: the default average template is valid", () => {
    const values = makeValues({
      displayType: "historical",
      template: createDefaultTemplate("historical"),
    });
    const result = validateDraft(values, makeCtx());
    expect(result.error).toBeNull();
  });

  it("limit: valid when another (non-limit, non-goal) template contributes", () => {
    const contributor = {
      id: "a",
      displayType: "fixed" as const,
      template: createDefaultTemplate("fixed"),
    };
    const values = makeValues({
      displayType: "limit",
      template: { ...createDefaultTemplate("limit"), amount: 100 } as GoalFormValues["template"],
    });
    const result = validateDraft(values, makeCtx({ savedEntries: [contributor] }));
    expect(result.error).toBeNull();
  });

  it("refill: valid when a limit template exists in the category", () => {
    const cap = {
      id: "a",
      displayType: "limit" as const,
      template: createDefaultTemplate("limit"),
    };
    const values = makeValues({
      displayType: "refill",
      template: createDefaultTemplate("refill"),
    });
    const result = validateDraft(values, makeCtx({ savedEntries: [cap] }));
    expect(result.error).toBeNull();
  });
});

describe("validateDraft — rejection paths", () => {
  it("fixed: zero amount is rejected (amount-zero)", () => {
    const values = makeValues({
      displayType: "fixed",
      template: { ...createDefaultTemplate("fixed"), amount: 0 } as GoalFormValues["template"],
    });
    const result = validateDraft(values, makeCtx());
    expect(result.error).toEqual({ kind: "amount-zero" });
  });

  it("fixed: negative amount is rejected (amount-zero, cents <= 0)", () => {
    const values = makeValues({
      displayType: "fixed",
      template: { ...createDefaultTemplate("fixed"), amount: -25 } as GoalFormValues["template"],
    });
    const result = validateDraft(values, makeCtx());
    expect(result.error).toEqual({ kind: "amount-zero" });
  });

  it("schedule: missing scheduleId and name is rejected", () => {
    const values = makeValues({
      displayType: "schedule",
      template: { type: "schedule", priority: 0, directive: "template" },
    });
    const result = validateDraft(values, makeCtx());
    expect(result.error).toEqual({ kind: "schedule-not-found", name: "" });
  });

  it("schedule: a scheduleId that doesn't resolve to any known schedule is rejected", () => {
    const values = makeValues({
      displayType: "schedule",
      template: { type: "schedule", scheduleId: "missing", priority: 0, directive: "template" },
    });
    const result = validateDraft(values, makeCtx({ schedules: [activeSchedule] }));
    expect(result.error?.kind).toBe("schedule-not-found");
  });

  it("schedule: a completed schedule is treated as not found", () => {
    const values = makeValues({
      displayType: "schedule",
      template: { type: "schedule", scheduleId: "sched-1", priority: 0, directive: "template" },
    });
    const result = validateDraft(
      values,
      makeCtx({ schedules: [{ ...activeSchedule, completed: true }] }),
    );
    expect(result.error?.kind).toBe("schedule-not-found");
  });

  it("percentage: percent <= 0 is out-of-range", () => {
    const values = makeValues({
      displayType: "percentage",
      template: {
        ...createDefaultTemplate("percentage"),
        percent: 0,
      } as GoalFormValues["template"],
    });
    const result = validateDraft(values, makeCtx());
    expect(result.error).toEqual({ kind: "percentage-out-of-range", percent: 0 });
  });

  it("percentage: percent > 100 is out-of-range", () => {
    const values = makeValues({
      displayType: "percentage",
      template: {
        ...createDefaultTemplate("percentage"),
        percent: 150,
      } as GoalFormValues["template"],
    });
    const result = validateDraft(values, makeCtx());
    expect(result.error).toEqual({ kind: "percentage-out-of-range", percent: 150 });
  });

  it("percentage: missing source category is rejected", () => {
    const values = makeValues({
      displayType: "percentage",
      template: {
        ...createDefaultTemplate("percentage"),
        category: "",
      } as GoalFormValues["template"],
    });
    const result = validateDraft(values, makeCtx());
    expect(result.error).toEqual({ kind: "percentage-no-source" });
  });

  it("percentage: a source not in validPercentageSources is rejected", () => {
    const values = makeValues({
      displayType: "percentage",
      template: {
        ...createDefaultTemplate("percentage"),
        category: "unknown-cat",
      } as GoalFormValues["template"],
    });
    const result = validateDraft(
      values,
      makeCtx({ validPercentageSources: new Set(["all-income"]) }),
    );
    expect(result.error).toEqual({ kind: "percentage-source-not-found", source: "unknown-cat" });
  });

  it("limit: rejected when no other template contributes money", () => {
    const values = makeValues({
      displayType: "limit",
      template: { ...createDefaultTemplate("limit"), amount: 100 } as GoalFormValues["template"],
    });
    const result = validateDraft(values, makeCtx({ savedEntries: [] }));
    expect(result.error).toEqual({ kind: "limit-no-contributor" });
  });

  it("refill: rejected when no limit template exists to refill toward", () => {
    const values = makeValues({
      displayType: "refill",
      template: createDefaultTemplate("refill"),
    });
    const result = validateDraft(values, makeCtx({ savedEntries: [] }));
    expect(result.error).toEqual({ kind: "refill-no-cap" });
  });
});

describe("validateDraft — global conflicts", () => {
  it("flags percent-over-100 when percentage templates from the same source exceed 100%", () => {
    const existing = {
      id: "a",
      displayType: "percentage" as const,
      template: {
        ...createDefaultTemplate("percentage"),
        percent: 80,
      } as GoalFormValues["template"],
    };
    const values = makeValues({
      displayType: "percentage",
      template: {
        ...createDefaultTemplate("percentage"),
        percent: 30,
      } as GoalFormValues["template"],
    });
    const result = validateDraft(values, makeCtx({ savedEntries: [existing] }));
    expect(result.conflicts).toContainEqual({ kind: "percent-over-100", total: 110 });
  });

  it("does not flag percent-over-100 when different sources are each under 100%", () => {
    const existing = {
      id: "a",
      displayType: "percentage" as const,
      template: {
        ...createDefaultTemplate("percentage"),
        percent: 80,
        category: "cat-1",
      } as GoalFormValues["template"],
    };
    const values = makeValues({
      displayType: "percentage",
      template: {
        ...createDefaultTemplate("percentage"),
        percent: 30,
        category: "cat-2",
      } as GoalFormValues["template"],
    });
    const result = validateDraft(values, makeCtx({ savedEntries: [existing] }));
    expect(result.conflicts).toEqual([]);
  });
});

describe("makeGoalFormSchema (zod adapter)", () => {
  it("safeParse succeeds for a valid draft", () => {
    const schema = makeGoalFormSchema(() => makeCtx());
    const values = makeValues({
      displayType: "fixed",
      template: { ...createDefaultTemplate("fixed"), amount: 50 } as GoalFormValues["template"],
    });
    const result = schema.safeParse(values);
    expect(result.success).toBe(true);
  });

  it("safeParse fails and attaches the error kind as the issue message", () => {
    const schema = makeGoalFormSchema(() => makeCtx());
    const values = makeValues({
      displayType: "fixed",
      template: { ...createDefaultTemplate("fixed"), amount: 0 } as GoalFormValues["template"],
    });
    const result = schema.safeParse(values);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("amount-zero");
      expect(result.error.issues[0]?.path).toEqual(["template"]);
    }
  });

  it("safeParse reports every conflict as a separate issue alongside the draft error", () => {
    const existing = {
      id: "a",
      displayType: "percentage" as const,
      template: {
        ...createDefaultTemplate("percentage"),
        percent: 80,
      } as GoalFormValues["template"],
    };
    const schema = makeGoalFormSchema(() => makeCtx({ savedEntries: [existing] }));
    const values = makeValues({
      displayType: "percentage",
      template: {
        ...createDefaultTemplate("percentage"),
        percent: 30,
      } as GoalFormValues["template"],
    });
    const result = schema.safeParse(values);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain("percent-over-100");
    }
  });
});
