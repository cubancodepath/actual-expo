import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCategoryNote, getGoalTemplates } from "@/core/server/budget/goal-template";
import {
  hasLegacyTemplateNotes,
  parseTemplateNotes,
} from "@/core/server/budget/goal-template-parser";
import { templatesToEntries, type AutomationEntry } from "@/screens/budget/goals";
import type { Template } from "@/core/types/models";
import { getSchedules } from "@/core/server/schedules";
import type { Schedule } from "@/core/types/models";
import { useCategories } from "@/lib/hooks/useCategories";

export type GoalAutomationsData = {
  /** What's written to the category — the only entries outside the form. */
  entries: AutomationEntry[];
  schedules: Schedule[];
  /** The templates came from legacy note lines, not goal_def. */
  importedFromNotes: boolean;
};

export const goalAutomationsQueryKey = (categoryId: string) =>
  ["goal-automations", categoryId] as const;

/**
 * Loads the category's saved automations. Categories must be in hand first:
 * resolving a legacy "10% of Salary" note line needs the name→id map — hence
 * `enabled` waits for them, and the map is read through a ref because
 * liveQuery gives `categories` a new identity on every sync and the load
 * must not re-run for that. Saves write back via `setQueryData`; `gcTime: 0`
 * drops the cache when the goal stack closes so each opening reads fresh.
 */
export function useGoalAutomationsQuery(categoryId: string) {
  const { categories } = useCategories();
  const categoriesRef = useRef(categories);
  categoriesRef.current = categories;

  return useQuery<GoalAutomationsData>({
    queryKey: goalAutomationsQueryKey(categoryId),
    enabled: !!categoryId && categories.length > 0,
    gcTime: 0,
    staleTime: Infinity,
    queryFn: async () => {
      const [stored, scheduleList, note] = await Promise.all([
        getGoalTemplates(categoryId),
        getSchedules(),
        getCategoryNote(categoryId),
      ]);

      const schedules = scheduleList.filter((s) => !s.tombstone && !s.completed && s.name);

      let templates: Template[] = stored;
      let importedFromNotes = false;
      if (templates.length === 0 && hasLegacyTemplateNotes(note, null)) {
        const nameToId = new Map(categoriesRef.current.map((c) => [c.name, c.id]));
        templates = parseTemplateNotes(note, nameToId);
        importedFromNotes = templates.length > 0;
      }

      return { entries: templatesToEntries(templates, schedules), schedules, importedFromNotes };
    },
  });
}
