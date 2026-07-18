/**
 * useCategories — reactive categories and groups via liveQuery (screens-first local hook).
 */

import { q } from "@/core/queries";
import { useLiveQuery } from "@/hooks/useQuery";
import type { Category, CategoryGroup } from "@/core/domain/categories/types";

export function useCategories() {
  const { data: categories, isLoading: categoriesLoading } = useLiveQuery<Category>(
    () => q("categories"),
    [],
  );
  const { data: groups, isLoading: groupsLoading } = useLiveQuery<CategoryGroup>(
    () => q("category_groups"),
    [],
  );

  return {
    categories: categories ?? [],
    groups: groups ?? [],
    isLoading: categoriesLoading || groupsLoading,
  };
}
