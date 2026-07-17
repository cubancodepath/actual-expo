import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "expo-router";
import {
  createAutomationEntry,
  createDefaultTemplate,
  entriesToTemplates,
  NON_CONTRIBUTION_TYPES,
  getCategoryNote,
  getGoalTemplates,
  hasLegacyTemplateNotes,
  parseTemplateNotes,
  retypeTemplate,
  setGoalTemplates,
  templatesToEntries,
  validateAutomation,
  validatePercentageAllocation,
  validateSchedulePriorities,
  type AutomationEntry,
  type AutomationErrorKind,
  type DisplayTemplateType,
  type GlobalConflictKind,
} from "@/core/domain/goals";
import { updateGoalIndicator } from "@/core/domain/goals/apply";
import { getSchedules } from "@/core/domain/schedules";
import type { Schedule } from "@/core/domain/schedules/types";
import type { Template } from "@/core/domain/goals/types";
import { batchMessages } from "@/core/sync/batch";
import { useCategories } from "@/hooks/useCategories";
import { useBudgetMonth } from "@/screens/budget/hooks/useBudgetMonth";

/**
 * Owns the whole Edit Goals draft: the category's automations and the single
 * save that writes them. Which screen of the goal stack is showing is the
 * router's business — this hook lives in a provider above the stack so the
 * draft survives pushes and pops.
 *
 * Edits are staged in memory and only written when the user confirms. Saving
 * per keystroke isn't an option here: a half-built template would reach the
 * engine and the desktop-facing note mirror on every digit, and validation is
 * stack-level anyway (a cap needs something to cap, a refill needs a cap), so
 * intermediate states are legitimately invalid.
 */
export function useGoalAutomations({
  categoryId,
  dismissCount,
}: {
  categoryId: string;
  dismissCount?: string;
}) {
  const router = useRouter();
  const { month } = useBudgetMonth();
  const { categories } = useCategories();

  const [entries, setEntries] = useState<AutomationEntry[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [importedFromNotes, setImportedFromNotes] = useState(false);

  const categoryNames = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);
  const categoryNameToId = useMemo(
    () => new Map(categories.map((c) => [c.name, c.id])),
    [categories],
  );
  // Income categories are the only valid percentage sources, alongside the
  // 'all-income' alias the engine understands.
  const validPercentageSources = useMemo(
    () =>
      new Set<string>([
        "all-income",
        ...categories.filter((c) => c.is_income && !c.tombstone).map((c) => c.id),
      ]),
    [categories],
  );

  // Load once per category. Categories must be in hand first: resolving a
  // legacy "10% of Salary" note line needs the name→id map. The map is read
  // through a ref rather than the deps: liveQuery refreshes give `categories`
  // a new identity on every sync, and a reload would clobber the user's
  // in-progress draft. `categoriesReady` flips once and stays true, and a
  // remount (unlike a guard ref) re-runs the load cleanly.
  const categoriesRef = useRef(categories);
  categoriesRef.current = categories;
  const categoriesReady = categories.length > 0;
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!categoryId || !categoriesReady) return;

    let alive = true;
    (async () => {
      try {
        const [stored, scheduleList, note] = await Promise.all([
          getGoalTemplates(categoryId),
          getSchedules(),
          getCategoryNote(categoryId),
        ]);
        if (!alive) return;

        const usable = scheduleList.filter((s) => !s.tombstone && !s.completed && s.name);
        setSchedules(usable);

        let templates: Template[] = stored;
        let imported = false;
        if (templates.length === 0 && hasLegacyTemplateNotes(note, null)) {
          const nameToId = new Map(categoriesRef.current.map((c) => [c.name, c.id]));
          templates = parseTemplateNotes(note, nameToId);
          imported = templates.length > 0;
        }

        setEntries(templatesToEntries(templates, usable));
        setImportedFromNotes(imported);
      } catch {
        if (alive) setLoadError(true);
      } finally {
        if (alive) setIsLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [categoryId, categoriesReady]);

  // ── Draft mutations ──────────────────────────────────────────────────────

  const updateEntry = useCallback((entryId: string, template: Template) => {
    setEntries((prev) => prev.map((e) => (e.id === entryId ? { ...e, template } : e)));
    setIsDirty(true);
  }, []);

  const addEntry = useCallback((displayType: DisplayTemplateType): AutomationEntry => {
    const entry = createAutomationEntry(createDefaultTemplate(displayType), displayType);
    setEntries((prev) => [...prev, entry]);
    setIsDirty(true);
    return entry;
  }, []);

  const deleteEntry = useCallback((entryId: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== entryId));
    setIsDirty(true);
  }, []);

  const changeEntryType = useCallback((entryId: string, displayType: DisplayTemplateType) => {
    setEntries((prev) =>
      prev.map((e) =>
        e.id === entryId && e.displayType !== displayType
          ? { ...e, displayType, template: retypeTemplate(e.template, displayType) }
          : e,
      ),
    );
    setIsDirty(true);
  }, []);

  /**
   * Move a goal earlier or later in the funding order — list order is what
   * `entriesToTemplates` turns into the engine's priorities. Only contributing
   * goals take part: caps and long-term goals don't compete for money, so they
   * are skipped over rather than swapped with.
   */
  const moveEntry = useCallback((entryId: string, direction: -1 | 1) => {
    setEntries((prev) => {
      const index = prev.findIndex((e) => e.id === entryId);
      if (index === -1 || NON_CONTRIBUTION_TYPES.has(prev[index].displayType)) return prev;

      let target = index + direction;
      while (target >= 0 && target < prev.length) {
        if (!NON_CONTRIBUTION_TYPES.has(prev[target].displayType)) break;
        target += direction;
      }
      if (target < 0 || target >= prev.length) return prev;

      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setIsDirty(true);
  }, []);

  // ── Validation ───────────────────────────────────────────────────────────

  const templates = useMemo(() => entries.map((e) => e.template), [entries]);

  const errorsByEntry = useMemo(() => {
    const today = new Date();
    const map = new Map<string, AutomationErrorKind>();
    for (const entry of entries) {
      const error = validateAutomation(
        entry.template,
        entry.displayType,
        templates,
        schedules,
        today,
        validPercentageSources,
      );
      if (error) map.set(entry.id, error);
    }
    return map;
  }, [entries, templates, schedules, validPercentageSources]);

  const conflicts = useMemo(() => {
    const found: GlobalConflictKind[] = [];
    const percentage = validatePercentageAllocation(templates);
    if (percentage) found.push(percentage);
    // entriesToTemplates() pins schedule/by priorities together on save, so
    // check what will actually be written rather than the draft.
    const priority = validateSchedulePriorities(entriesToTemplates(entries));
    if (priority) found.push(priority);
    return found;
  }, [templates, entries]);

  const hasErrors = errorsByEntry.size > 0 || conflicts.length > 0;

  // ── Persistence ──────────────────────────────────────────────────────────

  const dismiss = useCallback(() => {
    const count = Number(dismissCount ?? 1);
    if (count > 1) router.dismiss(count);
    else router.back();
  }, [dismissCount, router]);

  /**
   * Persist the draft. Navigation stays with the caller — the list saves and
   * closes the modal, the editor saves and pops back to the list.
   */
  const save = useCallback(async () => {
    if (isSaving || hasErrors) return;
    setIsSaving(true);
    try {
      await batchMessages(async () => {
        await setGoalTemplates(
          categoryId,
          entriesToTemplates(entries),
          categoryNames,
          categoryNameToId,
        );
      });
      await updateGoalIndicator(month, categoryId);
      setIsDirty(false);
    } finally {
      setIsSaving(false);
    }
  }, [isSaving, hasErrors, categoryId, entries, categoryNames, categoryNameToId, month]);

  const removeAll = useCallback(async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      await batchMessages(async () => {
        await setGoalTemplates(categoryId, [], categoryNames, categoryNameToId);
      });
      await updateGoalIndicator(month, categoryId);
      setEntries([]);
      setIsDirty(false);
    } finally {
      setIsSaving(false);
    }
  }, [isSaving, categoryId, categoryNames, categoryNameToId, month]);

  const usedTypes = useMemo(() => new Set(entries.map((e) => e.displayType)), [entries]);

  /**
   * Whether a goal has somewhere to move in the funding order, among the
   * entries that actually compete for money.
   */
  const moveRangeFor = useCallback(
    (entryId: string) => {
      const contributions = entries.filter((e) => !NON_CONTRIBUTION_TYPES.has(e.displayType));
      const rank = contributions.findIndex((e) => e.id === entryId);
      return {
        canMoveUp: rank > 0,
        canMoveDown: rank !== -1 && rank < contributions.length - 1,
      };
    },
    [entries],
  );

  return {
    entries,
    schedules,
    usedTypes,
    moveRangeFor,
    isLoading,
    loadError,
    isSaving,
    isDirty,
    importedFromNotes,
    errorsByEntry,
    conflicts,
    hasErrors,
    updateEntry,
    addEntry,
    deleteEntry,
    changeEntryType,
    moveEntry,
    save,
    removeAll,
    dismiss,
  };
}
