import { describe, it, expect } from "vitest";
import {
  evalCondition,
  execAction,
  evalConditions,
  applyRule,
  rankRules,
  runRules,
} from "./engine";
import type { ParsedRule } from "./types";

// ── evalCondition ──

describe("evalCondition", () => {
  // ── is ──

  describe("is operator", () => {
    it("matches string fields case-insensitively", () => {
      expect(
        evalCondition({ field: "notes", op: "is", value: "groceries" }, { notes: "Groceries" }),
      ).toBe(true);
    });

    it("does not match different strings", () => {
      expect(
        evalCondition({ field: "notes", op: "is", value: "groceries" }, { notes: "pharmacy" }),
      ).toBe(false);
    });

    it("matches number fields exactly", () => {
      expect(
        evalCondition(
          { field: "amount", op: "is", value: -5000, type: "number" },
          { amount: -5000 },
        ),
      ).toBe(true);
    });

    it("does not match different numbers", () => {
      expect(
        evalCondition(
          { field: "amount", op: "is", value: -5000, type: "number" },
          { amount: -4999 },
        ),
      ).toBe(false);
    });

    it("matches boolean fields", () => {
      expect(
        evalCondition(
          { field: "cleared", op: "is", value: true, type: "boolean" },
          { cleared: true },
        ),
      ).toBe(true);
    });

    it("matches id fields case-insensitively", () => {
      expect(
        evalCondition(
          { field: "category", op: "is", value: "cat-123", type: "id" },
          { category: "CAT-123" },
        ),
      ).toBe(true);
    });

    it("matches date with full YYYY-MM-DD", () => {
      expect(
        evalCondition(
          { field: "date", op: "is", value: "2024-03-15", type: "date" },
          { date: 20240315 },
        ),
      ).toBe(true);
    });

    it("matches date with YYYY-MM (month precision)", () => {
      expect(
        evalCondition(
          { field: "date", op: "is", value: "2024-03", type: "date" },
          { date: 20240315 },
        ),
      ).toBe(true);
    });

    it("matches date with YYYY (year precision)", () => {
      expect(
        evalCondition({ field: "date", op: "is", value: "2024", type: "date" }, { date: 20240315 }),
      ).toBe(true);
    });

    it("does not match different date month", () => {
      expect(
        evalCondition(
          { field: "date", op: "is", value: "2024-04", type: "date" },
          { date: 20240315 },
        ),
      ).toBe(false);
    });
  });

  // ── isNot ──

  describe("isNot operator", () => {
    it("returns true for different strings", () => {
      expect(
        evalCondition({ field: "notes", op: "isNot", value: "groceries" }, { notes: "pharmacy" }),
      ).toBe(true);
    });

    it("returns false for matching strings (case-insensitive)", () => {
      expect(
        evalCondition({ field: "notes", op: "isNot", value: "groceries" }, { notes: "Groceries" }),
      ).toBe(false);
    });

    it("works with numbers", () => {
      expect(
        evalCondition(
          { field: "amount", op: "isNot", value: 100, type: "number" },
          { amount: 200 },
        ),
      ).toBe(true);
    });
  });

  // ── contains / doesNotContain ──

  describe("contains operator", () => {
    it("matches substring case-insensitively", () => {
      expect(
        evalCondition(
          { field: "notes", op: "contains", value: "groc" },
          { notes: "Weekly Groceries" },
        ),
      ).toBe(true);
    });

    it("returns false when substring not found", () => {
      expect(
        evalCondition(
          { field: "notes", op: "contains", value: "pharmacy" },
          { notes: "Weekly Groceries" },
        ),
      ).toBe(false);
    });
  });

  describe("doesNotContain operator", () => {
    it("returns true when substring not found", () => {
      expect(
        evalCondition(
          { field: "notes", op: "doesNotContain", value: "pharmacy" },
          { notes: "Weekly Groceries" },
        ),
      ).toBe(true);
    });

    it("returns false when substring found", () => {
      expect(
        evalCondition(
          { field: "notes", op: "doesNotContain", value: "groc" },
          { notes: "Weekly Groceries" },
        ),
      ).toBe(false);
    });
  });

  // ── matches ──

  describe("matches operator", () => {
    it("matches regex pattern", () => {
      expect(
        evalCondition(
          { field: "notes", op: "matches", value: "^Weekly.*" },
          { notes: "Weekly Groceries" },
        ),
      ).toBe(true);
    });

    it("returns false for non-matching regex", () => {
      expect(
        evalCondition(
          { field: "notes", op: "matches", value: "^Daily.*" },
          { notes: "Weekly Groceries" },
        ),
      ).toBe(false);
    });

    it("returns false for invalid regex", () => {
      expect(
        evalCondition({ field: "notes", op: "matches", value: "[invalid" }, { notes: "test" }),
      ).toBe(false);
    });
  });

  // ── oneOf / notOneOf ──

  describe("oneOf operator", () => {
    it("matches when value is in array", () => {
      expect(
        evalCondition(
          { field: "category", op: "oneOf", value: ["cat-1", "cat-2", "cat-3"], type: "id" },
          { category: "cat-2" },
        ),
      ).toBe(true);
    });

    it("matches case-insensitively", () => {
      expect(
        evalCondition(
          { field: "category", op: "oneOf", value: ["CAT-1", "CAT-2"], type: "id" },
          { category: "cat-1" },
        ),
      ).toBe(true);
    });

    it("returns false when value not in array", () => {
      expect(
        evalCondition(
          { field: "category", op: "oneOf", value: ["cat-1", "cat-2"], type: "id" },
          { category: "cat-99" },
        ),
      ).toBe(false);
    });

    it("returns false when field is null", () => {
      expect(
        evalCondition(
          { field: "category", op: "oneOf", value: ["cat-1"], type: "id" },
          { category: null },
        ),
      ).toBe(false);
    });
  });

  describe("notOneOf operator", () => {
    it("returns true when value not in array", () => {
      expect(
        evalCondition(
          { field: "category", op: "notOneOf", value: ["cat-1", "cat-2"], type: "id" },
          { category: "cat-99" },
        ),
      ).toBe(true);
    });

    it("returns false when value is in array", () => {
      expect(
        evalCondition(
          { field: "category", op: "notOneOf", value: ["cat-1", "cat-2"], type: "id" },
          { category: "cat-1" },
        ),
      ).toBe(false);
    });
  });

  // ── isapprox ──

  describe("isapprox operator", () => {
    it("matches within 7.5% threshold for numbers", () => {
      // 1000 * 0.075 = 75, so 930 to 1070 should match
      expect(
        evalCondition(
          { field: "amount", op: "isapprox", value: 1000, type: "number" },
          { amount: 1070 },
        ),
      ).toBe(true);
    });

    it("does not match outside 7.5% threshold", () => {
      expect(
        evalCondition(
          { field: "amount", op: "isapprox", value: 1000, type: "number" },
          { amount: 1080 },
        ),
      ).toBe(false);
    });

    it("matches approximate dates within ±2 days", () => {
      expect(
        evalCondition(
          { field: "date", op: "isapprox", value: "2024-03-15", type: "date" },
          { date: 20240317 },
        ),
      ).toBe(true);
    });

    it("does not match dates outside ±2 days", () => {
      expect(
        evalCondition(
          { field: "date", op: "isapprox", value: "2024-03-15", type: "date" },
          { date: 20240320 },
        ),
      ).toBe(false);
    });
  });

  // ── isbetween ──

  describe("isbetween operator", () => {
    it("matches value within range", () => {
      expect(
        evalCondition(
          {
            field: "amount",
            op: "isbetween",
            value: { num1: -10000, num2: -5000 },
            type: "number",
          },
          { amount: -7500 },
        ),
      ).toBe(true);
    });

    it("matches boundary values (inclusive)", () => {
      expect(
        evalCondition(
          { field: "amount", op: "isbetween", value: { num1: 100, num2: 200 }, type: "number" },
          { amount: 100 },
        ),
      ).toBe(true);
    });

    it("handles reversed range (num2 < num1)", () => {
      expect(
        evalCondition(
          { field: "amount", op: "isbetween", value: { num1: 200, num2: 100 }, type: "number" },
          { amount: 150 },
        ),
      ).toBe(true);
    });

    it("does not match outside range", () => {
      expect(
        evalCondition(
          { field: "amount", op: "isbetween", value: { num1: 100, num2: 200 }, type: "number" },
          { amount: 300 },
        ),
      ).toBe(false);
    });
  });

  // ── Comparison operators ──

  describe("gt/gte/lt/lte operators", () => {
    it("gt matches greater values", () => {
      expect(
        evalCondition({ field: "amount", op: "gt", value: 100, type: "number" }, { amount: 200 }),
      ).toBe(true);
    });

    it("gt does not match equal values", () => {
      expect(
        evalCondition({ field: "amount", op: "gt", value: 100, type: "number" }, { amount: 100 }),
      ).toBe(false);
    });

    it("gte matches equal values", () => {
      expect(
        evalCondition({ field: "amount", op: "gte", value: 100, type: "number" }, { amount: 100 }),
      ).toBe(true);
    });

    it("lt matches lesser values", () => {
      expect(
        evalCondition({ field: "amount", op: "lt", value: 100, type: "number" }, { amount: 50 }),
      ).toBe(true);
    });

    it("lte matches equal values", () => {
      expect(
        evalCondition({ field: "amount", op: "lte", value: 100, type: "number" }, { amount: 100 }),
      ).toBe(true);
    });

    it("gt works with dates", () => {
      expect(
        evalCondition(
          { field: "date", op: "gt", value: "2024-03-15", type: "date" },
          { date: 20240320 },
        ),
      ).toBe(true);
    });

    it("lt works with dates", () => {
      expect(
        evalCondition(
          { field: "date", op: "lt", value: "2024-03-15", type: "date" },
          { date: 20240310 },
        ),
      ).toBe(true);
    });
  });

  // ── hasTags ──

  describe("hasTags operator", () => {
    it("matches when tag is present in notes", () => {
      expect(
        evalCondition(
          { field: "notes", op: "hasTags", value: "#groceries" },
          { notes: "Weekly shopping #groceries at store" },
        ),
      ).toBe(true);
    });

    it("does not match when tag is absent", () => {
      expect(
        evalCondition(
          { field: "notes", op: "hasTags", value: "#pharmacy" },
          { notes: "Weekly shopping #groceries" },
        ),
      ).toBe(false);
    });
  });

  // ── Field mapping ──

  describe("field name mapping", () => {
    it("maps account → acct", () => {
      expect(
        evalCondition(
          { field: "account", op: "is", value: "acc-1", type: "id" },
          { acct: "acc-1" },
        ),
      ).toBe(true);
    });

    it("maps payee → description", () => {
      expect(
        evalCondition(
          { field: "payee", op: "is", value: "payee-1", type: "id" },
          { description: "payee-1" },
        ),
      ).toBe(true);
    });

    it("maps imported_payee → imported_description", () => {
      expect(
        evalCondition(
          { field: "imported_payee", op: "contains", value: "walmart" },
          { imported_description: "WALMART SUPERCENTER #123" },
        ),
      ).toBe(true);
    });
  });

  // ── Null / undefined handling ──

  describe("null and undefined handling", () => {
    it("treats null string fields as empty string", () => {
      expect(evalCondition({ field: "notes", op: "is", value: "" }, { notes: null })).toBe(true);
    });

    it("returns false for undefined non-string fields", () => {
      expect(evalCondition({ field: "amount", op: "is", value: 100, type: "number" }, {})).toBe(
        false,
      );
    });
  });

  // ── Number inflow/outflow ──

  describe("number inflow/outflow options", () => {
    it("outflow negates positive values and rejects positives", () => {
      // outflow = expenses (negative amounts); if amount > 0, condition fails
      expect(
        evalCondition(
          { field: "amount", op: "is", value: 5000, type: "number", options: { outflow: true } },
          { amount: -5000 },
        ),
      ).toBe(true);
    });

    it("outflow rejects positive amounts", () => {
      expect(
        evalCondition(
          { field: "amount", op: "is", value: 5000, type: "number", options: { outflow: true } },
          { amount: 5000 },
        ),
      ).toBe(false);
    });

    it("inflow rejects negative amounts", () => {
      expect(
        evalCondition(
          { field: "amount", op: "is", value: 5000, type: "number", options: { inflow: true } },
          { amount: -5000 },
        ),
      ).toBe(false);
    });

    it("inflow accepts positive amounts", () => {
      expect(
        evalCondition(
          { field: "amount", op: "is", value: 5000, type: "number", options: { inflow: true } },
          { amount: 5000 },
        ),
      ).toBe(true);
    });
  });
});

// ── execAction ──

describe("execAction", () => {
  it("set action maps field names and sets value", () => {
    const txn: Record<string, unknown> = { acct: "acc-1", category: null };
    execAction({ op: "set", field: "category", value: "cat-1" }, txn);
    expect(txn.category).toBe("cat-1");
  });

  it("set action maps payee → description", () => {
    const txn: Record<string, unknown> = { description: null };
    execAction({ op: "set", field: "payee", value: "payee-1" }, txn);
    expect(txn.description).toBe("payee-1");
  });

  it("link-schedule sets schedule field", () => {
    const txn: Record<string, unknown> = {};
    execAction({ op: "link-schedule", value: "sched-1" }, txn);
    expect(txn.schedule).toBe("sched-1");
  });

  it("prepend-notes adds text before existing notes", () => {
    const txn: Record<string, unknown> = { notes: "existing" };
    execAction({ op: "prepend-notes", value: "prefix: " }, txn);
    expect(txn.notes).toBe("prefix: existing");
  });

  it("prepend-notes sets notes when empty", () => {
    const txn: Record<string, unknown> = {};
    execAction({ op: "prepend-notes", value: "new note" }, txn);
    expect(txn.notes).toBe("new note");
  });

  it("append-notes adds text after existing notes", () => {
    const txn: Record<string, unknown> = { notes: "existing" };
    execAction({ op: "append-notes", value: " (auto)" }, txn);
    expect(txn.notes).toBe("existing (auto)");
  });

  it("append-notes sets notes when empty", () => {
    const txn: Record<string, unknown> = {};
    execAction({ op: "append-notes", value: "new note" }, txn);
    expect(txn.notes).toBe("new note");
  });

  it("delete-transaction sets tombstone", () => {
    const txn: Record<string, unknown> = {};
    execAction({ op: "delete-transaction", value: "" }, txn);
    expect(txn.tombstone).toBe(1);
  });

  it("set-split-amount with fixed-amount sets amount", () => {
    const txn: Record<string, unknown> = { amount: -10000 };
    execAction({ op: "set-split-amount", value: -5000, options: { method: "fixed-amount" } }, txn);
    expect(txn.amount).toBe(-5000);
  });
});

// ── evalConditions ──

describe("evalConditions", () => {
  const makeRule = (
    conditions: ParsedRule["conditions"],
    conditionsOp: "and" | "or" = "and",
  ): ParsedRule => ({
    id: "r1",
    stage: null,
    conditions,
    actions: [],
    conditionsOp,
  });

  it("returns false for empty conditions", () => {
    expect(evalConditions(makeRule([]), { notes: "test" })).toBe(false);
  });

  it("AND: requires all conditions to match", () => {
    const rule = makeRule([
      { field: "notes", op: "contains", value: "grocery" },
      { field: "amount", op: "lt", value: 0, type: "number" },
    ]);
    expect(evalConditions(rule, { notes: "grocery store", amount: -5000 })).toBe(true);
    expect(evalConditions(rule, { notes: "grocery store", amount: 5000 })).toBe(false);
  });

  it("OR: requires at least one condition to match", () => {
    const rule = makeRule(
      [
        { field: "notes", op: "contains", value: "grocery" },
        { field: "notes", op: "contains", value: "supermarket" },
      ],
      "or",
    );
    expect(evalConditions(rule, { notes: "at the supermarket" })).toBe(true);
    expect(evalConditions(rule, { notes: "pharmacy" })).toBe(false);
  });
});

// ── applyRule ──

describe("applyRule", () => {
  it("returns original transaction when conditions do not match", () => {
    const rule: ParsedRule = {
      id: "r1",
      stage: null,
      conditions: [{ field: "notes", op: "is", value: "groceries" }],
      actions: [{ op: "set", field: "category", value: "cat-food" }],
      conditionsOp: "and",
    };
    const txn = { notes: "pharmacy", category: null };
    const result = applyRule(rule, txn);
    expect(result).toBe(txn); // same reference
  });

  it("returns modified transaction when conditions match", () => {
    const rule: ParsedRule = {
      id: "r1",
      stage: null,
      conditions: [{ field: "notes", op: "contains", value: "grocery" }],
      actions: [{ op: "set", field: "category", value: "cat-food" }],
      conditionsOp: "and",
    };
    const txn = { notes: "grocery store", category: null };
    const result = applyRule(rule, txn);
    expect(result).not.toBe(txn); // new object
    expect(result.category).toBe("cat-food");
    expect(result.notes).toBe("grocery store");
  });

  it("applies multiple actions sequentially", () => {
    const rule: ParsedRule = {
      id: "r1",
      stage: null,
      conditions: [{ field: "amount", op: "lt", value: 0, type: "number" }],
      actions: [
        { op: "set", field: "category", value: "cat-expense" },
        { op: "append-notes", value: " [auto-categorized]" },
      ],
      conditionsOp: "and",
    };
    const result = applyRule(rule, { amount: -5000, notes: "purchase" });
    expect(result.category).toBe("cat-expense");
    expect(result.notes).toBe("purchase [auto-categorized]");
  });
});

// ── rankRules ──

describe("rankRules", () => {
  const makeRule = (
    id: string,
    stage: ParsedRule["stage"],
    conditions: ParsedRule["conditions"],
  ): ParsedRule => ({
    id,
    stage,
    conditions,
    actions: [],
    conditionsOp: "and",
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

  it("sorts higher specificity score first within same stage", () => {
    const rules = [
      makeRule("low", null, [{ field: "notes", op: "contains", value: "x" }]), // score 0
      makeRule("high", null, [{ field: "notes", op: "is", value: "x" }]), // score 10 * 2 = 20
      makeRule("mid", null, [{ field: "amount", op: "gt", value: 0, type: "number" }]), // score 1
    ];
    const ranked = rankRules(rules);
    expect(ranked.map((r) => r.id)).toEqual(["high", "mid", "low"]);
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
        { field: "amount", op: "gt", value: 0, type: "number" },
      ]),
      // all high-priority: is(10) + isNot(10) = 20 * 2 = 40
      makeRule("allhigh", null, [
        { field: "notes", op: "is", value: "x" },
        { field: "category", op: "isNot", value: "cat-1", type: "id" },
      ]),
    ];
    const ranked = rankRules(rules);
    expect(ranked[0].id).toBe("allhigh");
  });
});

// ── runRules ──

describe("runRules", () => {
  it("applies multiple rules in ranked order", () => {
    const rules: ParsedRule[] = [
      {
        id: "r-categorize",
        stage: null,
        conditions: [{ field: "notes", op: "contains", value: "grocery" }],
        actions: [{ op: "set", field: "category", value: "cat-food" }],
        conditionsOp: "and",
      },
      {
        id: "r-rename",
        stage: "pre",
        conditions: [{ field: "imported_payee", op: "contains", value: "walmart" }],
        actions: [{ op: "set", field: "payee", value: "payee-walmart" }],
        conditionsOp: "and",
      },
    ];

    const txn = {
      imported_description: "WALMART SUPERCENTER",
      description: null,
      notes: "grocery run",
      category: null,
    };

    const result = runRules(rules, txn);

    // pre-stage rename runs first
    expect(result.description).toBe("payee-walmart");
    // then normal categorize
    expect(result.category).toBe("cat-food");
  });

  it("later rules see changes from earlier rules", () => {
    const rules: ParsedRule[] = [
      {
        id: "r1",
        stage: null,
        conditions: [{ field: "notes", op: "is", value: "" }],
        actions: [{ op: "set", field: "notes", value: "auto-note" }],
        conditionsOp: "and",
      },
      {
        id: "r2",
        stage: "post",
        conditions: [{ field: "notes", op: "contains", value: "auto" }],
        actions: [{ op: "append-notes", value: " [processed]" }],
        conditionsOp: "and",
      },
    ];

    const result = runRules(rules, { notes: null });
    expect(result.notes).toBe("auto-note [processed]");
  });

  it("does not modify original transaction", () => {
    const rules: ParsedRule[] = [
      {
        id: "r1",
        stage: null,
        conditions: [{ field: "amount", op: "lt", value: 0, type: "number" }],
        actions: [{ op: "set", field: "category", value: "cat-1" }],
        conditionsOp: "and",
      },
    ];

    const txn = { amount: -5000, category: null };
    runRules(rules, txn);
    expect(txn.category).toBeNull();
  });
});
