import { CategorySelectView } from "@/ui/entity-select/CategorySelectView";
import { useCategoryAssignPicker } from "./useCategoryAssignPicker";

/**
 * Category picker for an EXISTING transaction (bulk-edit/assign flows on the
 * account and spending screens) — provider-independent, unlike
 * `CategoryPickerScreen` which only works inside `TransactionFormProvider`.
 * Preserves the legacy `transaction/category-picker` contract: writes the pick
 * to `pickerStore.setCategory` and pops the screen (callers read
 * `usePickerStore().selectedCategory` after the route resolves).
 *
 * A thin adapter over {@link CategorySelectView}: this screen used to carry its
 * own copy of the grouping algorithm and the row markup, which had already
 * drifted from the shared one.
 */
export function CategoryAssignPickerScreen() {
  const { date, selectedCategoryId, onPick } = useCategoryAssignPicker();

  return (
    <CategorySelectView
      date={date}
      selectedCategoryId={selectedCategoryId}
      onPick={onPick}
      showNoCategoryRow
    />
  );
}
