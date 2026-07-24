/**
 * Value model — the scalar/range values that flow through the interpreter.
 *
 * Scalars: number | string | boolean | CellError | EmptyValueType.
 * Ranges: SimpleRangeValue (a 2D grid of scalars).
 *
 * `EmptyValue` is a shared singleton compared by identity — upstream custom
 * functions rely on `value !== EmptyValue` (see customFunctions.ts
 * categoryRangeToIds).
 */

import { CellError } from "./errors";

/** The unique "empty cell" marker. Compared by identity. */
export const EmptyValue: unique symbol = Symbol("hyperformula.EmptyValue");
export type EmptyValueType = typeof EmptyValue;

export type InternalScalarValue = number | string | boolean | CellError | EmptyValueType;

export type InterpreterValue = InternalScalarValue | SimpleRangeValue;

/** Raw values a caller may hand to addNamedExpression / setCellContents. */
export type RawScalarValue = number | string | boolean | null | undefined;

/**
 * A 2D range of scalar values. Actual only ever uses single-column spilled
 * results (QUERY_EXTRACT_CATEGORIES) and inline array literals as function
 * arguments, but the full grid shape is supported for parity.
 */
export class SimpleRangeValue {
  private constructor(public readonly data: InternalScalarValue[][]) {}

  /** Build a range from a raw 2D array of scalars. */
  static onlyValues(data: InternalScalarValue[][]): SimpleRangeValue {
    return new SimpleRangeValue(data.length > 0 ? data : [[]]);
  }

  /** Number of rows. */
  height(): number {
    return this.data.length;
  }

  /** Number of columns (width of the first row). */
  width(): number {
    return this.data.length === 0 ? 0 : this.data[0].length;
  }

  /** Flatten row-major, left-to-right, top-to-bottom. */
  valuesFromTopLeftCorner(): InternalScalarValue[] {
    const out: InternalScalarValue[] = [];
    for (const row of this.data) {
      for (const cell of row) {
        out.push(cell);
      }
    }
    return out;
  }

  /** The top-left scalar, used when a range is coerced to a single cell. */
  topLeft(): InternalScalarValue | undefined {
    return this.data[0]?.[0];
  }
}

/** Predicted size of a spilled function result. */
export class ArraySize {
  constructor(
    public readonly width: number,
    public readonly height: number,
    public readonly isRef: boolean = false,
  ) {}

  static error(): ArraySize {
    return new ArraySize(1, 1, true);
  }

  static scalar(): ArraySize {
    return new ArraySize(1, 1);
  }
}

export function isSimpleRangeValue(v: unknown): v is SimpleRangeValue {
  return v instanceof SimpleRangeValue;
}
