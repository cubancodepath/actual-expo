import { afterAll, describe, expect, it } from "vitest";

import { HyperFormula } from "../hyperformula";
import { registerFunctionPlugin } from "../function-registry";
import { ArraySize, FunctionArgumentType as T, FunctionPlugin } from "../plugin";
import { ProcedureAst } from "../parser";
import { InterpreterState } from "../typings/interpreter/InterpreterState";
import { CellError, ErrorType } from "../errors";
import { SimpleRangeValue } from "../values";

// A toy plugin exercising each argument-coercion path + a spilled array result.
class ToyPlugin extends FunctionPlugin {
  echoNum(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(ast.args, state, this.metadata("ECHO_NUM"), (n: number) => n);
  }
  echoStr(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(ast.args, state, this.metadata("ECHO_STR"), (s: string) => s);
  }
  echoBool(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(ast.args, state, this.metadata("ECHO_BOOL"), (b: boolean) => b);
  }
  withDefault(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("WITH_DEFAULT"),
      (a: number, b = 10) => a + b,
    );
  }
  rangeCount(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("RANGE_COUNT"),
      (r: SimpleRangeValue) => r.valuesFromTopLeftCorner().length,
    );
  }
  spill(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(ast.args, state, this.metadata("SPILL"), (n: number) =>
      SimpleRangeValue.onlyValues(Array.from({ length: n }, (_v, i) => [i + 1])),
    );
  }
  spillSize(ast: ProcedureAst): ArraySize {
    const arg = ast.args[0];
    const count = arg?.type === "NUMBER" ? (arg as { value: number }).value : 1;
    return new ArraySize(1, Math.max(1, count));
  }
  bomb() {
    return new CellError(ErrorType.VALUE, "boom");
  }
}

ToyPlugin.implementedFunctions = {
  ECHO_NUM: { method: "echoNum", parameters: [{ argumentType: T.NUMBER }] },
  ECHO_STR: { method: "echoStr", parameters: [{ argumentType: T.STRING }] },
  ECHO_BOOL: { method: "echoBool", parameters: [{ argumentType: T.BOOLEAN }] },
  WITH_DEFAULT: {
    method: "withDefault",
    parameters: [
      { argumentType: T.NUMBER },
      { argumentType: T.NUMBER, optionalArg: true, defaultValue: 10 },
    ],
  },
  RANGE_COUNT: { method: "rangeCount", parameters: [{ argumentType: T.RANGE }] },
  SPILL: {
    method: "spill",
    sizeOfResultArrayMethod: "spillSize",
    parameters: [{ argumentType: T.NUMBER }],
  },
  BOMB: { method: "bomb", parameters: [] },
};

registerFunctionPlugin(ToyPlugin, { enUS: {} });

function ev(formula: string): unknown {
  const hf = HyperFormula.buildEmpty({ licenseKey: "gpl-v3", language: "enUS" });
  try {
    const sheet = hf.getSheetId(hf.addSheet("Sheet1"))!;
    hf.setCellContents({ sheet, col: 0, row: 0 }, [[formula]]);
    return hf.getCellValue({ sheet, col: 0, row: 0 });
  } finally {
    hf.destroy();
  }
}

describe("plugin SDK coercion", () => {
  it("coerces NUMBER/STRING/BOOLEAN arguments", () => {
    expect(ev('=ECHO_NUM("5")')).toBe(5); // numeric string coerces in arithmetic-typed slot
    expect(ev("=ECHO_STR(5)")).toBe("5");
    expect(ev("=ECHO_BOOL(1)")).toBe(true);
  });
  it("applies default values for missing optional args", () => {
    expect(ev("=WITH_DEFAULT(5)")).toBe(15);
    expect(ev("=WITH_DEFAULT(5, 100)")).toBe(105);
  });
  it("passes ranges through for RANGE args", () => {
    expect(ev("=RANGE_COUNT({1;2;3;4})")).toBe(4);
  });
  it("rejects wrong argument count with #N/A", () => {
    expect(ev("=ECHO_NUM(1, 2)")).toMatchObject({ type: "NA" });
  });
  it("propagates CellError from a non-SCALAR argument", () => {
    expect(ev("=ECHO_NUM(1/0)")).toMatchObject({ type: "DIV_BY_ZERO" });
  });
  it("spills an array function result", () => {
    const hf = HyperFormula.buildEmpty({ licenseKey: "gpl-v3", language: "enUS" });
    try {
      const sheet = hf.getSheetId(hf.addSheet("Sheet1"))!;
      hf.setCellContents({ sheet, col: 0, row: 0 }, [["=SPILL(3)"]]);
      expect(hf.getSheetValues(sheet)).toEqual([[1], [2], [3]]);
    } finally {
      hf.destroy();
    }
  });
  it("returns a CellError produced by the impl", () => {
    expect(ev("=BOMB()")).toMatchObject({ type: "VALUE", message: "boom" });
  });
});

afterAll(() => {
  // no teardown needed; registry is process-global like HyperFormula
});
