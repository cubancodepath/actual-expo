/**
 * Error model — mirrors HyperFormula's CellError / DetailedCellError shape.
 *
 * Callers detect a formula error by inspecting the value returned from
 * getCellValue: HyperFormula returns a DetailedCellError object with `type`,
 * `value` (the display string like "#DIV/0!") and `message`. See
 * `rules/action.ts` which checks `'type' in cellValue`.
 */

export enum ErrorType {
  /** Wrong type of argument. */
  VALUE = "VALUE",
  /** Division by zero. */
  DIV_BY_ZERO = "DIV_BY_ZERO",
  /** Unknown function / name / named expression. */
  NAME = "NAME",
  /** Value not available. */
  NA = "NA",
  /** Invalid numeric value for the operation. */
  NUM = "NUM",
  /** Invalid cell reference. */
  REF = "REF",
  /** Cyclic dependency (not reachable in the single-cell world, kept for parity). */
  CYCLE = "CYCLE",
  /** Generic error (e.g. parse failure). */
  ERROR = "ERROR",
}

/** Map an ErrorType to its spreadsheet display string. */
export const ERROR_DISPLAY: Record<ErrorType, string> = {
  [ErrorType.VALUE]: "#VALUE!",
  [ErrorType.DIV_BY_ZERO]: "#DIV/0!",
  [ErrorType.NAME]: "#NAME?",
  [ErrorType.NA]: "#N/A",
  [ErrorType.NUM]: "#NUM!",
  [ErrorType.REF]: "#REF!",
  [ErrorType.CYCLE]: "#CYCLE!",
  [ErrorType.ERROR]: "#ERROR!",
};

/**
 * A computation error propagated as a value (not thrown). Operators and
 * functions return a CellError; IFERROR/ISERROR/IFNA intercept it.
 */
export class CellError {
  constructor(
    public readonly type: ErrorType,
    public readonly message?: string,
  ) {}

  static parsingError(message?: string): CellError {
    return new CellError(ErrorType.ERROR, message);
  }
}

/**
 * The public error object returned from getCellValue — carries the display
 * string so consumers can render it, and satisfies the `'type' in value` check.
 */
export class DetailedCellError {
  public readonly type: ErrorType;
  public readonly value: string;
  public readonly message: string;
  public readonly address?: string;

  constructor(error: CellError, value: string, address?: string) {
    this.type = error.type;
    this.value = value;
    this.message = error.message ?? "";
    this.address = address;
  }

  toString(): string {
    return this.value;
  }
}

export function isCellError(value: unknown): value is CellError {
  return value instanceof CellError;
}
