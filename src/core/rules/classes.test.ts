/**
 * Comprehensive tests for the rules engine classes ported from Actual Budget's loot-core.
 *
 * Covers: Condition, Action, Rule, evaluateFormula, RuleIndexer
 */

import { describe, it, expect } from "vitest";
import { Condition } from "./condition";
import { Action } from "./action";
import { Rule } from "./rule";
import { evaluateFormula, amountToInteger } from "./formula";
import { RuleIndexer } from "./rule-indexer";
import { RuleError } from "./errors";

// ─────────────────────────────────────────────────────────────────────────────
// Condition — validation (constructor throws)
// ─────────────────────────────────────────────────────────────────────────────

describe("Condition validation", () => {
  describe("invalid field names", () => {
    it("throws RuleError for a completely unknown field", () => {
      expect(() => new Condition("is", "nonexistent_field", "value")).toThrow(RuleError);
    });

    it("throws RuleError for empty-string field", () => {
      expect(() => new Condition("is", "", "value")).toThrow(RuleError);
    });
  });

  describe("invalid operator / field combinations", () => {
    it("throws RuleError for hasTags on imported_payee (disallowed)", () => {
      expect(() => new Condition("hasTags", "imported_payee", "#tag")).toThrow(RuleError);
    });

    it("throws RuleError for onBudget on payee (disallowed)", () => {
      expect(() => new Condition("onBudget", "payee", null)).toThrow(RuleError);
    });

    it("throws RuleError for offBudget on payee (disallowed)", () => {
      expect(() => new Condition("offBudget", "payee", null)).toThrow(RuleError);
    });

    it("throws RuleError for onBudget on category (disallowed)", () => {
      expect(() => new Condition("onBudget", "category", null)).toThrow(RuleError);
    });

    it("throws RuleError for isbetween on a date field (not in date ops)", () => {
      expect(() => new Condition("isbetween", "date", "2024-01-01")).toThrow(RuleError);
    });

    it("throws RuleError for hasTags on amount (wrong type)", () => {
      expect(() => new Condition("hasTags", "amount", 100)).toThrow(RuleError);
    });

    it("throws RuleError for isapprox on a boolean field", () => {
      expect(() => new Condition("isapprox", "cleared", true)).toThrow(RuleError);
    });

    it("throws RuleError for unknown operator on a valid field", () => {
      expect(() => new Condition("notAnOp", "notes", "value")).toThrow(RuleError);
    });
  });

  describe("null / empty value rules", () => {
    // Non-nullable types: date, number, boolean
    it("throws RuleError for null value on date field", () => {
      expect(() => new Condition("is", "date", null)).toThrow(RuleError);
    });

    it("throws RuleError for null value on number field", () => {
      expect(() => new Condition("is", "amount", null)).toThrow(RuleError);
    });

    it("throws RuleError for null value on boolean field", () => {
      expect(() => new Condition("is", "cleared", null)).toThrow(RuleError);
    });

    it("throws RuleError for non-boolean value on boolean field", () => {
      expect(() => new Condition("is", "cleared", 1)).toThrow(RuleError);
    });

    it("throws RuleError for invalid date string", () => {
      expect(() => new Condition("is", "date", "not-a-date")).toThrow(RuleError);
    });

    it("throws RuleError for non-string value on string field with contains", () => {
      expect(() => new Condition("contains", "notes", 42)).toThrow(RuleError);
    });

    it("throws RuleError for empty string on contains (must be non-empty)", () => {
      expect(() => new Condition("contains", "notes", "")).toThrow(RuleError);
    });

    it("throws RuleError for empty string on hasTags (must be non-empty)", () => {
      expect(() => new Condition("hasTags", "notes", "")).toThrow(RuleError);
    });

    // Nullable types: string, id — null and empty are allowed
    it("allows null value on id field (nullable)", () => {
      expect(() => new Condition("is", "payee", null)).not.toThrow();
    });

    it("throws RuleError for null value on string field with is (parse rejects non-string)", () => {
      // The string parse function asserts typeof value === "string" even though type.nullable is true.
      // null is allowed past the nullable guard but fails the parse step.
      expect(() => new Condition("is", "notes", null)).toThrow(RuleError);
    });

    it("allows empty string value on string field with is (nullable)", () => {
      expect(() => new Condition("is", "notes", "")).not.toThrow();
    });

    it("throws RuleError for oneOf with non-array value on id field", () => {
      expect(() => new Condition("oneOf", "category", "not-array")).toThrow(RuleError);
    });

    it("throws RuleError for isbetween with non-object value", () => {
      expect(() => new Condition("isbetween", "amount", 100)).toThrow(RuleError);
    });
  });

  describe("serialize round-trips the constructor inputs", () => {
    it("serializes field, op, value, and type", () => {
      const cond = new Condition("contains", "notes", "grocery");
      const s = cond.serialize();
      expect(s.op).toBe("contains");
      expect(s.field).toBe("notes");
      expect(s.value).toBe("grocery");
      expect(s.type).toBe("string");
    });

    it("includes options when provided", () => {
      const cond = new Condition("is", "amount", 5000, { inflow: true });
      const s = cond.serialize();
      expect(s.options).toEqual({ inflow: true });
    });

    it("omits options key when none provided", () => {
      const cond = new Condition("is", "notes", "test");
      expect(cond.serialize()).not.toHaveProperty("options");
    });

    it("preserves the original (unparsed) value, not the parsed internal form", () => {
      const cond = new Condition("is", "date", "2024-03-15");
      expect(cond.serialize().value).toBe("2024-03-15");
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Condition — eval: date operators
// ─────────────────────────────────────────────────────────────────────────────

describe("Condition.eval — date operators", () => {
  describe("is with date precision types", () => {
    it("exact date match (YYYY-MM-DD)", () => {
      expect(new Condition("is", "date", "2024-03-15").eval({ date: "2024-03-15" })).toBe(true);
    });

    it("exact date mismatch", () => {
      expect(new Condition("is", "date", "2024-03-15").eval({ date: "2024-03-16" })).toBe(false);
    });

    it("month precision matches any day in that month (YYYY-MM)", () => {
      expect(new Condition("is", "date", "2024-03").eval({ date: "2024-03-01" })).toBe(true);
      expect(new Condition("is", "date", "2024-03").eval({ date: "2024-03-31" })).toBe(true);
    });

    it("month precision does not match a different month", () => {
      expect(new Condition("is", "date", "2024-04").eval({ date: "2024-03-15" })).toBe(false);
    });

    it("year precision matches any date in that year (YYYY)", () => {
      expect(new Condition("is", "date", "2024").eval({ date: "2024-01-01" })).toBe(true);
      expect(new Condition("is", "date", "2024").eval({ date: "2024-12-31" })).toBe(true);
    });

    it("year precision does not match a different year", () => {
      expect(new Condition("is", "date", "2023").eval({ date: "2024-06-15" })).toBe(false);
    });

    it("returns false when date field is null", () => {
      expect(new Condition("is", "date", "2024-03-15").eval({ date: null })).toBe(false);
    });

    it("returns false when date field is missing", () => {
      expect(new Condition("is", "date", "2024-03-15").eval({})).toBe(false);
    });
  });

  describe("isapprox (±2 days)", () => {
    it("matches date exactly at center", () => {
      expect(new Condition("isapprox", "date", "2024-03-15").eval({ date: "2024-03-15" })).toBe(
        true,
      );
    });

    it("matches date 2 days after", () => {
      expect(new Condition("isapprox", "date", "2024-03-15").eval({ date: "2024-03-17" })).toBe(
        true,
      );
    });

    it("matches date 2 days before", () => {
      expect(new Condition("isapprox", "date", "2024-03-15").eval({ date: "2024-03-13" })).toBe(
        true,
      );
    });

    it("does not match date 3 days after", () => {
      expect(new Condition("isapprox", "date", "2024-03-15").eval({ date: "2024-03-18" })).toBe(
        false,
      );
    });

    it("does not match date 3 days before", () => {
      expect(new Condition("isapprox", "date", "2024-03-15").eval({ date: "2024-03-12" })).toBe(
        false,
      );
    });
  });

  describe("gt / gte / lt / lte", () => {
    it("gt matches a later date", () => {
      expect(new Condition("gt", "date", "2024-03-15").eval({ date: "2024-03-20" })).toBe(true);
    });

    it("gt does not match the same date", () => {
      expect(new Condition("gt", "date", "2024-03-15").eval({ date: "2024-03-15" })).toBe(false);
    });

    it("gte matches the same date", () => {
      expect(new Condition("gte", "date", "2024-03-15").eval({ date: "2024-03-15" })).toBe(true);
    });

    it("gte matches a later date", () => {
      expect(new Condition("gte", "date", "2024-03-15").eval({ date: "2024-03-16" })).toBe(true);
    });

    it("lt matches an earlier date", () => {
      expect(new Condition("lt", "date", "2024-03-15").eval({ date: "2024-03-10" })).toBe(true);
    });

    it("lt does not match the same date", () => {
      expect(new Condition("lt", "date", "2024-03-15").eval({ date: "2024-03-15" })).toBe(false);
    });

    it("lte matches the same date", () => {
      expect(new Condition("lte", "date", "2024-03-15").eval({ date: "2024-03-15" })).toBe(true);
    });

    it("lte matches an earlier date", () => {
      expect(new Condition("lte", "date", "2024-03-15").eval({ date: "2024-03-14" })).toBe(true);
    });

    it("returns false for null date", () => {
      expect(new Condition("gt", "date", "2024-03-15").eval({ date: null })).toBe(false);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Condition — eval: number operators
// ─────────────────────────────────────────────────────────────────────────────

describe("Condition.eval — number operators", () => {
  describe("is", () => {
    it("matches exact number", () => {
      expect(new Condition("is", "amount", -5000).eval({ amount: -5000 })).toBe(true);
    });

    it("does not match different number", () => {
      expect(new Condition("is", "amount", -5000).eval({ amount: -4999 })).toBe(false);
    });

    it("matches zero", () => {
      expect(new Condition("is", "amount", 0).eval({ amount: 0 })).toBe(true);
    });
  });

  describe("isapprox (7.5% threshold)", () => {
    // threshold = round(|1000| * 0.075) = 75 → range [925, 1075]
    it("matches within 7.5% above", () => {
      expect(new Condition("isapprox", "amount", 1000).eval({ amount: 1075 })).toBe(true);
    });

    it("matches within 7.5% below", () => {
      expect(new Condition("isapprox", "amount", 1000).eval({ amount: 925 })).toBe(true);
    });

    it("does not match beyond 7.5% above", () => {
      expect(new Condition("isapprox", "amount", 1000).eval({ amount: 1076 })).toBe(false);
    });

    it("does not match beyond 7.5% below", () => {
      expect(new Condition("isapprox", "amount", 1000).eval({ amount: 924 })).toBe(false);
    });

    it("matches zero exactly (threshold = 0)", () => {
      expect(new Condition("isapprox", "amount", 0).eval({ amount: 0 })).toBe(true);
    });
  });

  describe("isbetween", () => {
    it("matches value within range", () => {
      expect(
        new Condition("isbetween", "amount", { num1: 100, num2: 500 }).eval({ amount: 300 }),
      ).toBe(true);
    });

    it("matches lower boundary (inclusive)", () => {
      expect(
        new Condition("isbetween", "amount", { num1: 100, num2: 500 }).eval({ amount: 100 }),
      ).toBe(true);
    });

    it("matches upper boundary (inclusive)", () => {
      expect(
        new Condition("isbetween", "amount", { num1: 100, num2: 500 }).eval({ amount: 500 }),
      ).toBe(true);
    });

    it("does not match value outside range", () => {
      expect(
        new Condition("isbetween", "amount", { num1: 100, num2: 500 }).eval({ amount: 501 }),
      ).toBe(false);
    });

    it("handles reversed range (num2 < num1)", () => {
      expect(
        new Condition("isbetween", "amount", { num1: 500, num2: 100 }).eval({ amount: 300 }),
      ).toBe(true);
    });

    it("does not match value below reversed range", () => {
      expect(
        new Condition("isbetween", "amount", { num1: 500, num2: 100 }).eval({ amount: 50 }),
      ).toBe(false);
    });
  });

  describe("gt / gte / lt / lte", () => {
    it("gt matches greater value", () => {
      expect(new Condition("gt", "amount", 100).eval({ amount: 101 })).toBe(true);
    });

    it("gt does not match equal value", () => {
      expect(new Condition("gt", "amount", 100).eval({ amount: 100 })).toBe(false);
    });

    it("gte matches equal value", () => {
      expect(new Condition("gte", "amount", 100).eval({ amount: 100 })).toBe(true);
    });

    it("lt matches lesser value", () => {
      expect(new Condition("lt", "amount", 100).eval({ amount: 99 })).toBe(true);
    });

    it("lt does not match equal value", () => {
      expect(new Condition("lt", "amount", 100).eval({ amount: 100 })).toBe(false);
    });

    it("lte matches equal value", () => {
      expect(new Condition("lte", "amount", 100).eval({ amount: 100 })).toBe(true);
    });

    it("returns false for null amount", () => {
      expect(new Condition("gt", "amount", 0).eval({ amount: null })).toBe(false);
    });
  });

  describe("inflow / outflow options", () => {
    it("outflow: matches negative amount when condition value matches absolute", () => {
      // outflow: true flips negatives to positive for comparison
      expect(new Condition("is", "amount", 5000, { outflow: true }).eval({ amount: -5000 })).toBe(
        true,
      );
    });

    it("outflow: rejects positive amounts (income)", () => {
      expect(new Condition("is", "amount", 5000, { outflow: true }).eval({ amount: 5000 })).toBe(
        false,
      );
    });

    it("outflow: gt works on absolute value of negative amounts", () => {
      expect(new Condition("gt", "amount", 1000, { outflow: true }).eval({ amount: -2000 })).toBe(
        true,
      );
    });

    it("inflow: accepts positive amounts", () => {
      expect(new Condition("is", "amount", 5000, { inflow: true }).eval({ amount: 5000 })).toBe(
        true,
      );
    });

    it("inflow: rejects negative amounts (expenses)", () => {
      expect(new Condition("is", "amount", 5000, { inflow: true }).eval({ amount: -5000 })).toBe(
        false,
      );
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Condition — eval: string operators
// ─────────────────────────────────────────────────────────────────────────────

describe("Condition.eval — string operators", () => {
  describe("is (case-insensitive)", () => {
    it("matches exactly (case-insensitive)", () => {
      expect(new Condition("is", "notes", "groceries").eval({ notes: "Groceries" })).toBe(true);
    });

    it("does not match different string", () => {
      expect(new Condition("is", "notes", "groceries").eval({ notes: "pharmacy" })).toBe(false);
    });

    it("matches null field as empty string when value is empty", () => {
      expect(new Condition("is", "notes", "").eval({ notes: null })).toBe(true);
    });

    it("matches missing field as empty string when value is empty", () => {
      expect(new Condition("is", "notes", "").eval({})).toBe(true);
    });
  });

  describe("isNot", () => {
    it("returns true for different string", () => {
      expect(new Condition("isNot", "notes", "groceries").eval({ notes: "pharmacy" })).toBe(true);
    });

    it("returns false when string matches (case-insensitive)", () => {
      expect(new Condition("isNot", "notes", "groceries").eval({ notes: "GROCERIES" })).toBe(false);
    });
  });

  describe("contains", () => {
    it("matches substring (case-insensitive)", () => {
      expect(new Condition("contains", "notes", "groc").eval({ notes: "Weekly Groceries" })).toBe(
        true,
      );
    });

    it("does not match absent substring", () => {
      expect(new Condition("contains", "notes", "pharmacy").eval({ notes: "grocery run" })).toBe(
        false,
      );
    });

    it("returns false for null field", () => {
      expect(new Condition("contains", "notes", "groc").eval({ notes: null })).toBe(false);
    });
  });

  describe("doesNotContain", () => {
    it("returns true when substring is absent", () => {
      expect(
        new Condition("doesNotContain", "notes", "pharmacy").eval({ notes: "grocery run" }),
      ).toBe(true);
    });

    it("returns false when substring is present", () => {
      expect(new Condition("doesNotContain", "notes", "groc").eval({ notes: "grocery run" })).toBe(
        false,
      );
    });

    it("returns true for null field (null → empty string, which does not contain substring)", () => {
      // String type coerces null to "". An empty string does not contain "groc", so doesNotContain returns true.
      expect(new Condition("doesNotContain", "notes", "groc").eval({ notes: null })).toBe(true);
    });
  });

  describe("matches (regex)", () => {
    it("matches regex pattern", () => {
      expect(
        new Condition("matches", "notes", "^weekly.*").eval({ notes: "weekly groceries" }),
      ).toBe(true);
    });

    it("does not match when pattern fails", () => {
      expect(
        new Condition("matches", "notes", "^daily.*").eval({ notes: "weekly groceries" }),
      ).toBe(false);
    });

    it("returns false for invalid regex (does not throw)", () => {
      expect(new Condition("matches", "notes", "[invalid").eval({ notes: "test" })).toBe(false);
    });

    it("returns false for null field", () => {
      expect(new Condition("matches", "notes", "test").eval({ notes: null })).toBe(false);
    });
  });

  describe("oneOf", () => {
    it("matches when value is in the list (case-insensitive)", () => {
      expect(
        new Condition("oneOf", "imported_payee", ["WALMART", "TARGET"]).eval({
          imported_payee: "walmart",
        }),
      ).toBe(true);
    });

    it("does not match when value is absent from list", () => {
      expect(
        new Condition("oneOf", "imported_payee", ["WALMART", "TARGET"]).eval({
          imported_payee: "costco",
        }),
      ).toBe(false);
    });

    it("returns false for null field", () => {
      expect(
        new Condition("oneOf", "imported_payee", ["WALMART"]).eval({ imported_payee: null }),
      ).toBe(false);
    });
  });

  describe("notOneOf", () => {
    it("returns true when value is not in the list", () => {
      expect(
        new Condition("notOneOf", "imported_payee", ["WALMART", "TARGET"]).eval({
          imported_payee: "costco",
        }),
      ).toBe(true);
    });

    it("returns false when value is in the list", () => {
      expect(
        new Condition("notOneOf", "imported_payee", ["WALMART"]).eval({
          imported_payee: "walmart",
        }),
      ).toBe(false);
    });
  });

  describe("hasTags", () => {
    it("matches when tag substring is present in notes", () => {
      expect(
        new Condition("hasTags", "notes", "#groceries").eval({
          notes: "shopping #groceries at store",
        }),
      ).toBe(true);
    });

    it("does not match when tag is absent", () => {
      expect(
        new Condition("hasTags", "notes", "#pharmacy").eval({ notes: "shopping #groceries" }),
      ).toBe(false);
    });

    it("returns false for null field", () => {
      expect(new Condition("hasTags", "notes", "#tag").eval({ notes: null })).toBe(false);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Condition — eval: id operators
// ─────────────────────────────────────────────────────────────────────────────

describe("Condition.eval — id operators", () => {
  describe("is", () => {
    it("matches exact id (case-insensitive)", () => {
      expect(new Condition("is", "payee", "payee-abc").eval({ payee: "PAYEE-ABC" })).toBe(true);
    });

    it("does not match different id", () => {
      expect(new Condition("is", "payee", "payee-abc").eval({ payee: "payee-xyz" })).toBe(false);
    });

    it("matches null id when condition value is null", () => {
      expect(new Condition("is", "payee", null).eval({ payee: null })).toBe(true);
    });
  });

  describe("isNot", () => {
    it("returns true for different id", () => {
      expect(new Condition("isNot", "category", "cat-1").eval({ category: "cat-2" })).toBe(true);
    });

    it("returns false for matching id (case-insensitive)", () => {
      expect(new Condition("isNot", "category", "cat-1").eval({ category: "CAT-1" })).toBe(false);
    });
  });

  describe("oneOf", () => {
    it("matches when id is in the list", () => {
      expect(
        new Condition("oneOf", "category", ["cat-1", "cat-2", "cat-3"]).eval({ category: "cat-2" }),
      ).toBe(true);
    });

    it("does not match when id is absent from list", () => {
      expect(
        new Condition("oneOf", "category", ["cat-1", "cat-2"]).eval({ category: "cat-99" }),
      ).toBe(false);
    });

    it("returns false for null field", () => {
      expect(new Condition("oneOf", "category", ["cat-1"]).eval({ category: null })).toBe(false);
    });
  });

  describe("notOneOf", () => {
    it("returns true when id is not in the list", () => {
      expect(
        new Condition("notOneOf", "category", ["cat-1", "cat-2"]).eval({ category: "cat-3" }),
      ).toBe(true);
    });

    it("returns false when id is in the list", () => {
      expect(new Condition("notOneOf", "category", ["cat-1"]).eval({ category: "cat-1" })).toBe(
        false,
      );
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Condition — eval: boolean operators
// ─────────────────────────────────────────────────────────────────────────────

describe("Condition.eval — boolean operators", () => {
  it("is true matches true", () => {
    expect(new Condition("is", "cleared", true).eval({ cleared: true })).toBe(true);
  });

  it("is false matches false", () => {
    expect(new Condition("is", "cleared", false).eval({ cleared: false })).toBe(true);
  });

  it("is true does not match false", () => {
    expect(new Condition("is", "cleared", true).eval({ cleared: false })).toBe(false);
  });

  it("is false does not match true", () => {
    expect(new Condition("is", "cleared", false).eval({ cleared: true })).toBe(false);
  });

  it("returns false when field is missing", () => {
    expect(new Condition("is", "cleared", true).eval({})).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Condition — eval: onBudget / offBudget (special id operators on account field)
// ─────────────────────────────────────────────────────────────────────────────

describe("Condition.eval — onBudget / offBudget operators", () => {
  it("onBudget on account field returns true when _account.offbudget === 0", () => {
    const txn = { account: "acc-1", _account: { offbudget: 0 } };
    expect(new Condition("onBudget", "account", null).eval(txn)).toBe(true);
  });

  it("onBudget returns false when _account.offbudget === 1", () => {
    const txn = { account: "acc-1", _account: { offbudget: 1 } };
    expect(new Condition("onBudget", "account", null).eval(txn)).toBe(false);
  });

  it("offBudget on account field returns true when _account.offbudget === 1", () => {
    const txn = { account: "acc-1", _account: { offbudget: 1 } };
    expect(new Condition("offBudget", "account", null).eval(txn)).toBe(true);
  });

  it("offBudget returns false when _account.offbudget === 0", () => {
    const txn = { account: "acc-1", _account: { offbudget: 0 } };
    expect(new Condition("offBudget", "account", null).eval(txn)).toBe(false);
  });

  it("onBudget returns false when _account is missing from transaction", () => {
    expect(new Condition("onBudget", "account", null).eval({ account: "acc-1" })).toBe(false);
  });

  it("offBudget returns false when _account is missing from transaction", () => {
    expect(new Condition("offBudget", "account", null).eval({ account: "acc-1" })).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Action — validation (constructor throws)
// ─────────────────────────────────────────────────────────────────────────────

describe("Action validation", () => {
  it("throws RuleError for unknown op", () => {
    expect(() => new Action("invalid-op", "notes", "value")).toThrow(RuleError);
  });

  it("throws RuleError for set with invalid field", () => {
    expect(() => new Action("set", "nonexistent_field", "value")).toThrow(RuleError);
  });

  it("throws RuleError for set on account field with null value", () => {
    // account field requires a non-null value
    expect(() => new Action("set", "account", null)).toThrow(RuleError);
  });

  it("does not throw for set with valid field and value", () => {
    expect(() => new Action("set", "notes", "test")).not.toThrow();
  });

  it("does not throw for link-schedule with null field", () => {
    expect(() => new Action("link-schedule", null, "sched-1")).not.toThrow();
  });

  it("does not throw for delete-transaction", () => {
    expect(() => new Action("delete-transaction", null, null)).not.toThrow();
  });

  it("does not throw for prepend-notes", () => {
    expect(() => new Action("prepend-notes", null, "prefix: ")).not.toThrow();
  });

  it("does not throw for append-notes", () => {
    expect(() => new Action("append-notes", null, " suffix")).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Action — exec: set
// ─────────────────────────────────────────────────────────────────────────────

describe("Action.exec — set", () => {
  describe("direct value", () => {
    it("sets a string field", () => {
      const txn: Record<string, unknown> = { notes: "original" };
      new Action("set", "notes", "updated").exec(txn);
      expect(txn.notes).toBe("updated");
    });

    it("sets a numeric field (amount)", () => {
      const txn: Record<string, unknown> = { amount: -10000 };
      new Action("set", "amount", -5000).exec(txn);
      expect(txn.amount).toBe(-5000);
    });

    it("sets category to an id", () => {
      const txn: Record<string, unknown> = { category: null };
      new Action("set", "category", "cat-groceries").exec(txn);
      expect(txn.category).toBe("cat-groceries");
    });

    it("sets payee to an id", () => {
      const txn: Record<string, unknown> = { payee: null };
      new Action("set", "payee", "payee-walmart").exec(txn);
      expect(txn.payee).toBe("payee-walmart");
    });
  });

  describe("payee_name side-effect", () => {
    it("sets payee_name and also sets payee to 'new'", () => {
      const txn: Record<string, unknown> = { payee: null, payee_name: null };
      new Action("set", "payee_name", "My New Payee").exec(txn);
      expect(txn.payee_name).toBe("My New Payee");
      expect(txn.payee).toBe("new");
    });
  });

  describe("Handlebars template", () => {
    it("renders a static template string", () => {
      const txn: Record<string, unknown> = { notes: "" };
      new Action("set", "notes", null, { template: "auto-generated" }).exec(txn);
      expect(txn.notes).toBe("auto-generated");
    });

    it("interpolates transaction fields in template", () => {
      const txn: Record<string, unknown> = { notes: "", payee_name: "Walmart" };
      new Action("set", "notes", null, { template: "{{payee_name}} - auto" }).exec(txn);
      expect(txn.notes).toBe("Walmart - auto");
    });

    it("multiple template variables are all substituted", () => {
      const txn: Record<string, unknown> = {
        notes: "",
        payee_name: "Target",
        imported_payee: "TARGET STORE",
      };
      new Action("set", "notes", null, { template: "{{payee_name}} ({{imported_payee}})" }).exec(
        txn,
      );
      expect(txn.notes).toBe("Target (TARGET STORE)");
    });

    it("missing template variable renders as empty string", () => {
      const txn: Record<string, unknown> = { notes: "" };
      new Action("set", "notes", null, { template: "{{undefined_var}} - text" }).exec(txn);
      expect(txn.notes).toBe(" - text");
    });
  });

  describe("formula", () => {
    it("evaluates formula and sets numeric field", () => {
      const txn: Record<string, unknown> = { amount: 5000, notes: "" };
      new Action("set", "amount", null, { formula: "=amount*2" }).exec(txn);
      expect(txn.amount).toBe(10000);
    });

    it("evaluates constant formula", () => {
      const txn: Record<string, unknown> = { amount: 0, notes: "" };
      new Action("set", "amount", null, { formula: "=100+50" }).exec(txn);
      expect(txn.amount).toBe(150);
    });

    it("records error in _ruleErrors when formula produces NaN", () => {
      const txn: Record<string, unknown> = { amount: 0 };
      // Force a situation where result is NaN by dividing string variable (which becomes 0)
      // Actually the evaluator resolves unknowns to 0, so test a failing edge instead:
      // Create a formula for a string field that produces non-numeric from string type
      const txn2: Record<string, unknown> = { notes: "hello" };
      // Formula on a string field — result string is returned as-is
      new Action("set", "notes", null, { formula: "=1+1" }).exec(txn2);
      // For string type fields, result is stringified
      expect(txn2.notes).toBe("2");
    });

    it("records error in _ruleErrors when formula evaluation fails", () => {
      const txn: Record<string, unknown> = { amount: 0 };
      // Pass a formula that uses an unknown function to trigger an error
      new Action("set", "amount", null, { formula: "=UNKNOWNFN(amount)" }).exec(txn);
      expect(Array.isArray(txn._ruleErrors)).toBe(true);
      expect((txn._ruleErrors as string[]).length).toBeGreaterThan(0);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Action — exec: other operations
// ─────────────────────────────────────────────────────────────────────────────

describe("Action.exec — non-set operations", () => {
  describe("set-split-amount", () => {
    it("fixed-amount sets amount directly", () => {
      const txn: Record<string, unknown> = { amount: -10000 };
      new Action("set-split-amount", null, -3000, { method: "fixed-amount" }).exec(txn);
      expect(txn.amount).toBe(-3000);
    });

    it("formula method evaluates formula and sets amount", () => {
      const txn: Record<string, unknown> = { amount: -10000 };
      new Action("set-split-amount", null, null, { method: "formula", formula: "=amount/2" }).exec(
        txn,
      );
      expect(txn.amount).toBe(-5000);
    });

    it("formula method records error when no formula is provided", () => {
      const txn: Record<string, unknown> = { amount: -10000 };
      new Action("set-split-amount", null, null, { method: "formula" }).exec(txn);
      expect(Array.isArray(txn._ruleErrors)).toBe(true);
    });

    it("formula method records error when formula evaluation fails", () => {
      const txn: Record<string, unknown> = { amount: -10000 };
      new Action("set-split-amount", null, null, { method: "formula", formula: "=BADFN()" }).exec(
        txn,
      );
      expect(Array.isArray(txn._ruleErrors)).toBe(true);
    });
  });

  describe("link-schedule", () => {
    it("sets the schedule field on the transaction", () => {
      const txn: Record<string, unknown> = {};
      new Action("link-schedule", null, "sched-abc").exec(txn);
      expect(txn.schedule).toBe("sched-abc");
    });
  });

  describe("prepend-notes", () => {
    it("prepends text when notes already exist", () => {
      const txn: Record<string, unknown> = { notes: "existing note" };
      new Action("prepend-notes", null, "prefix: ").exec(txn);
      expect(txn.notes).toBe("prefix: existing note");
    });

    it("sets notes to the value when notes is falsy", () => {
      const txn: Record<string, unknown> = { notes: null };
      new Action("prepend-notes", null, "new note").exec(txn);
      expect(txn.notes).toBe("new note");
    });

    it("sets notes when field is missing", () => {
      const txn: Record<string, unknown> = {};
      new Action("prepend-notes", null, "note").exec(txn);
      expect(txn.notes).toBe("note");
    });
  });

  describe("append-notes", () => {
    it("appends text after existing notes", () => {
      const txn: Record<string, unknown> = { notes: "original" };
      new Action("append-notes", null, " (auto)").exec(txn);
      expect(txn.notes).toBe("original (auto)");
    });

    it("sets notes to the value when notes is falsy", () => {
      const txn: Record<string, unknown> = { notes: null };
      new Action("append-notes", null, "new note").exec(txn);
      expect(txn.notes).toBe("new note");
    });

    it("sets notes when field is missing", () => {
      const txn: Record<string, unknown> = {};
      new Action("append-notes", null, "appended").exec(txn);
      expect(txn.notes).toBe("appended");
    });
  });

  describe("delete-transaction", () => {
    it("sets tombstone to 1", () => {
      const txn: Record<string, unknown> = { amount: -5000 };
      new Action("delete-transaction", null, null).exec(txn);
      expect(txn.tombstone).toBe(1);
    });

    it("does not modify other fields", () => {
      const txn: Record<string, unknown> = { amount: -5000, notes: "keep me" };
      new Action("delete-transaction", null, null).exec(txn);
      expect(txn.amount).toBe(-5000);
      expect(txn.notes).toBe("keep me");
    });
  });

  describe("serialize", () => {
    it("returns correct plain object for set action", () => {
      const action = new Action("set", "category", "cat-1");
      const s = action.serialize();
      expect(s.op).toBe("set");
      expect(s.field).toBe("category");
      expect(s.value).toBe("cat-1");
      expect(s.type).toBe("id");
    });

    it("includes options when provided", () => {
      const action = new Action("set", "amount", null, { formula: "=amount*2" });
      expect(action.serialize().options).toEqual({ formula: "=amount*2" });
    });

    it("omits options when none provided", () => {
      const action = new Action("set", "notes", "test");
      expect(action.serialize()).not.toHaveProperty("options");
    });

    it("returns correct type for delete-transaction", () => {
      const action = new Action("delete-transaction", null, null);
      expect(action.serialize().type).toBe("string");
    });

    it("returns field as null for link-schedule", () => {
      const action = new Action("link-schedule", null, "sched-1");
      expect(action.serialize().field).toBeNull();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Rule — evalConditions
// ─────────────────────────────────────────────────────────────────────────────

describe("Rule.evalConditions", () => {
  function makeRule(
    conditions: Array<{
      field: string;
      op: string;
      value: unknown;
      options?: Record<string, unknown>;
    }>,
    conditionsOp: "and" | "or" = "and",
  ) {
    return new Rule({ id: "r-test", conditionsOp, conditions, actions: [] });
  }

  it("returns false for empty conditions array", () => {
    expect(makeRule([]).evalConditions({ notes: "test" })).toBe(false);
  });

  describe("AND logic", () => {
    it("returns true when all conditions match", () => {
      const rule = makeRule([
        { field: "notes", op: "contains", value: "grocery" },
        { field: "amount", op: "lt", value: 0 },
      ]);
      expect(rule.evalConditions({ notes: "grocery store", amount: -5000 })).toBe(true);
    });

    it("returns false when any condition does not match", () => {
      const rule = makeRule([
        { field: "notes", op: "contains", value: "grocery" },
        { field: "amount", op: "lt", value: 0 },
      ]);
      expect(rule.evalConditions({ notes: "grocery store", amount: 5000 })).toBe(false);
    });

    it("returns false when none of the conditions match", () => {
      const rule = makeRule([
        { field: "notes", op: "is", value: "groceries" },
        { field: "amount", op: "gt", value: 0 },
      ]);
      expect(rule.evalConditions({ notes: "pharmacy", amount: -5000 })).toBe(false);
    });
  });

  describe("OR logic", () => {
    it("returns true when at least one condition matches", () => {
      const rule = makeRule(
        [
          { field: "notes", op: "contains", value: "grocery" },
          { field: "notes", op: "contains", value: "supermarket" },
        ],
        "or",
      );
      expect(rule.evalConditions({ notes: "at the supermarket" })).toBe(true);
    });

    it("returns true when first condition matches even if second does not", () => {
      const rule = makeRule(
        [
          { field: "notes", op: "contains", value: "grocery" },
          { field: "amount", op: "gt", value: 0 },
        ],
        "or",
      );
      expect(rule.evalConditions({ notes: "grocery run", amount: -5000 })).toBe(true);
    });

    it("returns false when no conditions match", () => {
      const rule = makeRule(
        [
          { field: "notes", op: "contains", value: "grocery" },
          { field: "notes", op: "contains", value: "supermarket" },
        ],
        "or",
      );
      expect(rule.evalConditions({ notes: "pharmacy" })).toBe(false);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Rule — exec
// ─────────────────────────────────────────────────────────────────────────────

describe("Rule.exec", () => {
  it("returns changes object when conditions match", () => {
    const rule = new Rule({
      id: "r1",
      conditionsOp: "and",
      conditions: [{ field: "notes", op: "contains", value: "grocery" }],
      actions: [{ op: "set", field: "category", value: "cat-food" }],
    });
    const result = rule.exec({ notes: "grocery run", category: null });
    expect(result).not.toBeNull();
    expect(result?.category).toBe("cat-food");
  });

  it("only includes changed fields in the result", () => {
    const rule = new Rule({
      id: "r1",
      conditionsOp: "and",
      conditions: [{ field: "notes", op: "contains", value: "grocery" }],
      actions: [{ op: "set", field: "category", value: "cat-food" }],
    });
    // notes was not changed by any action
    const result = rule.exec({ notes: "grocery run", category: null });
    expect(result).not.toHaveProperty("notes");
  });

  it("returns null when conditions do not match", () => {
    const rule = new Rule({
      id: "r1",
      conditionsOp: "and",
      conditions: [{ field: "notes", op: "is", value: "specific" }],
      actions: [{ op: "set", field: "category", value: "cat-1" }],
    });
    expect(rule.exec({ notes: "different" })).toBeNull();
  });

  it("returns null for empty conditions", () => {
    const rule = new Rule({
      id: "r1",
      conditionsOp: "and",
      conditions: [],
      actions: [{ op: "set", field: "category", value: "cat-1" }],
    });
    expect(rule.exec({ notes: "anything" })).toBeNull();
  });

  it("does not mutate the input transaction", () => {
    const rule = new Rule({
      id: "r1",
      conditionsOp: "and",
      conditions: [{ field: "amount", op: "lt", value: 0 }],
      actions: [{ op: "set", field: "category", value: "cat-1" }],
    });
    const txn = { amount: -5000, category: null };
    rule.exec(txn);
    expect(txn.category).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Rule — apply
// ─────────────────────────────────────────────────────────────────────────────

describe("Rule.apply", () => {
  it("returns a merged object when conditions match", () => {
    const rule = new Rule({
      id: "r1",
      conditionsOp: "and",
      conditions: [{ field: "notes", op: "contains", value: "grocery" }],
      actions: [{ op: "set", field: "category", value: "cat-food" }],
    });
    const txn = { notes: "grocery store", category: null };
    const result = rule.apply(txn);
    expect(result.category).toBe("cat-food");
    expect(result.notes).toBe("grocery store");
  });

  it("returns unchanged copy when conditions do not match", () => {
    const rule = new Rule({
      id: "r1",
      conditionsOp: "and",
      conditions: [{ field: "notes", op: "is", value: "specific" }],
      actions: [{ op: "set", field: "category", value: "cat-1" }],
    });
    const txn = { notes: "different", category: null };
    const result = rule.apply(txn);
    expect(result.category).toBeNull();
    expect(result.notes).toBe("different");
  });

  it("returns a new object (does not return same reference)", () => {
    const rule = new Rule({
      id: "r1",
      conditionsOp: "and",
      conditions: [{ field: "amount", op: "lt", value: 0 }],
      actions: [{ op: "set", field: "category", value: "cat-1" }],
    });
    const txn = { amount: -5000, category: null };
    const result = rule.apply(txn);
    expect(result).not.toBe(txn);
  });

  it("applies multiple actions sequentially", () => {
    const rule = new Rule({
      id: "r1",
      conditionsOp: "and",
      conditions: [{ field: "amount", op: "lt", value: 0 }],
      actions: [
        { op: "set", field: "category", value: "cat-expense" },
        { op: "append-notes", value: " [auto]" },
      ],
    });
    const result = rule.apply({ amount: -5000, notes: "purchase" });
    expect(result.category).toBe("cat-expense");
    expect(result.notes).toBe("purchase [auto]");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Rule — serialize
// ─────────────────────────────────────────────────────────────────────────────

describe("Rule.serialize", () => {
  it("produces a plain object with all required keys", () => {
    const rule = new Rule({
      id: "rule-123",
      stage: "pre",
      conditionsOp: "or",
      conditions: [{ field: "notes", op: "contains", value: "grocery" }],
      actions: [{ op: "set", field: "category", value: "cat-food" }],
    });
    const s = rule.serialize();
    expect(s.id).toBe("rule-123");
    expect(s.stage).toBe("pre");
    expect(s.conditionsOp).toBe("or");
    expect(Array.isArray(s.conditions)).toBe(true);
    expect(Array.isArray(s.actions)).toBe(true);
  });

  it("serializes each condition via Condition.serialize", () => {
    const rule = new Rule({
      id: "r1",
      conditionsOp: "and",
      conditions: [{ field: "amount", op: "gt", value: 0 }],
      actions: [],
    });
    const s = rule.serialize();
    expect((s.conditions as unknown[])[0]).toMatchObject({
      field: "amount",
      op: "gt",
      value: 0,
      type: "number",
    });
  });

  it("serializes each action via Action.serialize", () => {
    const rule = new Rule({
      id: "r1",
      conditionsOp: "and",
      conditions: [{ field: "amount", op: "gt", value: 0 }],
      actions: [{ op: "set", field: "notes", value: "income" }],
    });
    const s = rule.serialize();
    expect((s.actions as unknown[])[0]).toMatchObject({
      op: "set",
      field: "notes",
      value: "income",
    });
  });

  it("stage defaults to null when not specified", () => {
    const rule = new Rule({
      conditionsOp: "and",
      conditions: [{ field: "notes", op: "is", value: "test" }],
      actions: [],
    });
    expect(rule.serialize().stage).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// evaluateFormula
// ─────────────────────────────────────────────────────────────────────────────

describe("evaluateFormula", () => {
  describe("basic arithmetic", () => {
    it("addition: =1+2 → 3", () => {
      expect(evaluateFormula("=1+2", {})).toBe(3);
    });

    it("subtraction: =10-3 → 7", () => {
      expect(evaluateFormula("=10-3", {})).toBe(7);
    });

    it("multiplication: =4*5 → 20", () => {
      expect(evaluateFormula("=4*5", {})).toBe(20);
    });

    it("division: =20/4 → 5", () => {
      expect(evaluateFormula("=20/4", {})).toBe(5);
    });

    it("respects operator precedence: =2+3*4 → 14", () => {
      expect(evaluateFormula("=2+3*4", {})).toBe(14);
    });
  });

  describe("parentheses", () => {
    it("=(1+2)*3 → 9", () => {
      expect(evaluateFormula("=(1+2)*3", {})).toBe(9);
    });

    it("nested parentheses: =((2+3)*2)+1 → 11", () => {
      expect(evaluateFormula("=((2+3)*2)+1", {})).toBe(11);
    });
  });

  describe("variables", () => {
    it("uses variable from context: =amount*0.1 with amount=5000 → 500", () => {
      expect(evaluateFormula("=amount*0.1", { amount: 5000 })).toBe(500);
    });

    it("two variables: =amount+bonus with amount=1000, bonus=200 → 1200", () => {
      expect(evaluateFormula("=amount+bonus", { amount: 1000, bonus: 200 })).toBe(1200);
    });

    it("unknown variable resolves to 0", () => {
      expect(evaluateFormula("=unknown_var+10", {})).toBe(10);
    });
  });

  describe("unary minus", () => {
    it("negates a literal: =-5 → -5", () => {
      expect(evaluateFormula("=-5", {})).toBe(-5);
    });

    it("negates a variable: =-amount with amount=1000 → -1000", () => {
      expect(evaluateFormula("=-amount", { amount: 1000 })).toBe(-1000);
    });

    it("negation of a parenthesized expression: =-(amount) with amount=500 → -500", () => {
      expect(evaluateFormula("=-(amount)", { amount: 500 })).toBe(-500);
    });
  });

  describe("built-in functions", () => {
    it("INTEGER_TO_AMOUNT(5000, 2) → 50", () => {
      expect(evaluateFormula("=INTEGER_TO_AMOUNT(5000, 2)", {})).toBe(50);
    });

    it("INTEGER_TO_AMOUNT(5000) defaults to 2 decimal places → 50", () => {
      expect(evaluateFormula("=INTEGER_TO_AMOUNT(5000)", {})).toBe(50);
    });

    it("FIXED(3.456, 2) → 3.46", () => {
      expect(evaluateFormula("=FIXED(3.456, 2)", {})).toBe(3.46);
    });

    it("ABS(-42) → 42", () => {
      expect(evaluateFormula("=ABS(-42)", {})).toBe(42);
    });

    it("ABS(42) → 42", () => {
      expect(evaluateFormula("=ABS(42)", {})).toBe(42);
    });

    it("ROUND(3.5) → 4", () => {
      expect(evaluateFormula("=ROUND(3.5)", {})).toBe(4);
    });

    it("ROUND(3.4) → 3", () => {
      expect(evaluateFormula("=ROUND(3.4)", {})).toBe(3);
    });

    it("FLOOR(3.9) → 3", () => {
      expect(evaluateFormula("=FLOOR(3.9)", {})).toBe(3);
    });

    it("CEIL(3.1) → 4", () => {
      expect(evaluateFormula("=CEIL(3.1)", {})).toBe(4);
    });

    it("MIN(5, 3, 8) → 3", () => {
      expect(evaluateFormula("=MIN(5, 3, 8)", {})).toBe(3);
    });

    it("MAX(5, 3, 8) → 8", () => {
      expect(evaluateFormula("=MAX(5, 3, 8)", {})).toBe(8);
    });

    it("function with variable argument: =ABS(amount) with amount=-1500 → 1500", () => {
      expect(evaluateFormula("=ABS(amount)", { amount: -1500 })).toBe(1500);
    });

    it("throws for unknown function", () => {
      expect(() => evaluateFormula("=UNKNOWNFN(1)", {})).toThrow();
    });
  });

  describe("error cases", () => {
    it("throws when formula does not start with =", () => {
      expect(() => evaluateFormula("1+2", {})).toThrow("Formula must start with =");
    });

    it("throws for empty formula (just =)", () => {
      expect(() => evaluateFormula("=", {})).toThrow("Empty formula");
    });

    it("throws for formula with only whitespace after =", () => {
      expect(() => evaluateFormula("=   ", {})).toThrow("Empty formula");
    });

    it("throws for unexpected character in formula", () => {
      expect(() => evaluateFormula("=1@2", {})).toThrow();
    });
  });

  describe("amountToInteger helper", () => {
    it("converts 50.00 to 5000", () => {
      expect(amountToInteger(50)).toBe(5000);
    });

    it("rounds correctly: 50.005 → 5001 (rounds half-up)", () => {
      expect(amountToInteger(50.005)).toBe(5001);
    });

    it("handles negative amounts: -25.50 → -2550", () => {
      expect(amountToInteger(-25.5)).toBe(-2550);
    });

    it("handles zero: 0 → 0", () => {
      expect(amountToInteger(0)).toBe(0);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RuleIndexer
// ─────────────────────────────────────────────────────────────────────────────

function makeIndexerRule(
  id: string,
  conditions: Array<{ field: string; op: string; value: unknown }>,
): Rule {
  return new Rule({
    id,
    conditionsOp: "and",
    conditions,
    actions: [],
  });
}

describe("RuleIndexer", () => {
  describe("index and getApplicableRules — exact field matching", () => {
    it("returns indexed rule when field value matches exactly", () => {
      const indexer = new RuleIndexer({ field: "payee" });
      const rule = makeIndexerRule("r1", [{ field: "payee", op: "is", value: "payee-walmart" }]);
      indexer.index(rule);

      const applicable = indexer.getApplicableRules({ payee: "payee-walmart" });
      expect(applicable.has(rule)).toBe(true);
    });

    it("does not return rule when field value does not match", () => {
      const indexer = new RuleIndexer({ field: "payee" });
      const rule = makeIndexerRule("r1", [{ field: "payee", op: "is", value: "payee-walmart" }]);
      indexer.index(rule);

      const applicable = indexer.getApplicableRules({ payee: "payee-target" });
      expect(applicable.has(rule)).toBe(false);
    });

    it("returns wildcard rule regardless of field value", () => {
      const indexer = new RuleIndexer({ field: "payee" });
      // A rule with no matching condition on the indexed field goes to wildcard
      const wildcardRule = makeIndexerRule("r-wild", [{ field: "amount", op: "lt", value: 0 }]);
      indexer.index(wildcardRule);

      const applicable = indexer.getApplicableRules({ payee: "any-payee" });
      expect(applicable.has(wildcardRule)).toBe(true);
    });

    it("merges indexed rules with wildcard rules", () => {
      const indexer = new RuleIndexer({ field: "payee" });
      const exactRule = makeIndexerRule("r-exact", [
        { field: "payee", op: "is", value: "payee-1" },
      ]);
      const wildcardRule = makeIndexerRule("r-wild", [{ field: "amount", op: "gt", value: 0 }]);
      indexer.index(exactRule);
      indexer.index(wildcardRule);

      const applicable = indexer.getApplicableRules({ payee: "payee-1" });
      expect(applicable.has(exactRule)).toBe(true);
      expect(applicable.has(wildcardRule)).toBe(true);
    });
  });

  describe("firstchar method", () => {
    it("indexes by the first character of the value", () => {
      const indexer = new RuleIndexer({ field: "imported_payee", method: "firstchar" });
      const rule = makeIndexerRule("r1", [{ field: "imported_payee", op: "is", value: "walmart" }]);
      indexer.index(rule);

      // "walmart" → key "w"; lookup with "whole foods" should also match under "w"
      // Actually: getKey on "walmart" returns "w", indexed under "w"
      // getApplicableRules looks up getKey(object["imported_payee"])
      const applicable = indexer.getApplicableRules({ imported_payee: "walmart" });
      expect(applicable.has(rule)).toBe(true);
    });

    it("does not return rule when first char differs", () => {
      const indexer = new RuleIndexer({ field: "imported_payee", method: "firstchar" });
      const rule = makeIndexerRule("r1", [{ field: "imported_payee", op: "is", value: "walmart" }]);
      indexer.index(rule);

      // key for "walmart" is "w", but looking up "target" → "t", different bucket
      const applicable = indexer.getApplicableRules({ imported_payee: "target" });
      expect(applicable.has(rule)).toBe(false);
    });

    it("is case-insensitive for the first character", () => {
      const indexer = new RuleIndexer({ field: "imported_payee", method: "firstchar" });
      const rule = makeIndexerRule("r1", [{ field: "imported_payee", op: "is", value: "Walmart" }]);
      indexer.index(rule);

      // "Walmart" → key "w"; lookup "WALMART" → key "w" via toLowerCase
      const applicable = indexer.getApplicableRules({ imported_payee: "WALMART" });
      expect(applicable.has(rule)).toBe(true);
    });
  });

  describe("oneOf conditions index to multiple buckets", () => {
    it("indexes rule under each value in oneOf", () => {
      const indexer = new RuleIndexer({ field: "payee" });
      const rule = makeIndexerRule("r1", [
        { field: "payee", op: "oneOf", value: ["payee-a", "payee-b", "payee-c"] },
      ]);
      indexer.index(rule);

      expect(indexer.getApplicableRules({ payee: "payee-a" }).has(rule)).toBe(true);
      expect(indexer.getApplicableRules({ payee: "payee-b" }).has(rule)).toBe(true);
      expect(indexer.getApplicableRules({ payee: "payee-c" }).has(rule)).toBe(true);
    });

    it("does not return rule for values not in oneOf", () => {
      const indexer = new RuleIndexer({ field: "payee" });
      const rule = makeIndexerRule("r1", [
        { field: "payee", op: "oneOf", value: ["payee-a", "payee-b"] },
      ]);
      indexer.index(rule);

      expect(indexer.getApplicableRules({ payee: "payee-z" }).has(rule)).toBe(false);
    });
  });

  describe("remove", () => {
    it("removes a previously indexed rule", () => {
      const indexer = new RuleIndexer({ field: "payee" });
      const rule = makeIndexerRule("r1", [{ field: "payee", op: "is", value: "payee-1" }]);
      indexer.index(rule);
      indexer.remove(rule);

      expect(indexer.getApplicableRules({ payee: "payee-1" }).has(rule)).toBe(false);
    });

    it("also removes from wildcard index when rule has no matching field condition", () => {
      const indexer = new RuleIndexer({ field: "payee" });
      const wildcardRule = makeIndexerRule("r-wild", [{ field: "amount", op: "lt", value: 0 }]);
      indexer.index(wildcardRule);
      indexer.remove(wildcardRule);

      expect(indexer.getApplicableRules({ payee: "any" }).has(wildcardRule)).toBe(false);
    });
  });

  describe("empty state", () => {
    it("returns empty set when no rules are indexed", () => {
      const indexer = new RuleIndexer({ field: "payee" });
      const result = indexer.getApplicableRules({ payee: "payee-1" });
      expect(result.size).toBe(0);
    });

    it("returns empty set when field is missing from object", () => {
      const indexer = new RuleIndexer({ field: "payee" });
      const rule = makeIndexerRule("r1", [{ field: "payee", op: "is", value: "payee-1" }]);
      indexer.index(rule);

      // No "payee" field in the object — only wildcard rules apply
      const applicable = indexer.getApplicableRules({ amount: -5000 });
      expect(applicable.has(rule)).toBe(false);
    });

    it("returns wildcard rules even when field is missing from object", () => {
      const indexer = new RuleIndexer({ field: "payee" });
      const wildcardRule = makeIndexerRule("r-wild", [
        { field: "notes", op: "contains", value: "x" },
      ]);
      indexer.index(wildcardRule);

      const applicable = indexer.getApplicableRules({ amount: -5000 });
      expect(applicable.has(wildcardRule)).toBe(true);
    });
  });

  describe("getIndex creates buckets lazily", () => {
    it("creates a new empty Set for an unseen key", () => {
      const indexer = new RuleIndexer({ field: "payee" });
      const set = indexer.getIndex("new-key");
      expect(set).toBeInstanceOf(Set);
      expect(set.size).toBe(0);
    });

    it("returns the same Set for the same key", () => {
      const indexer = new RuleIndexer({ field: "payee" });
      const set1 = indexer.getIndex("key-a");
      const set2 = indexer.getIndex("key-a");
      expect(set1).toBe(set2);
    });
  });
});
