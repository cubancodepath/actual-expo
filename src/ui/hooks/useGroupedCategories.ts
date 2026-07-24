import { useMemo } from "react";
import type { Category, CategoryGroup } from "@/core/types/models";

export type CategorySection = { group: CategoryGroup; items: Category[] };

/**
 * Visible categories grouped by their category group, filtered by the search
 * `query`. Hidden/tombstoned groups and categories are dropped, and groups with
 * no matching items are omitted.
 */
export function useGroupedCategories(
  groups: CategoryGroup[],
  categories: Category[],
  query: string,
): CategorySection[] {
  return useMemo(() => {
    const q = query.trim().toLowerCase();
    return groups
      .filter((g) => !g.hidden && !g.tombstone)
      .map((g) => ({
        group: g,
        items: categories.filter(
          (c) =>
            c.group === g.id &&
            !c.hidden &&
            !c.tombstone &&
            (q === "" || c.name.toLowerCase().includes(q)),
        ),
      }))
      .filter((entry) => entry.items.length > 0);
  }, [groups, categories, query]);
}
