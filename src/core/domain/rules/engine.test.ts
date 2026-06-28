import { describe, it, expect } from "vitest";
import { Condition } from "./condition";
import { Action } from "./action";
import { Rule } from "./rule";
import { rankRules } from "./rule-utils";
import { runRules } from "./engine";

// ── Condition.eval ──

describe("evalCondition", () => {
  // ── is ──

  describe("is operator", () => {
    it("matches string fields case-insensitively", () => {
      expect(new Condition("is", "notes", "groceries").eval({ notes: "Groceries" })).toBe(true);
    });

    it("does not match different strings", () => {
      expect(new Condition("is", "notes", "groceries").eval({ notes: "pharmacy" })).toBe(false);
    });

    it("matches number fields exactly", () => {
      expect(new Condition("is", "amount", -5000).eval({ amount: -5000 })).toBe(true);
    });

    it("does not match different numbers", () => {
      expect(new Condition("is", "amount", -5000).eval({ amount: -4999 })).toBe(false);
    });

    it("matches boolean fields", () => {
      expect(new Condition("is", "cleared", true).eval({ cleared: true })).toBe(true);
    });

    it("matches id fields case-insensitively", () => {
      expect(new Condition("is", "category", "cat-123").eval({ category: "CAT-123" })).toBe(true);
    });

    it("matches date with full YYYY-MM-DD", () => {
      expect(new Condition("is", "date", "2024-03-15").eval({ date: "2024-03-15" })).toBe(true);
    });

    it("matches date with YYYY-MM (month precision)", () => {
      expect(new Condition("is", "date", "2024-03").eval({ date: "2024-03-15" })).toBe(true);
    });

    it("matches date with YYYY (year precision)", () => {
      expect(new Condition("is", "date", "2024").eval({ date: "2024-03-15" })).toBe(true);
    });

    it("does not match different date month", () => {
      expect(new Condition("is", "date", "2024-04").eval({ date: "2024-03-15" })).toBe(false);
    });
  });

  // ── isNot ──

  describe("isNot operator", () => {
    it("returns true for different strings", () => {
      expect(new Condition("isNot", "notes", "groceries").eval({ notes: "pharmacy" })).toBe(true);
    });

    it("returns false for matching strings (case-insensitive)", () => {
      expect(new Condition("isNot", "notes", "groceries").eval({ notes: "Groceries" })).toBe(false);
    });

    it("works with id fields", () => {
      expect(new Condition("isNot", "category", "cat-1").eval({ category: "cat-2" })).toBe(true);
    });
  });

  // ── contains / doesNotContain ──

  describe("contains operator", () => {
    it("matches substring case-insensitively", () => {
      expect(new Condition("contains", "notes", "groc").eval({ notes: "Weekly Groceries" })).toBe(
        true,
      );
    });

    it("returns false when substring not found", () => {
      expect(
        new Condition("contains", "notes", "pharmacy").eval({ notes: "Weekly Groceries" }),
      ).toBe(false);
    });
  });

  describe("doesNotContain operator", () => {
    it("returns true when substring not found", () => {
      expect(
        new Condition("doesNotContain", "notes", "pharmacy").eval({ notes: "Weekly Groceries" }),
      ).toBe(true);
    });

    it("returns false when substring found", () => {
      expect(
        new Condition("doesNotContain", "notes", "groc").eval({ notes: "Weekly Groceries" }),
      ).toBe(false);
    });
  });

  // ── matches ──

  describe("matches operator", () => {
    it("matches regex pattern", () => {
      expect(
        new Condition("matches", "notes", "^weekly.*").eval({ notes: "Weekly Groceries" }),
      ).toBe(true);
    });

    it("returns false for non-matching regex", () => {
      expect(
        new Condition("matches", "notes", "^daily.*").eval({ notes: "Weekly Groceries" }),
      ).toBe(false);
    });

    it("returns false for invalid regex", () => {
      expect(new Condition("matches", "notes", "[invalid").eval({ notes: "test" })).toBe(false);
    });
  });

  // ── oneOf / notOneOf ──

  describe("oneOf operator", () => {
    it("matches when value is in array", () => {
      expect(
        new Condition("oneOf", "category", ["cat-1", "cat-2", "cat-3"]).eval({ category: "cat-2" }),
      ).toBe(true);
    });

    it("matches case-insensitively for string fields", () => {
      expect(
        new Condition("oneOf", "imported_payee", ["WALMART", "TARGET"]).eval({
          imported_payee: "walmart",
        }),
      ).toBe(true);
    });

    it("returns false when value not in array", () => {
      expect(
        new Condition("oneOf", "category", ["cat-1", "cat-2"]).eval({ category: "cat-99" }),
      ).toBe(false);
    });

    it("returns false when field is null", () => {
      expect(new Condition("oneOf", "category", ["cat-1"]).eval({ category: null })).toBe(false);
    });
  });

  describe("notOneOf operator", () => {
    it("returns true when value not in array", () => {
      expect(
        new Condition("notOneOf", "category", ["cat-1", "cat-2"]).eval({ category: "cat-99" }),
      ).toBe(true);
    });

    it("returns false when value is in array", () => {
      expect(
        new Condition("notOneOf", "category", ["cat-1", "cat-2"]).eval({ category: "cat-1" }),
      ).toBe(false);
    });
  });

  // ── isapprox ──

  describe("isapprox operator", () => {
    it("matches within 7.5% threshold for numbers", () => {
      // 1000 * 0.075 = 75, so 930 to 1070 should match
      expect(new Condition("isapprox", "amount", 1000).eval({ amount: 1070 })).toBe(true);
    });

    it("does not match outside 7.5% threshold", () => {
      expect(new Condition("isapprox", "amount", 1000).eval({ amount: 1080 })).toBe(false);
    });

    it("matches approximate dates within ±2 days", () => {
      expect(new Condition("isapprox", "date", "2024-03-15").eval({ date: "2024-03-17" })).toBe(
        true,
      );
    });

    it("does not match dates outside ±2 days", () => {
      expect(new Condition("isapprox", "date", "2024-03-15").eval({ date: "2024-03-20" })).toBe(
        false,
      );
    });
  });

  // ── isbetween ──

  describe("isbetween operator", () => {
    it("matches value within range", () => {
      expect(
        new Condition("isbetween", "amount", { num1: -10000, num2: -5000 }).eval({ amount: -7500 }),
      ).toBe(true);
    });

    it("matches boundary values (inclusive)", () => {
      expect(
        new Condition("isbetween", "amount", { num1: 100, num2: 200 }).eval({ amount: 100 }),
      ).toBe(true);
    });

    it("handles reversed range (num2 < num1)", () => {
      expect(
        new Condition("isbetween", "amount", { num1: 200, num2: 100 }).eval({ amount: 150 }),
      ).toBe(true);
    });

    it("does not match outside range", () => {
      expect(
        new Condition("isbetween", "amount", { num1: 100, num2: 200 }).eval({ amount: 300 }),
      ).toBe(false);
    });
  });

  // ── Comparison operators ──

  describe("gt/gte/lt/lte operators", () => {
    it("gt matches greater values", () => {
      expect(new Condition("gt", "amount", 100).eval({ amount: 200 })).toBe(true);
    });

    it("gt does not match equal values", () => {
      expect(new Condition("gt", "amount", 100).eval({ amount: 100 })).toBe(false);
    });

    it("gte matches equal values", () => {
      expect(new Condition("gte", "amount", 100).eval({ amount: 100 })).toBe(true);
    });

    it("lt matches lesser values", () => {
      expect(new Condition("lt", "amount", 100).eval({ amount: 50 })).toBe(true);
    });

    it("lte matches equal values", () => {
      expect(new Condition("lte", "amount", 100).eval({ amount: 100 })).toBe(true);
    });

    it("gt works with dates", () => {
      expect(new Condition("gt", "date", "2024-03-15").eval({ date: "2024-03-20" })).toBe(true);
    });

    it("lt works with dates", () => {
      expect(new Condition("lt", "date", "2024-03-15").eval({ date: "2024-03-10" })).toBe(true);
    });
  });

  // ── hasTags ──

  describe("hasTags operator", () => {
    it("matches when tag is present in notes", () => {
      expect(
        new Condition("hasTags", "notes", "#groceries").eval({
          notes: "Weekly shopping #groceries at store",
        }),
      ).toBe(true);
    });

    it("does not match when tag is absent", () => {
      expect(
        new Condition("hasTags", "notes", "#pharmacy").eval({
          notes: "Weekly shopping #groceries",
        }),
      ).toBe(false);
    });
  });

  // ── Field mapping ──

  describe("field name mapping", () => {
    it("uses account field directly", () => {
      expect(new Condition("is", "account", "acc-1").eval({ account: "acc-1" })).toBe(true);
    });

    it("uses payee field directly", () => {
      expect(new Condition("is", "payee", "payee-1").eval({ payee: "payee-1" })).toBe(true);
    });

    it("uses imported_payee field directly", () => {
      expect(
        new Condition("contains", "imported_payee", "walmart").eval({
          imported_payee: "WALMART SUPERCENTER #123",
        }),
      ).toBe(true);
    });
  });

  // ── Null / undefined handling ──

  describe("null and undefined handling", () => {
    it("treats null string fields as empty string", () => {
      expect(new Condition("is", "notes", "").eval({ notes: null })).toBe(true);
    });

    it("returns false for undefined non-string fields", () => {
      expect(new Condition("is", "amount", 100).eval({})).toBe(false);
    });
  });

  // ── Number inflow/outflow ──

  describe("number inflow/outflow options", () => {
    it("outflow negates positive values and rejects positives", () => {
      // outflow = expenses (negative amounts); if amount > 0, condition fails
      expect(new Condition("is", "amount", 5000, { outflow: true }).eval({ amount: -5000 })).toBe(
        true,
      );
    });

    it("outflow rejects positive amounts", () => {
      expect(new Condition("is", "amount", 5000, { outflow: true }).eval({ amount: 5000 })).toBe(
        false,
      );
    });

    it("inflow rejects negative amounts", () => {
      expect(new Condition("is", "amount", 5000, { inflow: true }).eval({ amount: -5000 })).toBe(
        false,
      );
    });

    it("inflow accepts positive amounts", () => {
      expect(new Condition("is", "amount", 5000, { inflow: true }).eval({ amount: 5000 })).toBe(
        true,
      );
    });
  });
});

// ── Action.exec ──

describe("execAction", () => {
  it("set action sets value on the field", () => {
    const txn: Record<string, unknown> = { account: "acc-1", category: null };
    new Action("set", "category", "cat-1").exec(txn);
    expect(txn.category).toBe("cat-1");
  });

  it("set action sets payee field directly", () => {
    const txn: Record<string, unknown> = { payee: null };
    new Action("set", "payee", "payee-1").exec(txn);
    expect(txn.payee).toBe("payee-1");
  });

  it("link-schedule sets schedule field", () => {
    const txn: Record<string, unknown> = {};
    new Action("link-schedule", null, "sched-1").exec(txn);
    expect(txn.schedule).toBe("sched-1");
  });

  it("prepend-notes adds text before existing notes", () => {
    const txn: Record<string, unknown> = { notes: "existing" };
    new Action("prepend-notes", null, "prefix: ").exec(txn);
    expect(txn.notes).toBe("prefix: existing");
  });

  it("prepend-notes sets notes when empty", () => {
    const txn: Record<string, unknown> = {};
    new Action("prepend-notes", null, "new note").exec(txn);
    expect(txn.notes).toBe("new note");
  });

  it("append-notes adds text after existing notes", () => {
    const txn: Record<string, unknown> = { notes: "existing" };
    new Action("append-notes", null, " (auto)").exec(txn);
    expect(txn.notes).toBe("existing (auto)");
  });

  it("append-notes sets notes when empty", () => {
    const txn: Record<string, unknown> = {};
    new Action("append-notes", null, "new note").exec(txn);
    expect(txn.notes).toBe("new note");
  });

  it("delete-transaction sets tombstone", () => {
    const txn: Record<string, unknown> = {};
    new Action("delete-transaction", null, "").exec(txn);
    expect(txn.tombstone).toBe(1);
  });

  it("set-split-amount with fixed-amount sets amount", () => {
    const txn: Record<string, unknown> = { amount: -10000 };
    new Action("set-split-amount", null, -5000, { method: "fixed-amount" }).exec(txn);
    expect(txn.amount).toBe(-5000);
  });
});

// ── Rule.evalConditions ──

describe("evalConditions", () => {
  const makeRule = (
    conditions: Array<{
      field: string;
      op: string;
      value: unknown;
      options?: Record<string, unknown>;
    }>,
    conditionsOp: "and" | "or" = "and",
  ) =>
    new Rule({
      id: "r1",
      conditionsOp,
      conditions,
      actions: [],
    });

  it("returns false for empty conditions", () => {
    expect(makeRule([]).evalConditions({ notes: "test" })).toBe(false);
  });

  it("AND: requires all conditions to match", () => {
    const rule = makeRule([
      { field: "notes", op: "contains", value: "grocery" },
      { field: "amount", op: "lt", value: 0 },
    ]);
    expect(rule.evalConditions({ notes: "grocery store", amount: -5000 })).toBe(true);
    expect(rule.evalConditions({ notes: "grocery store", amount: 5000 })).toBe(false);
  });

  it("OR: requires at least one condition to match", () => {
    const rule = makeRule(
      [
        { field: "notes", op: "contains", value: "grocery" },
        { field: "notes", op: "contains", value: "supermarket" },
      ],
      "or",
    );
    expect(rule.evalConditions({ notes: "at the supermarket" })).toBe(true);
    expect(rule.evalConditions({ notes: "pharmacy" })).toBe(false);
  });
});

// ── Rule.apply ──

describe("applyRule", () => {
  it("returns unchanged copy when conditions do not match", () => {
    const rule = new Rule({
      id: "r1",
      conditionsOp: "and",
      conditions: [{ field: "notes", op: "is", value: "groceries" }],
      actions: [{ op: "set", field: "category", value: "cat-food" }],
    });
    const txn = { notes: "pharmacy", category: null };
    const result = rule.apply(txn);
    expect(result.category).toBeNull(); // unchanged
  });

  it("returns modified transaction when conditions match", () => {
    const rule = new Rule({
      id: "r1",
      conditionsOp: "and",
      conditions: [{ field: "notes", op: "contains", value: "grocery" }],
      actions: [{ op: "set", field: "category", value: "cat-food" }],
    });
    const txn = { notes: "grocery store", category: null };
    const result = rule.apply(txn);
    expect(result).not.toBe(txn); // new object
    expect(result.category).toBe("cat-food");
    expect(result.notes).toBe("grocery store");
  });

  it("applies multiple actions sequentially", () => {
    const rule = new Rule({
      id: "r1",
      conditionsOp: "and",
      conditions: [{ field: "amount", op: "lt", value: 0 }],
      actions: [
        { op: "set", field: "category", value: "cat-expense" },
        { op: "append-notes", value: " [auto-categorized]" },
      ],
    });
    const result = rule.apply({ amount: -5000, notes: "purchase" });
    expect(result.category).toBe("cat-expense");
    expect(result.notes).toBe("purchase [auto-categorized]");
  });
});

// ── rankRules ──

describe("rankRules", () => {
  const makeRule = (
    id: string,
    stage: "pre" | null | "post",
    conditions: Array<{ field: string; op: string; value: unknown }>,
  ) =>
    new Rule({
      id,
      stage,
      conditionsOp: "and",
      conditions,
      actions: [],
    });

  it("sorts pre-stage before normal before post-stage", () => {
    const rules = [
      makeRule("post", "post", []),
      makeRule("normal", null, []),
      makeRule("pre", "pre", []),
    ];
    const ranked = rankRules(rules);
    expect(ranked.map((r) => r.id)).toEqual(["pre", "normal", "post"]);
  });

  it("sorts lower specificity score first within same stage (last rule wins)", () => {
    const rules = [
      makeRule("low", null, [{ field: "notes", op: "contains", value: "x" }]), // score 0
      makeRule("high", null, [{ field: "notes", op: "is", value: "x" }]), // score 10 * 2 = 20
      makeRule("mid", null, [{ field: "amount", op: "gt", value: 0 }]), // score 1
    ];
    const ranked = rankRules(rules);
    expect(ranked.map((r) => r.id)).toEqual(["low", "mid", "high"]);
  });

  it("breaks ties by id", () => {
    const rules = [
      makeRule("b", null, [{ field: "notes", op: "is", value: "x" }]),
      makeRule("a", null, [{ field: "notes", op: "is", value: "y" }]),
    ];
    const ranked = rankRules(rules);
    expect(ranked.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("applies 2x multiplier when all conditions are high-priority ops", () => {
    const rules = [
      // mixed ops: is(10) + gt(1) = 11, no multiplier
      makeRule("mixed", null, [
        { field: "notes", op: "is", value: "x" },
        { field: "amount", op: "gt", value: 0 },
      ]),
      // all high-priority: is(10) + isNot(10) = 20 * 2 = 40
      makeRule("allhigh", null, [
        { field: "notes", op: "is", value: "x" },
        { field: "category", op: "isNot", value: "cat-1" },
      ]),
    ];
    const ranked = rankRules(rules);
    // Ascending sort: mixed (11) before allhigh (40)
    expect(ranked[0].id).toBe("mixed");
    expect(ranked[1].id).toBe("allhigh");
  });
});

// ── runRules ──

describe("runRules", () => {
  it("applies multiple rules in ranked order", () => {
    const rules = [
      new Rule({
        id: "r-categorize",
        conditionsOp: "and",
        conditions: [{ field: "notes", op: "contains", value: "grocery" }],
        actions: [{ op: "set", field: "category", value: "cat-food" }],
      }),
      new Rule({
        id: "r-rename",
        stage: "pre",
        conditionsOp: "and",
        conditions: [{ field: "imported_payee", op: "contains", value: "walmart" }],
        actions: [{ op: "set", field: "payee", value: "payee-walmart" }],
      }),
    ];

    const txn = {
      imported_payee: "WALMART SUPERCENTER",
      payee: null,
      notes: "grocery run",
      category: null,
    };

    const result = runRules(rules, txn);

    // pre-stage rename runs first
    expect(result.payee).toBe("payee-walmart");
    // then normal categorize
    expect(result.category).toBe("cat-food");
  });

  it("later rules see changes from earlier rules", () => {
    const rules = [
      new Rule({
        id: "r1",
        conditionsOp: "and",
        conditions: [{ field: "notes", op: "is", value: "" }],
        actions: [{ op: "set", field: "notes", value: "auto-note" }],
      }),
      new Rule({
        id: "r2",
        stage: "post",
        conditionsOp: "and",
        conditions: [{ field: "notes", op: "contains", value: "auto" }],
        actions: [{ op: "append-notes", value: " [processed]" }],
      }),
    ];

    const result = runRules(rules, { notes: null });
    expect(result.notes).toBe("auto-note [processed]");
  });

  it("does not modify original transaction", () => {
    const rules = [
      new Rule({
        id: "r1",
        conditionsOp: "and",
        conditions: [{ field: "amount", op: "lt", value: 0 }],
        actions: [{ op: "set", field: "category", value: "cat-1" }],
      }),
    ];

    const txn = { amount: -5000, category: null };
    runRules(rules, txn);
    expect(txn.category).toBeNull();
  });
});
