import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useCategories } from "@/lib/hooks/useCategories";

/** Synthetic group id that collects hidden categories at the bottom of the list. */
export const HIDDEN_GROUP_ID = "__hidden__";

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

/**
 * Structural budget sections (groups + their categories) with NO spreadsheet
 * reads — income groups sorted last and hidden categories collected into a
 * synthetic `__hidden__` group. Mirrors the grouping the old SwiftUI screen did.
 */
export function useBudgetSections(): { sections: BudgetSection[]; isLoading: boolean } {
  const { t } = useTranslation("budget");
  const { categories, groups, isLoading } = useCategories();

  const sections = useMemo<BudgetSection[]>(() => {
    if (groups.length === 0) return [];

    const sortedGroups = [...groups].sort((a, b) => {
      if (a.is_income !== b.is_income) return a.is_income ? 1 : -1;
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    });

    const hiddenCats: BudgetSectionCategory[] = [];
    const result: BudgetSection[] = [];

    for (const g of sortedGroups) {
      const groupCats = categories
        .filter((c) => c.group === g.id)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

      const visibleCats: BudgetSectionCategory[] = [];
      for (const c of groupCats) {
        const entry: BudgetSectionCategory = {
          id: c.id,
          name: c.name,
          goal_def: c.goal_def,
          is_income: c.is_income,
          hidden: c.hidden,
        };
        if (g.hidden || c.hidden) hiddenCats.push(entry);
        else visibleCats.push(entry);
      }

      if (!g.hidden) {
        result.push({
          id: g.id,
          name: g.name,
          is_income: g.is_income,
          categories: visibleCats,
        });
      }
    }

    if (hiddenCats.length > 0) {
      result.push({
        id: HIDDEN_GROUP_ID,
        name: t("hiddenCategories"),
        is_income: false,
        categories: hiddenCats,
      });
    }

    return result;
  }, [categories, groups, t]);

  return { sections, isLoading };
}
