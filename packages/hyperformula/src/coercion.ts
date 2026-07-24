/**
 * Scalar coercions, matching HyperFormula's ArithmeticHelper semantics:
 *  - numeric strings coerce to numbers in arithmetic, NOT in comparisons;
 *  - EmptyValue coerces to 0 (arithmetic) / '' (concat) / FALSE (boolean);
 *  - string comparison is case-insensitive by default (Config.caseSensitive=false);
 *  - cross-type comparison orders number < string < boolean and is never equal.
 */

import { parseDateToSerial } from "./dates";
import { CellError, ErrorType } from "./errors";
import { EmptyValue, InternalScalarValue } from "./values";

export type CoercionContext = {
  dateFormats: string[];
  caseSensitive: boolean;
};

export const DEFAULT_COERCION: CoercionContext = {
  dateFormats: ["DD/MM/YYYY", "YYYY-MM-DD", "YYYY/MM/DD"],
  caseSensitive: false,
};

/** Parse a bare numeric string like "  5 ", "-3.5", "1e3". */
function parseNumberLiteral(str: string): number | undefined {
  const trimmed = str.trim();
  if (trimmed === "") {
    return undefined;
  }
  // Percentage suffix.
  if (trimmed.endsWith("%")) {
    const inner = trimmed.slice(0, -1).trim();
    const n = Number(inner);
    return Number.isNaN(n) ? undefined : n / 100;
  }
  const n = Number(trimmed);
  return Number.isNaN(n) ? undefined : n;
}

/** Coerce a scalar to a number, or a CellError (#VALUE!) if impossible. */
export function coerceScalarToNumber(
  value: InternalScalarValue,
  ctx: CoercionContext = DEFAULT_COERCION,
): number | CellError {
  if (value instanceof CellError) {
    return value;
  }
  if (value === EmptyValue) {
    return 0;
  }
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  const num = parseNumberLiteral(value);
  if (num !== undefined) {
    return num;
  }
  const serial = parseDateToSerial(value, ctx.dateFormats);
  if (serial !== undefined) {
    return serial;
  }
  return new CellError(ErrorType.VALUE, "Number expected");
}

/** Coerce a scalar to a string, or propagate a CellError. */
export function coerceScalarToString(value: InternalScalarValue): string | CellError {
  if (value instanceof CellError) {
    return value;
  }
  if (value === EmptyValue) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "boolean") {
    return value ? "TRUE" : "FALSE";
  }
  return String(value);
}

/** Coerce a scalar to a boolean, undefined if not coercible, or a CellError. */
export function coerceScalarToBoolean(value: InternalScalarValue): boolean | CellError | undefined {
  if (value instanceof CellError) {
    return value;
  }
  if (value === EmptyValue) {
    return false;
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  const lower = value.toLowerCase();
  if (lower === "true") {
    return true;
  }
  if (lower === "false") {
    return false;
  }
  return undefined;
}

type Rank = 0 | 1 | 2;
function typeRank(value: number | string | boolean): Rank {
  if (typeof value === "number") {
    return 0;
  }
  return typeof value === "string" ? 1 : 2;
}

/**
 * Three-way comparison of two non-error scalars. EmptyValue is coerced to match
 * the other operand's type. Returns -1 | 0 | 1, or a CellError.
 */
export function compareScalars(
  a: InternalScalarValue,
  b: InternalScalarValue,
  ctx: CoercionContext = DEFAULT_COERCION,
): number | CellError {
  if (a instanceof CellError) {
    return a;
  }
  if (b instanceof CellError) {
    return b;
  }

  // Resolve empties against the other side's type.
  let left = a;
  let right = b;
  if (left === EmptyValue && right === EmptyValue) {
    return 0;
  }
  if (left === EmptyValue) {
    left = emptyLike(right as number | string | boolean);
  }
  if (right === EmptyValue) {
    right = emptyLike(left as number | string | boolean);
  }

  const lv = left as number | string | boolean;
  const rv = right as number | string | boolean;

  const lr = typeRank(lv);
  const rr = typeRank(rv);
  if (lr !== rr) {
    return lr < rr ? -1 : 1;
  }

  if (typeof lv === "number" && typeof rv === "number") {
    return lv < rv ? -1 : lv > rv ? 1 : 0;
  }
  if (typeof lv === "boolean" && typeof rv === "boolean") {
    const ln = lv ? 1 : 0;
    const rn = rv ? 1 : 0;
    return ln < rn ? -1 : ln > rn ? 1 : 0;
  }
  // both strings
  let ls = lv as string;
  let rs = rv as string;
  if (!ctx.caseSensitive) {
    ls = ls.toLowerCase();
    rs = rs.toLowerCase();
  }
  return ls < rs ? -1 : ls > rs ? 1 : 0;
}

function emptyLike(other: number | string | boolean): number | string | boolean {
  if (typeof other === "number") {
    return 0;
  }
  if (typeof other === "boolean") {
    return false;
  }
  return "";
}
