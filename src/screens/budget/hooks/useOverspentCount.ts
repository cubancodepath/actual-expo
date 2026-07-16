import { useOverspentCategories } from "./useOverspentCategories";

/**
 * How many expense categories are overspent this month. Thin wrapper over
 * {@link useOverspentCategories} so the Budget screen's pill and the
 * cover-overspent list share one enumeration.
 */
export function useOverspentCount(sheet: string): number {
  return useOverspentCategories(sheet).length;
}
