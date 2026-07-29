import { useMemo } from "react";
import type { Category, CategoryGroup } from "@/core/types/models";

export interface PickerCategory {
  id: string;
  name: string;
  /** Undefined when no balance source was supplied. */
  balance?: number;
}

export interface PickerCategorySection {
  group: CategoryGroup;
  items: PickerCategory[];
}

export interface CategoryPickerSectionsOptions {
  /** Normalised search needle (see `usePickerSearch().q`). */
  q?: string;
  /** Category ids to leave out (e.g. the one being moved from). */
  excludeIds?: ReadonlySet<string>;
  /** Drop income groups entirely. */
  excludeIncome?: boolean;
  /** Keep only categories with a positive balance (funder pickers). */
  requirePositiveBalance?: boolean;
  balances?: Map<string, number>;
}

/**
 * Visible categories grouped by their group, filtered and ordered — the single
 * implementation behind every category picker.
 *
 * It replaces three hand-rolled copies of this algorithm that had already
 * drifted apart. The ordering here is deliberately the SUPERSET of what those
 * copies did: income groups last, then `sort_order` for groups and for the
 * categories within them. The previously shared `useGroupedCategories` did
 * neither, so anything moving off it would have silently lost its ordering.
 */
export function useCategoryPickerSections(
  groups: CategoryGroup[],
  categories: Category[],
  {
    q = "",
    excludeIds,
    excludeIncome = false,
    requirePositiveBalance = false,
    balances,
  }: CategoryPickerSectionsOptions = {},
): PickerCategorySection[] {
  return useMemo(() => {
    return groups
      .filter((g) => !g.hidden && !g.tombstone && (!excludeIncome || !g.is_income))
      .sort((a, b) => {
        if (a.is_income !== b.is_income) return a.is_income ? 1 : -1;
        return (a.sort_order ?? 0) - (b.sort_order ?? 0);
      })
      .map((g) => ({
        group: g,
        items: categories
          .filter((c) => c.group === g.id && !c.hidden && !c.tombstone)
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
          .map((c) => ({
            id: c.id,
            name: c.name,
            balance: balances?.get(c.id) ?? (balances ? 0 : undefined),
          }))
          .filter(
            (c) =>
              !excludeIds?.has(c.id) &&
              (q === "" || c.name.toLowerCase().includes(q)) &&
              (!requirePositiveBalance || (c.balance ?? 0) > 0),
          ),
      }))
      .filter((section) => section.items.length > 0);
  }, [groups, categories, q, excludeIds, excludeIncome, requirePositiveBalance, balances]);
}
