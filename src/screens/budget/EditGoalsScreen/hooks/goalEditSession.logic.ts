/**
 * Pure core of `useGoalEditSession`: deriving the form's initial seed from the
 * route + saved entries, and computing the entry set a save should write.
 *
 * Split out so this logic is testable without TanStack Form/React Query —
 * the hook itself stays a thin wrapper that wires these into `useForm` and
 * the save/delete mutations.
 */

import {
  createAutomationEntry,
  createDefaultTemplate,
  type AutomationEntry,
  type DisplayTemplateType,
} from "@/screens/budget/goals";
import type { GoalFormValues } from "../validation/goalForm.schema";

/** The editing session's identity + initial form values, from the route. */
export type GoalEditSeed = { key: string; values: GoalFormValues };

/**
 * `entryId` (edit a saved automation) or `newType` (start a fresh draft)
 * determine the session: an existing entry seeds the form with its saved
 * values; otherwise a brand-new draft is created for that display type.
 * `key` doubles as the form's `formId` — a different entry (or a new draft)
 * is a different form, so TanStack Form never needs an imperative reset.
 */
export function computeGoalEditSeed({
  entryId,
  newType,
  savedEntries,
}: {
  entryId?: string;
  newType?: string;
  savedEntries: AutomationEntry[];
}): GoalEditSeed {
  const entry = entryId ? savedEntries.find((e) => e.id === entryId) : undefined;
  if (entry) {
    return {
      key: entry.id,
      values: { entryId: entry.id, displayType: entry.displayType, template: entry.template },
    };
  }
  const type = (newType ?? "fixed") as DisplayTemplateType;
  return {
    key: `new-${type}`,
    values: { entryId: null, displayType: type, template: createDefaultTemplate(type) },
  };
}

/**
 * The entry set a save should persist: the draft replaces its saved entry
 * (edit session), or is appended as a new entry (create session). Mirrors
 * `entriesWithDraft` in `goalForm.schema.ts` but produces a *persisted*
 * `AutomationEntry` (via `createAutomationEntry`) for new drafts, rather than
 * the `__draft__`-id placeholder used for validation.
 */
export function computeNextEntries(
  values: GoalFormValues,
  savedEntries: AutomationEntry[],
): AutomationEntry[] {
  const replaces = values.entryId != null && savedEntries.some((e) => e.id === values.entryId);
  return replaces
    ? savedEntries.map((e) =>
        e.id === values.entryId
          ? { ...e, displayType: values.displayType, template: values.template }
          : e,
      )
    : [...savedEntries, createAutomationEntry(values.template, values.displayType)];
}
