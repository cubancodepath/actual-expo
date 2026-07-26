import { useMemo } from "react";
import { useCategories } from "@/lib/hooks/useCategories";
import type { Category, CategoryGroup } from "@/core/types/models";

export interface BudgetSectionCategory {
  id: string;
  name: string;
  /** JSON of the saved goal templates, or null. Drives the details sheet's goal card. */
  goal_def: string | null;
  is_income: boolean;
  hidden: boolean;
}

export interface BudgetSection {
  id: string;
  name: string;
  is_income: boolean;
  categories: BudgetSectionCategory[];
}

export interface BudgetSectionsResult {
  sections: BudgetSection[];
  /**
   * How many categories the sections leave out — individually hidden, or living
   * in a hidden group. The plan editor turns this into the row that leads to
   * `HiddenCategoriesScreen`; the money screens ignore it.
   */
  hiddenCount: number;
}

/**
 * Groups and their categories, with everything hidden left out.
 *
 * Exported separately from the hook so it can be tested in Node — the same split
 * `useOverspentCategories` uses for `makeCategoryCellMatcher`.
 *
 * A category is out if its own flag is set OR its group's is; a hidden group
 * takes its categories with it. Recovering any of them is
 * `HiddenCategoriesScreen`'s job, which is why nothing is smuggled through here
 * in a synthetic bucket — a structural section in the middle of the budget table
 * is not where "unhide this" belongs.
 */
export function buildBudgetSections(
  categories: Category[],
  groups: CategoryGroup[],
): BudgetSectionsResult {
  if (groups.length === 0) return { sections: [], hiddenCount: 0 };

  const sortedGroups = [...groups].sort((a, b) => {
    if (a.is_income !== b.is_income) return a.is_income ? 1 : -1;
    return (a.sort_order ?? 0) - (b.sort_order ?? 0);
  });

  const sections: BudgetSection[] = [];
  let hiddenCount = 0;

  for (const g of sortedGroups) {
    const groupCats = categories
      .filter((c) => c.group === g.id)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

    if (g.hidden) {
      hiddenCount += groupCats.length;
      continue;
    }

    const visible: BudgetSectionCategory[] = [];
    for (const c of groupCats) {
      if (c.hidden) {
        hiddenCount++;
        continue;
      }
      visible.push({
        id: c.id,
        name: c.name,
        goal_def: c.goal_def,
        is_income: c.is_income,
        hidden: c.hidden,
      });
    }

    sections.push({ id: g.id, name: g.name, is_income: g.is_income, categories: visible });
  }

  return { sections, hiddenCount };
}

/**
 * Structural budget sections (groups + their categories) with NO spreadsheet
 * reads — income groups sorted last, hidden things omitted.
 */
export function useBudgetSections(): BudgetSectionsResult & { isLoading: boolean } {
  const { categories, groups, isLoading } = useCategories();

  const { sections, hiddenCount } = useMemo(
    () => buildBudgetSections(categories, groups),
    [categories, groups],
  );

  return { sections, hiddenCount, isLoading };
}
