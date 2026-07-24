/**
 * Lookup built-ins (VLOOKUP/HLOOKUP/INDEX/MATCH/LOOKUP). Operate over
 * SimpleRangeValue arguments.
 */

import { compareScalars } from "../coercion";
import { CellError } from "../errors";
import { ProcedureAst } from "../parser";
import { FunctionArgumentType as T, FunctionPlugin, ImplementedFunctions } from "../plugin";
import { InterpreterState } from "../typings/interpreter/InterpreterState";
import { InternalScalarValue, SimpleRangeValue } from "../values";
import { naError, valueError } from "./helpers";

function eq(a: InternalScalarValue, b: InternalScalarValue): boolean {
  const cmp = compareScalars(a, b);
  return !(cmp instanceof CellError) && cmp === 0;
}

export class LookupPlugin extends FunctionPlugin {
  vlookup(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("VLOOKUP"),
      (key: InternalScalarValue, range: SimpleRangeValue, colIndex: number, approx = true) => {
        const col = Math.trunc(colIndex);
        if (col < 1 || col > range.width()) return valueError();
        const rowIdx = this.searchColumn(key, range, approx);
        if (rowIdx === -1) return naError();
        return range.data[rowIdx][col - 1];
      },
    );
  }
  hlookup(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("HLOOKUP"),
      (key: InternalScalarValue, range: SimpleRangeValue, rowIndex: number, approx = true) => {
        const row = Math.trunc(rowIndex);
        if (row < 1 || row > range.height()) return valueError();
        const colIdx = this.searchRow(key, range, approx);
        if (colIdx === -1) return naError();
        return range.data[row - 1][colIdx];
      },
    );
  }
  index(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("INDEX"),
      (range: SimpleRangeValue, row: number, col = 1) => {
        const r = Math.trunc(row);
        const c = Math.trunc(col);
        // With a single row or column, a lone index selects along it.
        if (range.height() === 1 && ast.args.length < 3) {
          return range.data[0][r - 1] ?? valueError();
        }
        if (range.width() === 1 && ast.args.length < 3) {
          return range.data[r - 1]?.[0] ?? valueError();
        }
        if (r < 1 || r > range.height() || c < 1 || c > range.width()) return valueError();
        return range.data[r - 1][c - 1];
      },
    );
  }
  match(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("MATCH"),
      (key: InternalScalarValue, range: SimpleRangeValue, matchType = 1) => {
        const flat = range.valuesFromTopLeftCorner();
        const mt = Math.trunc(matchType);
        if (mt === 0) {
          const idx = flat.findIndex((v) => eq(v, key));
          return idx === -1 ? naError() : idx + 1;
        }
        // 1: largest <= key (asc); -1: smallest >= key (desc)
        let found = -1;
        for (let i = 0; i < flat.length; i++) {
          const cmp = compareScalars(flat[i], key);
          if (cmp instanceof CellError) continue;
          if (mt === 1 && cmp <= 0) found = i;
          if (mt === -1 && cmp >= 0) found = i;
        }
        return found === -1 ? naError() : found + 1;
      },
    );
  }
  lookup(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("LOOKUP"),
      (
        key: InternalScalarValue,
        lookupVector: SimpleRangeValue,
        resultVector?: SimpleRangeValue,
      ) => {
        const lookup = lookupVector.valuesFromTopLeftCorner();
        const result = resultVector ? resultVector.valuesFromTopLeftCorner() : lookup;
        let found = -1;
        for (let i = 0; i < lookup.length; i++) {
          const cmp = compareScalars(lookup[i], key);
          if (!(cmp instanceof CellError) && cmp <= 0) found = i;
        }
        if (found === -1 || found >= result.length) return naError();
        return result[found];
      },
    );
  }

  private searchColumn(key: InternalScalarValue, range: SimpleRangeValue, approx: boolean): number {
    let found = -1;
    for (let r = 0; r < range.height(); r++) {
      const cell = range.data[r][0];
      if (!approx) {
        if (eq(cell, key)) return r;
      } else {
        const cmp = compareScalars(cell, key);
        if (!(cmp instanceof CellError) && cmp <= 0) found = r;
      }
    }
    return found;
  }

  private searchRow(key: InternalScalarValue, range: SimpleRangeValue, approx: boolean): number {
    let found = -1;
    const row = range.data[0];
    for (let c = 0; c < row.length; c++) {
      if (!approx) {
        if (eq(row[c], key)) return c;
      } else {
        const cmp = compareScalars(row[c], key);
        if (!(cmp instanceof CellError) && cmp <= 0) found = c;
      }
    }
    return found;
  }
}

const range = { argumentType: T.RANGE } as const;
const scalar = { argumentType: T.SCALAR } as const;
const num = { argumentType: T.NUMBER } as const;

LookupPlugin.implementedFunctions = {
  VLOOKUP: {
    method: "vlookup",
    parameters: [scalar, range, num, { argumentType: T.BOOLEAN, defaultValue: true }],
  },
  HLOOKUP: {
    method: "hlookup",
    parameters: [scalar, range, num, { argumentType: T.BOOLEAN, defaultValue: true }],
  },
  INDEX: { method: "index", parameters: [range, num, { argumentType: T.NUMBER, defaultValue: 1 }] },
  MATCH: {
    method: "match",
    parameters: [scalar, range, { argumentType: T.NUMBER, defaultValue: 1 }],
  },
  LOOKUP: {
    method: "lookup",
    parameters: [scalar, range, { argumentType: T.RANGE, optionalArg: true }],
  },
} satisfies ImplementedFunctions;
