/**
 * Impl-side helpers. Fixed-arity functions receive values already coerced by
 * runFunction; variadic/aggregation functions (SUM, COUNT, …) use
 * `expandRanges` and receive raw scalars, so they coerce/filter here.
 */

import { CellError, ErrorType } from "../errors";
import { EmptyValue, InternalScalarValue } from "../values";

export { CellError, ErrorType };

export function isErr(v: unknown): v is CellError {
  return v instanceof CellError;
}

export function firstError(values: InternalScalarValue[]): CellError | undefined {
  for (const v of values) {
    if (v instanceof CellError) {
      return v;
    }
  }
  return undefined;
}

/** Numbers from a flat scalar list, skipping empty/text/booleans (range-style). */
export function numbersFrom(values: InternalScalarValue[]): number[] {
  const out: number[] = [];
  for (const v of values) {
    if (typeof v === "number") {
      out.push(v);
    }
  }
  return out;
}

/** A number, or undefined if not a plain number. */
export function asNumber(v: InternalScalarValue): number | undefined {
  return typeof v === "number" ? v : undefined;
}

export function valueError(message?: string): CellError {
  return new CellError(ErrorType.VALUE, message);
}

export function numError(message?: string): CellError {
  return new CellError(ErrorType.NUM, message);
}

export function naError(message?: string): CellError {
  return new CellError(ErrorType.NA, message);
}

export function isEmpty(v: InternalScalarValue): boolean {
  return v === EmptyValue;
}

/**
 * Excel criteria matching for SUMIF/COUNTIF: a criterion is either a value
 * (equality) or a string like ">100", "<=3", "<>x", or a plain value with
 * `*`/`?` wildcards.
 */
export function matchesCriterion(
  value: InternalScalarValue,
  criterion: InternalScalarValue,
): boolean {
  if (typeof criterion === "number" || typeof criterion === "boolean") {
    return value === criterion;
  }
  if (typeof criterion !== "string") {
    return false;
  }

  const m = /^(<=|>=|<>|=|<|>)?(.*)$/.exec(criterion);
  const op = m?.[1] ?? "";
  const rest = m?.[2] ?? "";

  // Numeric comparison when the right side is numeric.
  const restNum = rest.trim() === "" ? NaN : Number(rest);
  const valNum = typeof value === "number" ? value : NaN;

  if (op && op !== "=" && op !== "<>") {
    if (Number.isNaN(restNum) || Number.isNaN(valNum)) {
      // string comparison
      const vs = String(value).toLowerCase();
      const rs = rest.toLowerCase();
      switch (op) {
        case "<":
          return vs < rs;
        case ">":
          return vs > rs;
        case "<=":
          return vs <= rs;
        case ">=":
          return vs >= rs;
      }
    }
    switch (op) {
      case "<":
        return valNum < restNum;
      case ">":
        return valNum > restNum;
      case "<=":
        return valNum <= restNum;
      case ">=":
        return valNum >= restNum;
    }
  }

  const negate = op === "<>";
  const target = op === "=" || op === "<>" ? rest : criterion;

  let eq: boolean;
  if (/[*?]/.test(target)) {
    eq = wildcardMatch(String(value), target);
  } else if (!Number.isNaN(restNum) && !Number.isNaN(valNum) && (op === "=" || op === "<>")) {
    eq = valNum === restNum;
  } else if (op === "" && typeof value === "number" && !Number.isNaN(Number(criterion))) {
    eq = value === Number(criterion);
  } else {
    eq = String(value).toLowerCase() === target.toLowerCase();
  }

  return negate ? !eq : eq;
}

function wildcardMatch(value: string, pattern: string): boolean {
  let re = "";
  for (const ch of pattern) {
    if (ch === "*") {
      re += ".*";
    } else if (ch === "?") {
      re += ".";
    } else if ("\\^$.|+()[]{}".includes(ch)) {
      re += "\\" + ch;
    } else {
      re += ch;
    }
  }
  return new RegExp(`^${re}$`, "i").test(value);
}
