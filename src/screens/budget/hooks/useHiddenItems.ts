import { useMemo } from "react";
import { useCategories } from "@/lib/hooks/useCategories";
import type { Category, CategoryGroup } from "@/core/types/models";

export interface HiddenCategory {
  id: string;
  name: string;
}

export interface HiddenSection {
  groupId: string;
  groupName: string;
  /** Whether the group itself is hidden, which is what would have to be undone. */
  isGroupHidden: boolean;
  categories: HiddenCategory[];
}

/**
 * Everything currently out of sight, grouped by the group it really belongs to.
 *
 * `useBudgetSections` just omits these; this keeps the group each one came from,
 * which is what makes the screen readable — a flat list of hidden category names
 * says nothing about where they'd come back to.
 *
 * `isGroupHidden` is the one distinction that survives, because it decides
 * whether the group itself is something you can ask for. Why a category is out
 * of sight (its own flag, or its group's) doesn't reach the UI: either way you
 * can pick it, and `unhideItems` works out what that implies.
 *
 * Pure and exported for testing, like `buildBudgetSections`.
 */
export function buildHiddenSections(
  categories: Category[],
  groups: CategoryGroup[],
): HiddenSection[] {
  const sortedGroups = [...groups].sort((a, b) => {
    if (a.is_income !== b.is_income) return a.is_income ? 1 : -1;
    return (a.sort_order ?? 0) - (b.sort_order ?? 0);
  });

  const sections: HiddenSection[] = [];

  for (const g of sortedGroups) {
    const groupCats = categories
      .filter((c) => c.group === g.id)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

    // A hidden group belongs here whether or not it still holds categories —
    // otherwise an emptied one would be unrecoverable.
    const relevant = g.hidden ? groupCats : groupCats.filter((c) => c.hidden);
    if (!g.hidden && relevant.length === 0) continue;

    sections.push({
      groupId: g.id,
      groupName: g.name,
      isGroupHidden: g.hidden,
      categories: relevant.map((c) => ({ id: c.id, name: c.name })),
    });
  }

  return sections;
}

export function useHiddenItems(): { sections: HiddenSection[]; isLoading: boolean } {
  const { categories, groups, isLoading } = useCategories();

  const sections = useMemo(() => buildHiddenSections(categories, groups), [categories, groups]);

  return { sections, isLoading };
}
