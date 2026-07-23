import { describe, it, expect } from "vitest";
import { evaluateFormula } from "./formula";

const vars = { amount: 5000, income: 12000, expense: -3000, zero: 0 };

describe("evaluateFormula — arithmetic", () => {
  it("multiplies", () => expect(evaluateFormula("=amount*0.1", vars)).toBe(500));
  it("divides", () => expect(evaluateFormula("=amount/100", vars)).toBe(50));
  it("adds", () => expect(evaluateFormula("=amount+income", vars)).toBe(17000));
  it("subtracts", () => expect(evaluateFormula("=amount-1000", vars)).toBe(4000));
  it("unary minus", () => expect(evaluateFormula("=-amount", vars)).toBe(-5000));
  it("parentheses", () => expect(evaluateFormula("=(amount+income)*0.1", vars)).toBe(1700));
  it("operator precedence", () => expect(evaluateFormula("=2+3*4", vars)).toBe(14));
});

describe("evaluateFormula — comparators", () => {
  it("> true", () => expect(evaluateFormula("=amount>1000", vars)).toBe(1));
  it("> false", () => expect(evaluateFormula("=amount>10000", vars)).toBe(0));
  it("< true", () => expect(evaluateFormula("=amount<10000", vars)).toBe(1));
  it(">= equal", () => expect(evaluateFormula("=amount>=5000", vars)).toBe(1));
  it("<= equal", () => expect(evaluateFormula("=amount<=5000", vars)).toBe(1));
  it("= equal", () => expect(evaluateFormula("=amount=5000", vars)).toBe(1));
  it("= not equal", () => expect(evaluateFormula("=amount=9999", vars)).toBe(0));
  it("<> not equal", () => expect(evaluateFormula("=amount<>9999", vars)).toBe(1));
  it("<> equal", () => expect(evaluateFormula("=amount<>5000", vars)).toBe(0));
});

describe("evaluateFormula — IF", () => {
  it("IF true branch (number)", () =>
    expect(evaluateFormula("=IF(amount>1000, amount*0.1, 0)", vars)).toBe(500));
  it("IF false branch (number)", () =>
    expect(evaluateFormula("=IF(amount>9000, amount*0.1, 0)", vars)).toBe(0));
  it("IF true branch (string)", () =>
    expect(evaluateFormula('=IF(amount>0, "income", "expense")', vars)).toBe("income"));
  it("IF false branch (string)", () =>
    expect(evaluateFormula('=IF(zero>0, "income", "expense")', vars)).toBe("expense"));
  it("IF nested", () => {
    const result = evaluateFormula("=IF(amount>10000, 100, IF(amount>5000, 50, 10))", vars);
    expect(result).toBe(10);
  });
  it("IF requires 3 args", () => {
    expect(() => evaluateFormula("=IF(amount>0, 1)", vars)).toThrow("IF() requires 3 arguments");
  });
});

describe("evaluateFormula — string functions", () => {
  it("CONCAT two strings", () =>
    expect(evaluateFormula('=CONCAT("hello", " world")', vars)).toBe("hello world"));
  it("CONCAT three strings", () =>
    expect(evaluateFormula('=CONCAT("a", "b", "c")', vars)).toBe("abc"));
  it("LEN", () => expect(evaluateFormula('=LEN("hello")', vars)).toBe(5));
  it("LOWER", () => expect(evaluateFormula('=LOWER("HELLO")', vars)).toBe("hello"));
  it("UPPER", () => expect(evaluateFormula('=UPPER("hello")', vars)).toBe("HELLO"));
  it("TRIM", () => expect(evaluateFormula('=TRIM("  hello  ")', vars)).toBe("hello"));
  it("string + with +", () =>
    expect(evaluateFormula('="hello" + " world"', vars)).toBe("hello world"));
});

describe("evaluateFormula — numeric functions", () => {
  it("INTEGER_TO_AMOUNT", () =>
    expect(evaluateFormula("=INTEGER_TO_AMOUNT(amount, 2)", vars)).toBe(50));
  it("ABS positive", () => expect(evaluateFormula("=ABS(amount)", vars)).toBe(5000));
  it("ABS negative", () => expect(evaluateFormula("=ABS(expense)", vars)).toBe(3000));
  it("ROUND", () => expect(evaluateFormula("=ROUND(3.7)", vars)).toBe(4));
  it("FLOOR", () => expect(evaluateFormula("=FLOOR(3.9)", vars)).toBe(3));
  it("CEIL", () => expect(evaluateFormula("=CEIL(3.1)", vars)).toBe(4));
  it("MIN", () => expect(evaluateFormula("=MIN(amount, income)", vars)).toBe(5000));
  it("MAX", () => expect(evaluateFormula("=MAX(amount, income)", vars)).toBe(12000));
  it("MOD", () => expect(evaluateFormula("=MOD(amount, 3000)", vars)).toBe(2000));
  it("FIXED", () => expect(evaluateFormula("=FIXED(3.14159, 2)", vars)).toBe(3.14));
});

describe("evaluateFormula — errors", () => {
  it("throws on missing =", () =>
    expect(() => evaluateFormula("amount*0.1", vars)).toThrow("must start with ="));
  it("throws on empty formula", () =>
    expect(() => evaluateFormula("=", vars)).toThrow("Empty formula"));
  it("throws on unknown function with descriptive message", () => {
    expect(() => evaluateFormula("=VLOOKUP(amount)", vars)).toThrow(
      "Unknown formula function: VLOOKUP",
    );
  });
  it("throws on unterminated string", () => {
    expect(() => evaluateFormula('="hello', vars)).toThrow("Unterminated string literal");
  });
});

describe("evaluateFormula — string variables", () => {
  const withStrings = { ...vars, notes: "Groceries", category: "food" };
  it("string variable in CONCAT", () => {
    expect(evaluateFormula('=CONCAT(notes, " (auto)")', withStrings)).toBe("Groceries (auto)");
  });
  it("string comparison with =", () => {
    expect(evaluateFormula('=notes="Groceries"', withStrings)).toBe(1);
  });
  it("IF with string variable", () => {
    expect(evaluateFormula('=IF(amount>0, notes, "unknown")', withStrings)).toBe("Groceries");
  });
});

describe("evaluateFormula — BALANCE_OF (Phase 3d)", () => {
  it("reads a running balance from the prefetched map", () => {
    const balances = new Map([["Checking", 12345]]);
    expect(evaluateFormula('=BALANCE_OF("Checking")', {}, balances)).toBe(12345);
  });

  it("returns 0 for an account not in the map", () => {
    expect(evaluateFormula('=BALANCE_OF("Nope")', {}, new Map())).toBe(0);
  });

  it("returns 0 when no balance map is passed", () => {
    expect(evaluateFormula('=BALANCE_OF("Checking")', {})).toBe(0);
  });

  it("combines BALANCE_OF arithmetically", () => {
    const balances = new Map([["A", 1000]]);
    expect(evaluateFormula('=BALANCE_OF("A") + 500', {}, balances)).toBe(1500);
  });
});
