import { useCallback, useMemo, useRef } from "react";
import { useRouter } from "expo-router";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createAutomationEntry,
  createDefaultTemplate,
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
import {
  makeGoalFormSchema,
  validateDraft,
  type DraftValidation,
  type GoalFormValues,
  type GoalValidationCtx,
} from "../validation/goalForm.schema";

/**
 * The single editing session of the goal stack: one TanStack form holding the
 * automation being edited, plus the mutations that write it. Lives in the
 * provider (not the editor screen) because the pushed mode screen edits the
 * same draft.
 *
 * Only saved entries exist outside the form — a new goal isn't in the list,
 * the cache, or anywhere else until its save lands, which is what makes
 * back-without-saving a no-op by construction.
 */
export function useGoalEditSession({
  categoryId,
  savedEntries,
  schedules,
  validPercentageSources,
}: {
  categoryId: string;
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
      const saved = ctxRef.current.savedEntries;
      const replaces = values.entryId != null && saved.some((e) => e.id === values.entryId);
      const next = replaces
        ? saved.map((e) =>
            e.id === values.entryId
              ? { ...e, displayType: values.displayType, template: values.template }
              : e,
          )
        : [...saved, createAutomationEntry(values.template, values.displayType)];
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
    defaultValues: {
      entryId: null,
      displayType: "fixed",
      template: createDefaultTemplate("fixed"),
    } as GoalFormValues,
    validators: { onChange: schema, onSubmit: schema },
    onSubmit: async ({ value }) => {
      await saveMutation.mutateAsync(value);
    },
  });

  /** Begin creating — the caller pushes the editor route after. */
  const startNew = useCallback(
    (displayType: DisplayTemplateType) => {
      form.reset({ entryId: null, displayType, template: createDefaultTemplate(displayType) });
    },
    [form],
  );

  /** Begin editing a saved entry — the caller pushes the editor route after. */
  const startEdit = useCallback(
    (entry: AutomationEntry) => {
      form.reset({ entryId: entry.id, displayType: entry.displayType, template: entry.template });
    },
    [form],
  );

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
    startNew,
    startEdit,
    changeType,
    deleteEntry,
    validateDraftValues,
    isSaving: saveMutation.isPending || deleteMutation.isPending,
  };
}
