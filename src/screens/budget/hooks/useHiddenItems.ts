import { useMemo } from "react";
import { useCategories } from "@/lib/hooks/useCategories";
import type { Category, CategoryGroup } from "@/core/types/models";

export interface HiddenCategory {
  id: string;
  name: string;
  /**
   * Whether the category's own flag is set. False means it is only out of sight
   * because its group is — and then showing it alone changes nothing, so it gets
   * no checkbox.
   */
  isHiddenItself: boolean;
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
 * The distinction this exists to make: a category can be hidden *by itself*, or
 * only *by inheritance* from a hidden group, or both. `useBudgetSections` throws
 * that away — it just omits them — but the screen that offers to bring them back
 * needs it, because the two cases have different remedies. Flipping a category
 * whose group is hidden is a no-op: `buildBudgetSections` drops the whole group
 * before it ever looks at its categories.
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
      categories: relevant.map((c) => ({
        id: c.id,
        name: c.name,
        isHiddenItself: c.hidden,
      })),
    });
  }

  return sections;
}

export function useHiddenItems(): { sections: HiddenSection[]; isLoading: boolean } {
  const { categories, groups, isLoading } = useCategories();

  const sections = useMemo(() => buildHiddenSections(categories, groups), [categories, groups]);

  return { sections, isLoading };
}
