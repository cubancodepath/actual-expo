/**
 * Zod validation for the goal editor form.
 *
 * Zod is only the Standard-Schema adapter TanStack Form consumes — the rules
 * themselves live in `screens/budget/goals/validate.ts` (the desktop-compatible,
 * fully tested source of truth) and are called from `superRefine`. Issue
 * messages carry the error `kind`; the UI never reads them for display — it
 * shows the rich domain error objects from `validateDraft`, computed by the
 * same functions, so the gate and the message can't disagree.
 */

import { z } from "zod";
import {
  entriesToTemplates,
  validateAutomation,
  validatePercentageAllocation,
  validateSchedulePriorities,
  type AutomationEntry,
  type AutomationErrorKind,
  type DisplayTemplateType,
  type GlobalConflictKind,
} from "@/screens/budget/goals";
import type { Template } from "@/core/types/models";
import type { Schedule } from "@/core/types/models";

/** One editing session: a single automation, saved or brand new. */
export type GoalFormValues = {
  /** null while creating — the entry doesn't exist outside the form yet. */
  entryId: string | null;
  displayType: DisplayTemplateType;
  template: Template;
};

/** What the validators need besides the draft itself. */
export type GoalValidationCtx = {
  savedEntries: AutomationEntry[];
  schedules: Schedule[];
  validPercentageSources: Set<string>;
};

/**
 * The category's entries as they would be written: the draft replacing its
 * saved entry, or appended when it's new. Cross-entry rules (percentage
 * totals, schedule priorities) must see this set, not the saved one.
 */
export function entriesWithDraft(
  saved: AutomationEntry[],
  values: GoalFormValues,
): AutomationEntry[] {
  const draft: AutomationEntry = {
    id: values.entryId ?? "__draft__",
    displayType: values.displayType,
    template: values.template,
  };
  const replaces = values.entryId != null && saved.some((e) => e.id === values.entryId);
  return replaces ? saved.map((e) => (e.id === values.entryId ? draft : e)) : [...saved, draft];
}

export type DraftValidation = {
  /** The draft's own error (amount, dates, schedule…), if any. */
  error: AutomationErrorKind | null;
  /** Category-wide conflicts the would-be-saved set trips. */
  conflicts: GlobalConflictKind[];
};

/** Run the domain validators against the draft — gate and display read this. */
export function validateDraft(values: GoalFormValues, ctx: GoalValidationCtx): DraftValidation {
  const all = entriesWithDraft(ctx.savedEntries, values);
  const templates = all.map((e) => e.template);

  const error = validateAutomation(
    values.template,
    values.displayType,
    templates,
    ctx.schedules,
    new Date(),
    ctx.validPercentageSources,
  );

  const conflicts: GlobalConflictKind[] = [];
  const percentage = validatePercentageAllocation(templates);
  if (percentage) conflicts.push(percentage);
  // entriesToTemplates() pins schedule/by priorities together on save, so
  // check what will actually be written rather than the raw draft.
  const priority = validateSchedulePriorities(entriesToTemplates(all));
  if (priority) conflicts.push(priority);

  return { error: error ?? null, conflicts };
}

/**
 * The form's validator. `getCtx` reads a ref so every run sees the current
 * saved entries and schedules without rebuilding the schema.
 */
export function makeGoalFormSchema(getCtx: () => GoalValidationCtx) {
  return z
    .object({
      entryId: z.string().nullable(),
      displayType: z.custom<DisplayTemplateType>((v) => typeof v === "string"),
      template: z.custom<Template>((v) => v != null && typeof v === "object"),
    })
    .superRefine((val, issues) => {
      const { error, conflicts } = validateDraft(val as GoalFormValues, getCtx());
      if (error) {
        issues.addIssue({ code: "custom", path: ["template"], message: error.kind });
      }
      for (const conflict of conflicts) {
        issues.addIssue({ code: "custom", path: ["template"], message: conflict.kind });
      }
    });
}
