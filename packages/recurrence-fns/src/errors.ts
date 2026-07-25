export type RecurrenceErrorCode =
  | "invalid-options"
  | "unbounded-reverse"
  | "unbounded-drain"
  | "iteration-limit";

export class RecurrenceError extends Error {
  readonly code: RecurrenceErrorCode;

  constructor(code: RecurrenceErrorCode, message: string) {
    super(message);
    this.name = "RecurrenceError";
    this.code = code;
  }
}
