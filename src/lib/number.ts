/**
 * Ported from Actual Budget's loot-core/src/shared/util.ts::safeNumber.
 *
 * Budget arithmetic is done entirely in integer cents. Any result that
 * isn't an integer, or overflows the safe range for exact float math,
 * signals a bug in the formula that produced it — throwing here turns a
 * silent, cascading wrong-balance bug into an immediate, loud one at the
 * cell that produced the bad value.
 */

// gives division more room to be correct
const MAX_SAFE_NUMBER = 2 ** 51 - 1;
const MIN_SAFE_NUMBER = -MAX_SAFE_NUMBER;

export function safeNumber(value: number): number {
  if (!Number.isInteger(value)) {
    throw new Error("safeNumber: number is not an integer: " + JSON.stringify(value));
  }
  if (value > MAX_SAFE_NUMBER || value < MIN_SAFE_NUMBER) {
    throw new Error("safeNumber: can't safely perform arithmetic with number: " + value);
  }
  return value;
}
