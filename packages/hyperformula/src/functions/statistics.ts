/**
 * Statistical built-ins.
 */

import { ProcedureAst } from "../parser";
import { FunctionArgumentType as T, FunctionPlugin, ImplementedFunctions } from "../plugin";
import { InterpreterState } from "../typings/interpreter/InterpreterState";
import { EmptyValue, InternalScalarValue, SimpleRangeValue } from "../values";
import { matchesCriterion, naError, numbersFrom, numError } from "./helpers";

function scalars(range: SimpleRangeValue): InternalScalarValue[] {
  return range.valuesFromTopLeftCorner();
}

/** "A"-variant coercion: numbers as-is, booleans 1/0, text 0, empty skipped. */
function numbersA(vals: InternalScalarValue[]): number[] {
  const out: number[] = [];
  for (const v of vals) {
    if (v === EmptyValue) continue;
    if (typeof v === "number") out.push(v);
    else if (typeof v === "boolean") out.push(v ? 1 : 0);
    else if (typeof v === "string") out.push(0);
  }
  return out;
}

function mean(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function variance(nums: number[], population: boolean): number {
  const m = mean(nums);
  const denom = population ? nums.length : nums.length - 1;
  const ss = nums.reduce((a, b) => a + (b - m) * (b - m), 0);
  return ss / denom;
}

export class StatisticsPlugin extends FunctionPlugin {
  average(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("AVERAGE"),
      (...v: InternalScalarValue[]) => {
        const nums = numbersFrom(v);
        return nums.length === 0 ? numError("Division by zero") : mean(nums);
      },
    );
  }
  averagea(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("AVERAGEA"),
      (...v: InternalScalarValue[]) => {
        const nums = numbersA(v);
        return nums.length === 0 ? numError("Division by zero") : mean(nums);
      },
    );
  }
  count(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("COUNT"),
      (...v: InternalScalarValue[]) => numbersFrom(v).length,
    );
  }
  counta(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("COUNTA"),
      (...v: InternalScalarValue[]) => v.filter((x) => x !== EmptyValue).length,
    );
  }
  countblank(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("COUNTBLANK"),
      (range: SimpleRangeValue) =>
        scalars(range).filter((x) => x === EmptyValue || x === "").length,
    );
  }
  countif(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("COUNTIF"),
      (range: SimpleRangeValue, criterion: InternalScalarValue) =>
        scalars(range).filter((x) => matchesCriterion(x, criterion)).length,
    );
  }
  countifs(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(ast.args, state, this.metadata("COUNTIFS"), (...rest: unknown[]) => {
      const pairs: Array<[SimpleRangeValue, InternalScalarValue]> = [];
      for (let i = 0; i + 1 < rest.length; i += 2) {
        pairs.push([rest[i] as SimpleRangeValue, rest[i + 1] as InternalScalarValue]);
      }
      if (pairs.length === 0) return 0;
      const len = scalars(pairs[0][0]).length;
      let count = 0;
      for (let i = 0; i < len; i++) {
        if (pairs.every(([r, c]) => matchesCriterion(scalars(r)[i], c))) count++;
      }
      return count;
    });
  }
  max(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("MAX"),
      (...v: InternalScalarValue[]) => {
        const nums = numbersFrom(v);
        return nums.length === 0 ? 0 : Math.max(...nums);
      },
    );
  }
  maxa(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("MAXA"),
      (...v: InternalScalarValue[]) => {
        const nums = numbersA(v);
        return nums.length === 0 ? 0 : Math.max(...nums);
      },
    );
  }
  min(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("MIN"),
      (...v: InternalScalarValue[]) => {
        const nums = numbersFrom(v);
        return nums.length === 0 ? 0 : Math.min(...nums);
      },
    );
  }
  mina(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("MINA"),
      (...v: InternalScalarValue[]) => {
        const nums = numbersA(v);
        return nums.length === 0 ? 0 : Math.min(...nums);
      },
    );
  }
  median(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("MEDIAN"),
      (...v: InternalScalarValue[]) => {
        const nums = numbersFrom(v).sort((a, b) => a - b);
        if (nums.length === 0) return numError();
        const mid = Math.floor(nums.length / 2);
        return nums.length % 2 === 1 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
      },
    );
  }
  mode(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("MODE"),
      (...v: InternalScalarValue[]) => {
        const nums = numbersFrom(v);
        const counts = new Map<number, number>();
        let best: number | undefined;
        let bestCount = 0;
        for (const n of nums) {
          const c = (counts.get(n) ?? 0) + 1;
          counts.set(n, c);
          if (c > bestCount) {
            bestCount = c;
            best = n;
          }
        }
        return bestCount < 2 || best === undefined ? naError() : best;
      },
    );
  }
  stdev(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("STDEV"),
      (...v: InternalScalarValue[]) => {
        const nums = numbersFrom(v);
        return nums.length < 2 ? numError() : Math.sqrt(variance(nums, false));
      },
    );
  }
  stdevp(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("STDEVP"),
      (...v: InternalScalarValue[]) => {
        const nums = numbersFrom(v);
        return nums.length < 1 ? numError() : Math.sqrt(variance(nums, true));
      },
    );
  }
  var(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("VAR"),
      (...v: InternalScalarValue[]) => {
        const nums = numbersFrom(v);
        return nums.length < 2 ? numError() : variance(nums, false);
      },
    );
  }
  varp(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("VARP"),
      (...v: InternalScalarValue[]) => {
        const nums = numbersFrom(v);
        return nums.length < 1 ? numError() : variance(nums, true);
      },
    );
  }
  percentile(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("PERCENTILE"),
      (range: SimpleRangeValue, k: number) => {
        const nums = numbersFrom(scalars(range)).sort((a, b) => a - b);
        if (nums.length === 0 || k < 0 || k > 1) return numError();
        const idx = k * (nums.length - 1);
        const lo = Math.floor(idx);
        const hi = Math.ceil(idx);
        if (lo === hi) return nums[lo];
        return nums[lo] + (idx - lo) * (nums[hi] - nums[lo]);
      },
    );
  }
  quartile(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("QUARTILE"),
      (range: SimpleRangeValue, q: number) => {
        const quart = Math.trunc(q);
        if (quart < 0 || quart > 4) return numError();
        const nums = numbersFrom(scalars(range)).sort((a, b) => a - b);
        if (nums.length === 0) return numError();
        const k = quart / 4;
        const idx = k * (nums.length - 1);
        const lo = Math.floor(idx);
        const hi = Math.ceil(idx);
        if (lo === hi) return nums[lo];
        return nums[lo] + (idx - lo) * (nums[hi] - nums[lo]);
      },
    );
  }
  rank(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("RANK"),
      (value: number, range: SimpleRangeValue, order = 0) => {
        const nums = numbersFrom(scalars(range));
        const sorted =
          order === 0 ? [...nums].sort((a, b) => b - a) : [...nums].sort((a, b) => a - b);
        const idx = sorted.indexOf(value);
        return idx === -1 ? naError() : idx + 1;
      },
    );
  }
}

const anyRepeat = { parameters: [{ argumentType: T.ANY }], repeatLastArgs: 1, expandRanges: true };
const num = { argumentType: T.NUMBER } as const;
const range = { argumentType: T.RANGE } as const;

StatisticsPlugin.implementedFunctions = {
  AVERAGE: { method: "average", ...anyRepeat },
  AVERAGEA: { method: "averagea", ...anyRepeat },
  COUNT: { method: "count", ...anyRepeat },
  COUNTA: { method: "counta", ...anyRepeat },
  COUNTBLANK: { method: "countblank", parameters: [range] },
  COUNTIF: { method: "countif", parameters: [range, { argumentType: T.SCALAR }] },
  COUNTIFS: {
    method: "countifs",
    parameters: [range, { argumentType: T.SCALAR }],
    repeatLastArgs: 2,
  },
  MAX: { method: "max", ...anyRepeat },
  MAXA: { method: "maxa", ...anyRepeat },
  MIN: { method: "min", ...anyRepeat },
  MINA: { method: "mina", ...anyRepeat },
  MEDIAN: { method: "median", ...anyRepeat },
  MODE: { method: "mode", ...anyRepeat },
  STDEV: { method: "stdev", ...anyRepeat },
  STDEVP: { method: "stdevp", ...anyRepeat },
  VAR: { method: "var", ...anyRepeat },
  VARP: { method: "varp", ...anyRepeat },
  PERCENTILE: { method: "percentile", parameters: [range, num] },
  QUARTILE: { method: "quartile", parameters: [range, num] },
  RANK: { method: "rank", parameters: [num, range, { argumentType: T.NUMBER, defaultValue: 0 }] },
} satisfies ImplementedFunctions;
