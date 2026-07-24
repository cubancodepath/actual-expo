/**
 * Financial built-ins. IRR/RATE use Newton's method with a bounded iteration
 * count (and IRR falls back to bisection) so they always terminate.
 */

import { ProcedureAst } from "../parser";
import { FunctionArgumentType as T, FunctionPlugin, ImplementedFunctions } from "../plugin";
import { InterpreterState } from "../typings/interpreter/InterpreterState";
import { InternalScalarValue, SimpleRangeValue } from "../values";
import { numbersFrom, numError } from "./helpers";

const MAX_ITER = 100;
const EPS = 1e-7;

function fvAt(rate: number, nper: number, pmt: number, pv: number, type: number): number {
  if (rate === 0) {
    return -(pv + pmt * nper);
  }
  const f = Math.pow(1 + rate, nper);
  return -(pv * f + pmt * (1 + rate * type) * ((f - 1) / rate));
}

export class FinancialPlugin extends FunctionPlugin {
  pmt(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("PMT"),
      (rate: number, nper: number, pv: number, fv = 0, type = 0) => {
        if (nper === 0) return numError();
        if (rate === 0) return -(pv + fv) / nper;
        const f = Math.pow(1 + rate, nper);
        return -(pv * f + fv) / ((1 + rate * type) * ((f - 1) / rate));
      },
    );
  }
  pv(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("PV"),
      (rate: number, nper: number, pmt: number, fv = 0, type = 0) => {
        if (rate === 0) return -(fv + pmt * nper);
        const f = Math.pow(1 + rate, nper);
        return -(fv + pmt * (1 + rate * type) * ((f - 1) / rate)) / f;
      },
    );
  }
  fv(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("FV"),
      (rate: number, nper: number, pmt: number, pv = 0, type = 0) =>
        fvAt(rate, nper, pmt, pv, type),
    );
  }
  npv(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("NPV"),
      (rate: number, ...vals: InternalScalarValue[]) => {
        const nums = numbersFrom(vals);
        let total = 0;
        for (let i = 0; i < nums.length; i++) {
          total += nums[i] / Math.pow(1 + rate, i + 1);
        }
        return total;
      },
    );
  }
  irr(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("IRR"),
      (range: SimpleRangeValue, guess = 0.1) => {
        const flows = numbersFrom(range.valuesFromTopLeftCorner());
        if (flows.length < 2) return numError();

        const npv = (r: number): number =>
          flows.reduce((acc, cf, i) => acc + cf / Math.pow(1 + r, i), 0);

        // Newton's method.
        let rate = guess;
        for (let iter = 0; iter < MAX_ITER; iter++) {
          const value = npv(rate);
          const deriv = flows.reduce((acc, cf, i) => acc - (i * cf) / Math.pow(1 + rate, i + 1), 0);
          if (Math.abs(deriv) < EPS) break;
          const next = rate - value / deriv;
          if (Math.abs(next - rate) < EPS) return next;
          rate = next;
        }

        // Bisection fallback over a wide bracket.
        let lo = -0.999999;
        let hi = 10;
        let flo = npv(lo);
        const fhi = npv(hi);
        if (flo * fhi > 0) return numError();
        for (let iter = 0; iter < MAX_ITER; iter++) {
          const mid = (lo + hi) / 2;
          const fmid = npv(mid);
          if (Math.abs(fmid) < EPS) return mid;
          if (flo * fmid < 0) {
            hi = mid;
          } else {
            lo = mid;
            flo = fmid;
          }
        }
        return (lo + hi) / 2;
      },
    );
  }
  rate(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("RATE"),
      (nper: number, pmt: number, pv: number, fv = 0, type = 0, guess = 0.1) => {
        let rate = guess;
        for (let iter = 0; iter < MAX_ITER; iter++) {
          const f = fvAt(rate, nper, pmt, pv, type) - fv;
          const delta = 1e-6;
          const fPrime = (fvAt(rate + delta, nper, pmt, pv, type) - fv - f) / delta;
          if (Math.abs(fPrime) < EPS) break;
          const next = rate - f / fPrime;
          if (Math.abs(next - rate) < EPS) return next;
          rate = next;
        }
        return numError();
      },
    );
  }
}

const num = { argumentType: T.NUMBER } as const;
const optZero = { argumentType: T.NUMBER, defaultValue: 0 } as const;

FinancialPlugin.implementedFunctions = {
  PMT: { method: "pmt", parameters: [num, num, num, optZero, optZero] },
  PV: { method: "pv", parameters: [num, num, num, optZero, optZero] },
  FV: { method: "fv", parameters: [num, num, num, optZero, optZero] },
  NPV: {
    method: "npv",
    parameters: [num, { argumentType: T.ANY }],
    repeatLastArgs: 1,
    expandRanges: true,
  },
  IRR: {
    method: "irr",
    parameters: [{ argumentType: T.RANGE }, { argumentType: T.NUMBER, defaultValue: 0.1 }],
  },
  RATE: {
    method: "rate",
    parameters: [num, num, num, optZero, optZero, { argumentType: T.NUMBER, defaultValue: 0.1 }],
  },
} satisfies ImplementedFunctions;
