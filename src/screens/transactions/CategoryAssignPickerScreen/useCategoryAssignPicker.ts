import { useCallback, useMemo } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { usePickerStore } from "@/stores/pickerStore";
import { currentMonth, monthToInt } from "@/core/shared/months";
import type { CategoryRef } from "@/ui/entity-select/types";

/**
 * Route glue for the assign-category picker: reads the params, converts the
 * month into the YYYYMMDD date the shared selector expects, and owns the two
 * navigation side-effects (report the pick and pop, or push the split screen).
 *
 * Keeping this out of the view is what lets the screen be `CategorySelectView`
 * plus a handful of props instead of its own copy of the picker.
 */
export function useCategoryAssignPicker() {
  const router = useRouter();
  const { month, selectedId } = useLocalSearchParams<{
    month?: string;
    selectedId?: string;
  }>();

  const setCategory = usePickerStore((s) => s.setCategory);

  // The selector takes a YYYYMMDD int; the route carries a YYYY-MM month.
  const date = useMemo(() => monthToInt(month || currentMonth()) * 100 + 1, [month]);

  const onPick = useCallback(
    (category: CategoryRef | null) => {
      setCategory({ id: category?.id ?? null, name: category?.name ?? "" });
      router.back();
    },
    [setCategory, router],
  );

  return {
    date,
    selectedCategoryId: selectedId ?? null,
    onPick,
  };
}
