import type { AutomationErrorKind, GlobalConflictKind } from "@/screens/budget/goals";

/**
 * i18n key for a per-automation error. The error object doubles as the
 * interpolation params, so `name`, `percent`, `month` and `source` reach the
 * message without a per-kind mapping.
 *
 * Returned `as const` so the key stays a literal union that i18next can check
 * against `budget.json` — a missing message is then a type error, not a raw
 * key rendered at the user.
 */
export function errorMessageKey(error: AutomationErrorKind) {
  return `goals.errors.${error.kind}` as const;
}

export function conflictMessageKey(conflict: GlobalConflictKind) {
  return `goals.conflicts.${conflict.kind}` as const;
}

/**
 * Errors that disable saving without shouting about it. A zero amount is the
 * starting state of every new goal — graying the save button out says enough;
 * an alert would nag before the user has done anything wrong.
 */
export function isSilentError(error: AutomationErrorKind): boolean {
  return error.kind === "amount-zero";
}
