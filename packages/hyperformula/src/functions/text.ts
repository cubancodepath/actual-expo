/**
 * Text built-ins. TEXT() understands date tokens (YYYY/MM/DD) for serial dates
 * and a basic numeric format grammar (0, 0.00, #,##0.00, 0%).
 */

import { formatSerial } from "../dates";
import { ProcedureAst } from "../parser";
import { FunctionArgumentType as T, FunctionPlugin, ImplementedFunctions } from "../plugin";
import { InterpreterState } from "../typings/interpreter/InterpreterState";
import { InternalScalarValue, SimpleRangeValue } from "../values";
import { coerceScalarToString } from "../coercion";
import { valueError } from "./helpers";

function formatNumberPattern(value: number, pattern: string): string {
  const isPercent = pattern.includes("%");
  let v = value;
  if (isPercent) {
    v = v * 100;
  }
  const hasThousands = /[#0],[#0]/.test(pattern);
  const decMatch = /\.(0+)/.exec(pattern);
  const decimals = decMatch ? decMatch[1].length : 0;
  let s = Math.abs(v).toFixed(decimals);
  if (hasThousands) {
    const [int, dec] = s.split(".");
    const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    s = dec ? `${grouped}.${dec}` : grouped;
  }
  if (v < 0) {
    s = `-${s}`;
  }
  return isPercent ? `${s}%` : s;
}

export class TextPlugin extends FunctionPlugin {
  concatenate(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("CONCATENATE"),
      (...vals: InternalScalarValue[]) =>
        vals
          .map((v) => {
            const s = coerceScalarToString(v);
            return typeof s === "string" ? s : "";
          })
          .join(""),
    );
  }
  len(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(ast.args, state, this.metadata("LEN"), (s: string) => s.length);
  }
  lower(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(ast.args, state, this.metadata("LOWER"), (s: string) =>
      s.toLowerCase(),
    );
  }
  upper(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(ast.args, state, this.metadata("UPPER"), (s: string) =>
      s.toUpperCase(),
    );
  }
  trim(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(ast.args, state, this.metadata("TRIM"), (s: string) =>
      s.replace(/\s+/g, " ").trim(),
    );
  }
  proper(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(ast.args, state, this.metadata("PROPER"), (s: string) =>
      s.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\B\w/g, (c) => c.toLowerCase()),
    );
  }
  clean(ast: ProcedureAst, state: InterpreterState) {
    // eslint-disable-next-line no-control-regex
    return this.runFunction(ast.args, state, this.metadata("CLEAN"), (s: string) =>
      s.replace(/[\x00-\x1F]/g, ""),
    );
  }
  char(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(ast.args, state, this.metadata("CHAR"), (n: number) => {
      const code = Math.trunc(n);
      if (code < 1 || code > 255) return valueError();
      return String.fromCharCode(code);
    });
  }
  code(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(ast.args, state, this.metadata("CODE"), (s: string) =>
      s.length === 0 ? valueError() : s.charCodeAt(0),
    );
  }
  left(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(ast.args, state, this.metadata("LEFT"), (s: string, n = 1) =>
      s.slice(0, Math.max(0, Math.trunc(n))),
    );
  }
  right(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(ast.args, state, this.metadata("RIGHT"), (s: string, n = 1) => {
      const k = Math.max(0, Math.trunc(n));
      return k === 0 ? "" : s.slice(-k);
    });
  }
  mid(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("MID"),
      (s: string, start: number, len: number) => {
        const from = Math.trunc(start) - 1;
        if (from < 0) return valueError();
        return s.slice(from, from + Math.max(0, Math.trunc(len)));
      },
    );
  }
  rept(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(ast.args, state, this.metadata("REPT"), (s: string, n: number) => {
      const k = Math.trunc(n);
      return k <= 0 ? "" : s.repeat(k);
    });
  }
  exact(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("EXACT"),
      (a: string, b: string) => a === b,
    );
  }
  find(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("FIND"),
      (needle: string, hay: string, start = 1) => {
        const idx = hay.indexOf(needle, Math.max(0, Math.trunc(start) - 1));
        return idx === -1 ? valueError() : idx + 1;
      },
    );
  }
  search(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("SEARCH"),
      (needle: string, hay: string, start = 1) => {
        const idx = hay
          .toLowerCase()
          .indexOf(needle.toLowerCase(), Math.max(0, Math.trunc(start) - 1));
        return idx === -1 ? valueError() : idx + 1;
      },
    );
  }
  substitute(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("SUBSTITUTE"),
      (text: string, oldText: string, newText: string, instance?: number) => {
        if (oldText === "") return text;
        if (instance === undefined) {
          return text.split(oldText).join(newText);
        }
        const which = Math.trunc(instance);
        let count = 0;
        let idx = 0;
        let result = text;
        let searchFrom = 0;
        while ((idx = result.indexOf(oldText, searchFrom)) !== -1) {
          count++;
          if (count === which) {
            return result.slice(0, idx) + newText + result.slice(idx + oldText.length);
          }
          searchFrom = idx + oldText.length;
        }
        return result;
      },
    );
  }
  replace(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("REPLACE"),
      (text: string, start: number, len: number, newText: string) => {
        const from = Math.trunc(start) - 1;
        if (from < 0) return valueError();
        return text.slice(0, from) + newText + text.slice(from + Math.max(0, Math.trunc(len)));
      },
    );
  }
  value(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(ast.args, state, this.metadata("VALUE"), (s: string) => {
      const n = Number(String(s).trim().replace(/,/g, ""));
      return Number.isNaN(n) ? valueError() : n;
    });
  }
  t(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(ast.args, state, this.metadata("T"), (v: InternalScalarValue) =>
      typeof v === "string" ? v : "",
    );
  }
  split(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("SPLIT"),
      (text: string, delimiter: string) => {
        const parts = delimiter === "" ? [text] : text.split(delimiter);
        return SimpleRangeValue.onlyValues([parts]);
      },
    );
  }
  text(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("TEXT"),
      (value: number, format: string) => {
        if (/[YyMDdHhSs]/.test(format) && /[YMD]/.test(format)) {
          return formatSerial(value, format);
        }
        return formatNumberPattern(value, format);
      },
    );
  }
}

const str = { argumentType: T.STRING } as const;
const num = { argumentType: T.NUMBER } as const;

TextPlugin.implementedFunctions = {
  CONCATENATE: {
    method: "concatenate",
    parameters: [{ argumentType: T.ANY }],
    repeatLastArgs: 1,
    expandRanges: true,
  },
  LEN: { method: "len", parameters: [str] },
  LOWER: { method: "lower", parameters: [str] },
  UPPER: { method: "upper", parameters: [str] },
  TRIM: { method: "trim", parameters: [str] },
  PROPER: { method: "proper", parameters: [str] },
  CLEAN: { method: "clean", parameters: [str] },
  CHAR: { method: "char", parameters: [num] },
  CODE: { method: "code", parameters: [str] },
  LEFT: { method: "left", parameters: [str, { argumentType: T.NUMBER, defaultValue: 1 }] },
  RIGHT: { method: "right", parameters: [str, { argumentType: T.NUMBER, defaultValue: 1 }] },
  MID: { method: "mid", parameters: [str, num, num] },
  REPT: { method: "rept", parameters: [str, num] },
  EXACT: { method: "exact", parameters: [str, str] },
  FIND: { method: "find", parameters: [str, str, { argumentType: T.NUMBER, defaultValue: 1 }] },
  SEARCH: { method: "search", parameters: [str, str, { argumentType: T.NUMBER, defaultValue: 1 }] },
  SUBSTITUTE: {
    method: "substitute",
    parameters: [str, str, str, { argumentType: T.NUMBER, optionalArg: true }],
  },
  REPLACE: { method: "replace", parameters: [str, num, num, str] },
  VALUE: { method: "value", parameters: [str] },
  T: { method: "t", parameters: [{ argumentType: T.SCALAR }] },
  SPLIT: { method: "split", parameters: [str, str] },
  TEXT: { method: "text", parameters: [num, str] },
} satisfies ImplementedFunctions;

TextPlugin.aliases = { CONCAT: "CONCATENATE" };
