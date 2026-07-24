/**
 * Logical built-ins. IF/IFERROR/IFNA/IFS/SWITCH/CHOOSE use SCALAR-typed branch
 * arguments so a CellError in an untaken branch is handed to the impl instead of
 * short-circuiting — that is how the interception functions can catch errors.
 */

import { coerceScalarToBoolean } from "../coercion";
import { CellError, ErrorType } from "../errors";
import { ProcedureAst } from "../parser";
import { FunctionArgumentType as T, FunctionPlugin, ImplementedFunctions } from "../plugin";
import { InterpreterState } from "../typings/interpreter/InterpreterState";
import { EmptyValue, InternalScalarValue } from "../values";
import { isErr, naError, valueError } from "./helpers";

function toBoolList(vals: InternalScalarValue[]): boolean[] | CellError {
  const out: boolean[] = [];
  for (const v of vals) {
    if (v instanceof CellError) {
      return v;
    }
    if (v === EmptyValue || typeof v === "string") {
      continue; // ignore blanks/text in ranges
    }
    const b = coerceScalarToBoolean(v);
    if (b instanceof CellError) {
      return b;
    }
    if (b !== undefined) {
      out.push(b);
    }
  }
  return out;
}

export class LogicalPlugin extends FunctionPlugin {
  literalTrue(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(ast.args, state, this.metadata("TRUE"), () => true);
  }
  literalFalse(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(ast.args, state, this.metadata("FALSE"), () => false);
  }
  not(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(ast.args, state, this.metadata("NOT"), (b: boolean) => !b);
  }
  and(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("AND"),
      (...vals: InternalScalarValue[]) => {
        const bs = toBoolList(vals);
        if (bs instanceof CellError) return bs;
        if (bs.length === 0) return valueError();
        return bs.every(Boolean);
      },
    );
  }
  or(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("OR"),
      (...vals: InternalScalarValue[]) => {
        const bs = toBoolList(vals);
        if (bs instanceof CellError) return bs;
        if (bs.length === 0) return valueError();
        return bs.some(Boolean);
      },
    );
  }
  xor(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("XOR"),
      (...vals: InternalScalarValue[]) => {
        const bs = toBoolList(vals);
        if (bs instanceof CellError) return bs;
        if (bs.length === 0) return valueError();
        return bs.filter(Boolean).length % 2 === 1;
      },
    );
  }
  if(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("IF"),
      (cond: boolean, ifTrue: InternalScalarValue, ifFalse: InternalScalarValue = false) =>
        cond ? ifTrue : ifFalse,
    );
  }
  iferror(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("IFERROR"),
      (value: InternalScalarValue, alt: InternalScalarValue) => (isErr(value) ? alt : value),
    );
  }
  ifna(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("IFNA"),
      (value: InternalScalarValue, alt: InternalScalarValue) =>
        value instanceof CellError && value.type === ErrorType.NA ? alt : value,
    );
  }
  ifs(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("IFS"),
      (...args: InternalScalarValue[]) => {
        for (let i = 0; i + 1 < args.length; i += 2) {
          const cond = args[i];
          if (cond instanceof CellError) return cond;
          const b = coerceScalarToBoolean(cond === EmptyValue ? false : cond);
          if (b instanceof CellError) return b;
          if (b) return args[i + 1];
        }
        return naError();
      },
    );
  }
  switch(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("SWITCH"),
      (...args: InternalScalarValue[]) => {
        const subject = args[0];
        if (subject instanceof CellError) return subject;
        const rest = args.slice(1);
        let i = 0;
        for (; i + 1 < rest.length; i += 2) {
          if (rest[i] === subject) return rest[i + 1];
        }
        // trailing odd arg is the default
        return i < rest.length ? rest[i] : naError();
      },
    );
  }
  choose(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("CHOOSE"),
      (index: number, ...vals: InternalScalarValue[]) => {
        const idx = Math.trunc(index);
        if (idx < 1 || idx > vals.length) return valueError();
        return vals[idx - 1];
      },
    );
  }
}

const scalar = { argumentType: T.SCALAR } as const;

LogicalPlugin.implementedFunctions = {
  TRUE: { method: "literalTrue", parameters: [] },
  FALSE: { method: "literalFalse", parameters: [] },
  NOT: { method: "not", parameters: [{ argumentType: T.BOOLEAN }] },
  AND: {
    method: "and",
    parameters: [{ argumentType: T.ANY }],
    repeatLastArgs: 1,
    expandRanges: true,
  },
  OR: {
    method: "or",
    parameters: [{ argumentType: T.ANY }],
    repeatLastArgs: 1,
    expandRanges: true,
  },
  XOR: {
    method: "xor",
    parameters: [{ argumentType: T.ANY }],
    repeatLastArgs: 1,
    expandRanges: true,
  },
  IF: {
    method: "if",
    parameters: [
      { argumentType: T.BOOLEAN },
      scalar,
      { argumentType: T.SCALAR, defaultValue: false },
    ],
  },
  IFERROR: { method: "iferror", parameters: [scalar, scalar] },
  IFNA: { method: "ifna", parameters: [scalar, scalar] },
  IFS: { method: "ifs", parameters: [scalar], repeatLastArgs: 1 },
  SWITCH: { method: "switch", parameters: [scalar], repeatLastArgs: 1 },
  CHOOSE: {
    method: "choose",
    parameters: [{ argumentType: T.NUMBER }, scalar],
    repeatLastArgs: 1,
  },
} satisfies ImplementedFunctions;
