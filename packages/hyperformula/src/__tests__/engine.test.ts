import { beforeAll, describe, expect, it } from "vitest";

import { HyperFormula } from "../hyperformula";
import enUS from "../i18n/enUS";

function evalFormula(formula: string, named: Record<string, unknown> = {}) {
  const hf = HyperFormula.buildEmpty({ licenseKey: "gpl-v3", language: "enUS" });
  try {
    const sheet = hf.getSheetId(hf.addSheet("Sheet1"))!;
    for (const [k, v] of Object.entries(named)) {
      hf.addNamedExpression(k, v as never);
    }
    hf.setCellContents({ sheet, col: 0, row: 0 }, [[formula]]);
    return hf.getCellValue({ sheet, col: 0, row: 0 });
  } finally {
    hf.destroy();
  }
}

beforeAll(() => {
  if (!HyperFormula.getRegisteredLanguagesCodes().includes("enUS")) {
    HyperFormula.registerLanguage("enUS", enUS);
  }
});

describe("engine facade", () => {
  it("registers languages", () => {
    expect(HyperFormula.getRegisteredLanguagesCodes()).toContain("enUS");
  });

  it("evaluates arithmetic with precedence", () => {
    expect(evalFormula("=2+3*4")).toBe(14);
    expect(evalFormula("=(2+3)*4")).toBe(20);
    expect(evalFormula("=2^10")).toBe(1024);
    expect(evalFormula("=10/4")).toBe(2.5);
  });

  it("comparisons yield real booleans", () => {
    expect(evalFormula("=1>0")).toBe(true);
    expect(evalFormula("=0>1")).toBe(false);
    expect(evalFormula("=5=5")).toBe(true);
  });

  it("does not coerce number<->string in comparisons", () => {
    expect(evalFormula('="5"=5')).toBe(false);
  });

  it("compares strings case-insensitively", () => {
    expect(evalFormula('="ABC"="abc"')).toBe(true);
  });

  it("concatenates with &", () => {
    expect(evalFormula('="a"&"b"&1')).toBe("ab1");
  });

  it("resolves named expressions case-insensitively", () => {
    expect(evalFormula("=amount*2", { amount: 21 })).toBe(42);
    expect(evalFormula("=AMOUNT+1", { amount: 41 })).toBe(42);
  });

  it("unknown name -> #NAME?", () => {
    const v = evalFormula("=nope+1");
    expect(v).toMatchObject({ type: "NAME", value: "#NAME?" });
  });

  it("unknown function -> #NAME?", () => {
    const v = evalFormula("=NOPE(1)");
    expect(v).toMatchObject({ type: "NAME", value: "#NAME?" });
  });

  it("division by zero -> #DIV/0!", () => {
    const v = evalFormula("=1/0");
    expect(v).toMatchObject({ type: "DIV_BY_ZERO", value: "#DIV/0!" });
  });

  it("IFERROR intercepts errors", () => {
    expect(evalFormula("=IFERROR(1/0, 99)")).toBe(99);
    expect(evalFormula("=IFERROR(5, 99)")).toBe(5);
  });

  it("parses date-format named expressions to serials and TEXT formats back", () => {
    expect(evalFormula('=TEXT(today, "YYYY-MM-DD")', { today: "2026-01-15" })).toBe("2026-01-15");
    expect(evalFormula("=YEAR(today)", { today: "2026-01-15" })).toBe(2026);
  });

  it("spills an array literal into a range and returns the top-left", () => {
    const hf = HyperFormula.buildEmpty({ licenseKey: "gpl-v3", language: "enUS" });
    try {
      const sheet = hf.getSheetId(hf.addSheet("Sheet1"))!;
      hf.setCellContents({ sheet, col: 0, row: 0 }, [["={1;2;3}"]]);
      expect(hf.getCellValue({ sheet, col: 0, row: 0 })).toBe(1);
      expect(hf.getSheetValues(sheet)).toEqual([[1], [2], [3]]);
    } finally {
      hf.destroy();
    }
  });

  it("survives deeply nested formulas without a stack overflow", () => {
    const depth = 100;
    const formula = "=" + "(".repeat(depth) + "1" + ")".repeat(depth);
    // 100 nested parens exceeds MAX_DEPTH -> parse error surfaced as #ERROR!,
    // NOT a native crash. The point is it returns rather than throwing.
    const v = evalFormula(formula);
    expect(v).toMatchObject({ type: "ERROR" });
  });

  it("handles a shallow-but-wide formula", () => {
    expect(evalFormula("=SUM(1,2,3,4,5,6,7,8,9,10)")).toBe(55);
  });
});
