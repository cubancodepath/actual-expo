/**
 * Mirror of `hyperformula/typings/interpreter/InterpreterState` so upstream code
 * that imports the type compiles unchanged. Only the fields our interpreter
 * threads through are present.
 */
export type InterpreterState = {
  /** True inside an array-arithmetic context (unused by Actual, kept for parity). */
  arraysFlag?: boolean;
};
