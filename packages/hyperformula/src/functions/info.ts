/**
 * Information / predicate built-ins. The IS* predicates take SCALAR arguments so
 * errors and blanks reach the impl instead of short-circuiting.
 */

import { coerceScalarToNumber } from "../coercion";
import { CellError, ErrorType } from "../errors";
import { ProcedureAst } from "../parser";
import { FunctionArgumentType as T, FunctionPlugin, ImplementedFunctions } from "../plugin";
import { InterpreterState } from "../typings/interpreter/InterpreterState";
import { EmptyValue, InternalScalarValue } from "../values";

export class InfoPlugin extends FunctionPlugin {
  isblank(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("ISBLANK"),
      (v: InternalScalarValue) => v === EmptyValue,
    );
  }
  iserror(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("ISERROR"),
      (v: InternalScalarValue) => v instanceof CellError,
    );
  }
  isna(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("ISNA"),
      (v: InternalScalarValue) => v instanceof CellError && v.type === ErrorType.NA,
    );
  }
  isnumber(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("ISNUMBER"),
      (v: InternalScalarValue) => typeof v === "number",
    );
  }
  istext(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("ISTEXT"),
      (v: InternalScalarValue) => typeof v === "string",
    );
  }
  islogical(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("ISLOGICAL"),
      (v: InternalScalarValue) => typeof v === "boolean",
    );
  }
  isref(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(ast.args, state, this.metadata("ISREF"), () => false);
  }
  iseven(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("ISEVEN"),
      (n: number) => Math.trunc(n) % 2 === 0,
    );
  }
  isodd(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("ISODD"),
      (n: number) => Math.abs(Math.trunc(n)) % 2 === 1,
    );
  }
  n(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(ast.args, state, this.metadata("N"), (v: InternalScalarValue) => {
      if (v instanceof CellError) return v;
      if (typeof v === "number") return v;
      if (typeof v === "boolean") return v ? 1 : 0;
      if (v === EmptyValue) return 0;
      const n = coerceScalarToNumber(v, this.interpreter.coercionCtx);
      return n instanceof CellError ? 0 : n;
    });
  }
}

const scalar = { argumentType: T.SCALAR } as const;
const num = { argumentType: T.NUMBER } as const;

InfoPlugin.implementedFunctions = {
  ISBLANK: { method: "isblank", parameters: [scalar] },
  ISERROR: { method: "iserror", parameters: [scalar] },
  ISNA: { method: "isna", parameters: [scalar] },
  ISNUMBER: { method: "isnumber", parameters: [scalar] },
  ISTEXT: { method: "istext", parameters: [scalar] },
  ISLOGICAL: { method: "islogical", parameters: [scalar] },
  ISREF: { method: "isref", parameters: [scalar] },
  ISEVEN: { method: "iseven", parameters: [num] },
  ISODD: { method: "isodd", parameters: [num] },
  N: { method: "n", parameters: [scalar] },
} satisfies ImplementedFunctions;
