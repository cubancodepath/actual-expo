/**
 * useCategories — reactive categories and groups via liveQuery.
 *
 * Replaces useCategoriesStore for data reads. Categories and groups
 * auto-refresh when the DB changes via sync-event.
 * Mutations are called directly from src/categories/index.ts.
 */

import { useMemo } from "react";
import { q } from "@/queries";
import { useLiveQuery } from "./useQuery";
import type { Category, CategoryGroup } from "@/categories/types";

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

/**
 * Convenience hook — just categories, no groups.
 */
export function useCategoryList() {
  const { data: categories } = useLiveQuery<Category>(
    () => q("categories"),
    [],
  );
  return categories ?? [];
}

/**
 * Convenience hook — just groups, no categories.
 */
export function useCategoryGroups() {
  const { data: groups } = useLiveQuery<CategoryGroup>(
    () => q("category_groups"),
    [],
  );
  return groups ?? [];
}
