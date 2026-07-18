import { useRouter } from "expo-router";
import { useSelector } from "@tanstack/react-store";
import { CategorySelectView } from "@/ui/entity-select/CategorySelectView";
import { todayInt } from "@/lib/date";
import { useScheduleFormContext } from "../context/ScheduleFormProvider";

/** The schedule form's category picker: CategorySelectView wired to the form. */
export function ScheduleCategoryPicker() {
  const router = useRouter();
  const { form, actions } = useScheduleFormContext();
  const categoryId = useSelector(form.store, (s) => s.values.categoryId);

  return (
    <CategorySelectView
      date={todayInt()}
      selectedCategoryId={categoryId}
      onPick={(category) => {
        if (category === null) {
          actions.clearCategory();
        } else {
          actions.selectCategory(category);
          router.back();
        }
      }}
    />
  );
}
