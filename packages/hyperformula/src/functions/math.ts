/**
 * Math & aggregation built-ins.
 */

import { ProcedureAst } from "../parser";
import { FunctionArgumentType as T, FunctionPlugin, ImplementedFunctions } from "../plugin";
import { InterpreterState } from "../typings/interpreter/InterpreterState";
import { InternalScalarValue, SimpleRangeValue } from "../values";
import { matchesCriterion, naError, numbersFrom, numError, valueError } from "./helpers";

function scalars(range: SimpleRangeValue): InternalScalarValue[] {
  return range.valuesFromTopLeftCorner();
}

export class MathPlugin extends FunctionPlugin {
  abs(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(ast.args, state, this.metadata("ABS"), (x: number) => Math.abs(x));
  }
  ceiling(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(ast.args, state, this.metadata("CEILING"), (x: number, s = 1) => {
      if (s === 0) return 0;
      return Math.ceil(x / s) * s;
    });
  }
  cos(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(ast.args, state, this.metadata("COS"), (x: number) => Math.cos(x));
  }
  exp(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(ast.args, state, this.metadata("EXP"), (x: number) => Math.exp(x));
  }
  floor(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(ast.args, state, this.metadata("FLOOR"), (x: number, s = 1) => {
      if (s === 0) return 0;
      return Math.floor(x / s) * s;
    });
  }
  int(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(ast.args, state, this.metadata("INT"), (x: number) => Math.floor(x));
  }
  ln(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(ast.args, state, this.metadata("LN"), (x: number) =>
      x <= 0 ? numError() : Math.log(x),
    );
  }
  log(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(ast.args, state, this.metadata("LOG"), (x: number, base = 10) =>
      x <= 0 || base <= 0 ? numError() : Math.log(x) / Math.log(base),
    );
  }
  log10(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(ast.args, state, this.metadata("LOG10"), (x: number) =>
      x <= 0 ? numError() : Math.log10(x),
    );
  }
  mod(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(ast.args, state, this.metadata("MOD"), (a: number, b: number) => {
      if (b === 0) return numError("Division by zero");
      // Excel MOD result takes the sign of the divisor.
      return a - b * Math.floor(a / b);
    });
  }
  pi(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(ast.args, state, this.metadata("PI"), () => Math.PI);
  }
  power(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(ast.args, state, this.metadata("POWER"), (a: number, b: number) => {
      const r = Math.pow(a, b);
      return Number.isFinite(r) ? r : numError();
    });
  }
  product(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("PRODUCT"),
      (...vals: InternalScalarValue[]) => {
        const nums = numbersFrom(vals);
        return nums.reduce((acc, n) => acc * n, 1);
      },
    );
  }
  round(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(ast.args, state, this.metadata("ROUND"), (x: number, d = 0) => {
      const f = Math.pow(10, d);
      return Math.round(x * f + (x >= 0 ? Number.EPSILON : -Number.EPSILON)) / f;
    });
  }
  rounddown(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(ast.args, state, this.metadata("ROUNDDOWN"), (x: number, d = 0) => {
      const f = Math.pow(10, d);
      return Math.trunc(x * f) / f;
    });
  }
  roundup(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(ast.args, state, this.metadata("ROUNDUP"), (x: number, d = 0) => {
      const f = Math.pow(10, d);
      const v = x * f;
      return (x >= 0 ? Math.ceil(v) : Math.floor(v)) / f;
    });
  }
  sign(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(ast.args, state, this.metadata("SIGN"), (x: number) => Math.sign(x));
  }
  sin(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(ast.args, state, this.metadata("SIN"), (x: number) => Math.sin(x));
  }
  sqrt(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(ast.args, state, this.metadata("SQRT"), (x: number) =>
      x < 0 ? numError() : Math.sqrt(x),
    );
  }
  sum(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("SUM"),
      (...vals: InternalScalarValue[]) => numbersFrom(vals).reduce((a, b) => a + b, 0),
    );
  }
  sumsq(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("SUMSQ"),
      (...vals: InternalScalarValue[]) => numbersFrom(vals).reduce((a, b) => a + b * b, 0),
    );
  }
  tan(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(ast.args, state, this.metadata("TAN"), (x: number) => Math.tan(x));
  }
  trunc(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(ast.args, state, this.metadata("TRUNC"), (x: number, d = 0) => {
      const f = Math.pow(10, d);
      return Math.trunc(x * f) / f;
    });
  }

  sumif(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("SUMIF"),
      (range: SimpleRangeValue, criterion: InternalScalarValue, sumRange?: SimpleRangeValue) => {
        const test = scalars(range);
        const sums = sumRange ? scalars(sumRange) : test;
        let total = 0;
        for (let i = 0; i < test.length; i++) {
          if (matchesCriterion(test[i], criterion)) {
            const v = sums[i];
            if (typeof v === "number") total += v;
          }
        }
        return total;
      },
    );
  }

  sumifs(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("SUMIFS"),
      (sumRange: SimpleRangeValue, ...rest: unknown[]) => {
        const sums = scalars(sumRange);
        const pairs: Array<[SimpleRangeValue, InternalScalarValue]> = [];
        for (let i = 0; i + 1 < rest.length; i += 2) {
          pairs.push([rest[i] as SimpleRangeValue, rest[i + 1] as InternalScalarValue]);
        }
        let total = 0;
        for (let i = 0; i < sums.length; i++) {
          const ok = pairs.every(([r, c]) => matchesCriterion(scalars(r)[i], c));
          if (ok && typeof sums[i] === "number") total += sums[i] as number;
        }
        return total;
      },
    );
  }

  sumproduct(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("SUMPRODUCT"),
      (...ranges: SimpleRangeValue[]) => {
        if (ranges.length === 0) return naError();
        const cols = ranges.map(scalars);
        const len = cols[0].length;
        if (!cols.every((c) => c.length === len)) return valueError();
        let total = 0;
        for (let i = 0; i < len; i++) {
          let prod = 1;
          for (const col of cols) {
            const v = col[i];
            prod *= typeof v === "number" ? v : 0;
          }
          total += prod;
        }
        return total;
      },
    );
  }
}

const num = { argumentType: T.NUMBER } as const;
const anyRepeat = { parameters: [{ argumentType: T.ANY }], repeatLastArgs: 1, expandRanges: true };

MathPlugin.implementedFunctions = {
  ABS: { method: "abs", parameters: [num] },
  CEILING: { method: "ceiling", parameters: [num, { argumentType: T.NUMBER, defaultValue: 1 }] },
  COS: { method: "cos", parameters: [num] },
  EXP: { method: "exp", parameters: [num] },
  FLOOR: { method: "floor", parameters: [num, { argumentType: T.NUMBER, defaultValue: 1 }] },
  INT: { method: "int", parameters: [num] },
  LN: { method: "ln", parameters: [num] },
  LOG: { method: "log", parameters: [num, { argumentType: T.NUMBER, defaultValue: 10 }] },
  LOG10: { method: "log10", parameters: [num] },
  MOD: { method: "mod", parameters: [num, num] },
  PI: { method: "pi", parameters: [] },
  POWER: { method: "power", parameters: [num, num] },
  PRODUCT: { method: "product", ...anyRepeat },
  ROUND: { method: "round", parameters: [num, { argumentType: T.NUMBER, defaultValue: 0 }] },
  ROUNDDOWN: {
    method: "rounddown",
    parameters: [num, { argumentType: T.NUMBER, defaultValue: 0 }],
  },
  ROUNDUP: { method: "roundup", parameters: [num, { argumentType: T.NUMBER, defaultValue: 0 }] },
  SIGN: { method: "sign", parameters: [num] },
  SIN: { method: "sin", parameters: [num] },
  SQRT: { method: "sqrt", parameters: [num] },
  SUM: { method: "sum", ...anyRepeat },
  SUMSQ: { method: "sumsq", ...anyRepeat },
  TAN: { method: "tan", parameters: [num] },
  TRUNC: { method: "trunc", parameters: [num, { argumentType: T.NUMBER, defaultValue: 0 }] },
  SUMIF: {
    method: "sumif",
    parameters: [
      { argumentType: T.RANGE },
      { argumentType: T.SCALAR },
      { argumentType: T.RANGE, optionalArg: true },
    ],
  },
  SUMIFS: {
    method: "sumifs",
    parameters: [{ argumentType: T.RANGE }, { argumentType: T.RANGE }, { argumentType: T.SCALAR }],
    repeatLastArgs: 2,
  },
  SUMPRODUCT: { method: "sumproduct", parameters: [{ argumentType: T.RANGE }], repeatLastArgs: 1 },
} satisfies ImplementedFunctions;
