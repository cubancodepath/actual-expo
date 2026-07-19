import { useCallback, useMemo, useRef } from "react";
import { useRouter } from "expo-router";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  entriesToTemplates,
  retypeTemplate,
  setGoalTemplates,
  type AutomationEntry,
  type DisplayTemplateType,
} from "@/core/domain/goals";
import { updateGoalIndicator } from "@/core/domain/goals/apply";
import { batchMessages } from "@/core/sync/batch";
import { useBudgetMonth } from "@/screens/budget/hooks/useBudgetMonth";
import { goalAutomationsQueryKey, type GoalAutomationsData } from "./useGoalAutomationsQuery";
import { computeGoalEditSeed, computeNextEntries } from "./goalEditSession.logic";
import {
  makeGoalFormSchema,
  validateDraft,
  type DraftValidation,
  type GoalFormValues,
  type GoalValidationCtx,
} from "../validation/goalForm.schema";

/**
 * The editing session of the goal stack, derived from the route: the editor is
 * pushed with `entryId` (edit a saved automation) or `newType` (start a fresh
 * draft), and the form is *initialized* with those values — TanStack Form's
 * basic pattern. A changed `formId` makes `useForm` construct a brand-new form
 * already holding the right defaults, so there is no imperative seeding and no
 * window where `update()` could clobber values back to an empty draft (which
 * is exactly what happened when the form was long-lived and reset from the
 * list screen).
 *
 * Lives in the provider (not the editor screen) because the pushed mode screen
 * edits the same draft. Only saved entries exist outside the form — a draft is
 * nowhere else until its save lands, which is what makes back-without-saving a
 * no-op by construction.
 */
export function useGoalEditSession({
  categoryId,
  entryId,
  newType,
  savedEntries,
  schedules,
  validPercentageSources,
}: {
  categoryId: string;
  /** Route param: id of the saved entry being edited (edit sessions). */
  entryId?: string;
  /** Route param: display type of a fresh draft (create sessions). */
  newType?: string;
  savedEntries: AutomationEntry[];
  schedules: GoalValidationCtx["schedules"];
  validPercentageSources: Set<string>;
}) {
  const router = useRouter();
  const { month } = useBudgetMonth();
  const queryClient = useQueryClient();

  // Validators and mutations read the current context through a ref so the
  // schema is built once and mutation closures never go stale.
  const ctxRef = useRef<GoalValidationCtx>({ savedEntries, schedules, validPercentageSources });
  ctxRef.current = { savedEntries, schedules, validPercentageSources };

  const schema = useMemo(() => makeGoalFormSchema(() => ctxRef.current), []);

  // The session's identity + initial values, straight from the route. The key
  // doubles as the formId: a different entry (or a new draft) is a different
  // form. `savedEntries` is a dep only for the lookup — its identity is stable
  // while the stack is open (staleTime: Infinity; saves replace it wholesale).
  const seed = useMemo(
    () => computeGoalEditSeed({ entryId, newType, savedEntries }),
    [entryId, newType, savedEntries],
  );

  /** Write the given entries as the category's goals; returns them. */
  const persist = async (next: AutomationEntry[]) => {
    await batchMessages(async () => {
      await setGoalTemplates(categoryId, entriesToTemplates(next));
    });
    await updateGoalIndicator(month, categoryId);
    return next;
  };

  const writeBack = (next: AutomationEntry[]) => {
    queryClient.setQueryData<GoalAutomationsData>(goalAutomationsQueryKey(categoryId), (prev) =>
      prev ? { ...prev, entries: next } : prev,
    );
  };

  // Failures surface through the global MutationCache.onError → error bus.
  const saveMutation = useMutation({
    mutationFn: async (values: GoalFormValues) => {
      const next = computeNextEntries(values, ctxRef.current.savedEntries);
      return persist(next);
    },
    onSuccess: (next) => {
      writeBack(next);
      router.back();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (entryId: string) =>
      persist(ctxRef.current.savedEntries.filter((e) => e.id !== entryId)),
    onSuccess: writeBack,
  });

  const form = useForm({
    formId: seed.key,
    defaultValues: seed.values,
    validators: { onChange: schema, onSubmit: schema },
    onSubmit: async ({ value }) => {
      await saveMutation.mutateAsync(value);
    },
  });

  /** Swap the draft's amount source (the Custom "Based on" row). */
  const changeType = useCallback(
    (displayType: DisplayTemplateType) => {
      const values = form.state.values;
      if (values.displayType === displayType) return;
      form.setFieldValue("displayType", displayType);
      form.setFieldValue("template", retypeTemplate(values.template, displayType));
    },
    [form],
  );

  /** Remove a saved entry and write at once — deletions never sit as drafts. */
  const deleteEntry = useCallback(
    (entryId: string) => deleteMutation.mutateAsync(entryId),
    [deleteMutation],
  );

  /** The domain's rich error/conflict objects for the draft — the display side
   *  of the zod gate, same validators underneath. */
  const validateDraftValues = useCallback(
    (values: GoalFormValues): DraftValidation => validateDraft(values, ctxRef.current),
    [],
  );

  return {
    form,
    changeType,
    deleteEntry,
    validateDraftValues,
    isSaving: saveMutation.isPending || deleteMutation.isPending,
  };
}
