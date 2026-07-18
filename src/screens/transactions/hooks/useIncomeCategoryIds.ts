import { useMemo } from "react";
import { useCategories } from "@/ui/hooks/useCategories";

/**
 * Ids of income categories — the category's own `is_income` flag OR membership
 * in an income group (in case a category in the income group lacks the flag).
 */
export function useIncomeCategoryIds(): Set<string> {
  const { categories, groups } = useCategories();
  return useMemo(() => {
    const incomeGroupIds = new Set(groups.filter((g) => g.is_income).map((g) => g.id));
    return new Set(
      categories.filter((c) => c.is_income || incomeGroupIds.has(c.cat_group)).map((c) => c.id),
    );
  }, [categories, groups]);
}
