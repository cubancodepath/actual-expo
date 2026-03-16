import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "expo-router";
import { usePickerStore } from "../../../stores/pickerStore";

export function useBulkCategoryPicker(
  handleBulkChangeCategory: (categoryId: string | null) => void,
) {
  const router = useRouter();
  const bulkCategoryPending = useRef(false);
  const selectedCategory = usePickerStore((s) => s.selectedCategory);
  const clearPicker = usePickerStore((s) => s.clear);

  const handleRef = useRef(handleBulkChangeCategory);
  handleRef.current = handleBulkChangeCategory;

  useEffect(() => {
    if (selectedCategory && bulkCategoryPending.current) {
      bulkCategoryPending.current = false;
      handleRef.current(selectedCategory.id);
      clearPicker();
    }
  }, [selectedCategory, clearPicker]);

  const triggerCategoryPicker = useCallback(() => {
    bulkCategoryPending.current = true;
    router.push({ pathname: "/(auth)/transaction/category-picker", params: { hideSplit: "1" } });
  }, [router]);

  return { triggerCategoryPicker };
}
