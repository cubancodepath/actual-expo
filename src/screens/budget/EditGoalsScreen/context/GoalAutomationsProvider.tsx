import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from "react";
import { useGlobalSearchParams, useRouter } from "expo-router";
import {
  validateAutomation,
  validatePercentageAllocation,
  validateSchedulePriorities,
  entriesToTemplates,
  type AutomationEntry,
  type AutomationErrorKind,
  type GlobalConflictKind,
} from "@/core/domain/goals";
import type { Schedule } from "@/core/domain/schedules/types";
import { useCategories } from "@/hooks/useCategories";
import { useGoalAutomationsQuery } from "../hooks/useGoalAutomationsQuery";
import { useGoalEditSession } from "../hooks/useGoalEditSession";

const EMPTY_ENTRIES: AutomationEntry[] = [];
const EMPTY_SCHEDULES: Schedule[] = [];

/**
 * Composition root of the Edit Goals stack, held above it so the list, the
 * editor and the mode screen share one state across native pushes — the same
 * arrangement the transaction stack uses. Three parts:
 *
 *  - the query: the category's *saved* automations (the only entries that
 *    exist outside the form),
 *  - the edit session: one TanStack form + the save/delete mutations,
 *  - list-level validation over the saved entries (badges and banners for
 *    externally-authored problems).
 *
 * The stack is always entered via the list route, so on first render the
 * active route's params are the ones we want. They're frozen so pushing an
 * inner screen (which changes the global params) never re-inits anything.
 */
function useGoalAutomationsValue() {
  const rawParams = useGlobalSearchParams<{ categoryId?: string; dismissCount?: string }>();
  const params = useRef(rawParams).current;
  const categoryId = params.categoryId ?? "";
  const router = useRouter();

  const { categories } = useCategories();
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

  const query = useGoalAutomationsQuery(categoryId);
  const entries = query.data?.entries ?? EMPTY_ENTRIES;
  const schedules = query.data?.schedules ?? EMPTY_SCHEDULES;
  const importedFromNotes = query.data?.importedFromNotes ?? false;

  const session = useGoalEditSession({
    categoryId,
    savedEntries: entries,
    schedules,
    categoryNames,
    categoryNameToId,
    validPercentageSources,
  });

  // ── List-level validation (saved entries only) ───────────────────────────
  // The editor gates its own draft through the form; these flag what's
  // already written — imported or externally-authored configs can be broken.

  const errorsByEntry = useMemo(() => {
    const today = new Date();
    const templates = entries.map((e) => e.template);
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
  }, [entries, schedules, validPercentageSources]);

  const conflicts = useMemo(() => {
    const found: GlobalConflictKind[] = [];
    const percentage = validatePercentageAllocation(entries.map((e) => e.template));
    if (percentage) found.push(percentage);
    const priority = validateSchedulePriorities(entriesToTemplates(entries));
    if (priority) found.push(priority);
    return found;
  }, [entries]);

  const dismiss = useCallback(() => {
    const count = Number(params.dismissCount ?? 1);
    if (count > 1) router.dismiss(count);
    else router.back();
  }, [params.dismissCount, router]);

  return {
    entries,
    schedules,
    importedFromNotes,
    isLoading: query.isPending,
    loadError: query.isError,
    errorsByEntry,
    conflicts,
    dismiss,
    ...session,
  };
}

type GoalAutomationsValue = ReturnType<typeof useGoalAutomationsValue>;

const GoalAutomationsContext = createContext<GoalAutomationsValue | null>(null);

export function GoalAutomationsProvider({ children }: { children: ReactNode }) {
  const value = useGoalAutomationsValue();
  return <GoalAutomationsContext value={value}>{children}</GoalAutomationsContext>;
}

export function useGoalAutomationsContext(): GoalAutomationsValue {
  const ctx = useContext(GoalAutomationsContext);
  if (!ctx) {
    throw new Error("useGoalAutomationsContext must be used within a GoalAutomationsProvider");
  }
  return ctx;
}
