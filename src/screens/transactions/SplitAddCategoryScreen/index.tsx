import { useRouter } from "expo-router";
import { useSelector } from "@tanstack/react-store";
import { CategorySelectView } from "@/ui/entity-select/CategorySelectView";
import { useTransactionForm } from "@/screens/transactions/NewTransactionScreen/context/TransactionFormProvider";

/**
 * Single-select category picker used to add one more category to an in-progress
 * split. Tapping a category hands it back to the split-amounts screen (via the
 * provider's mailbox) and closes — it never touches the parent's category.
 */
export function SplitAddCategoryScreen() {
  const router = useRouter();
  const { form, setPendingSplitCategory } = useTransactionForm();
  const date = useSelector(form.store, (s) => s.values.date);

  return (
    <CategorySelectView
      date={date}
      onPick={(category) => {
        // No selectedCategoryId here, so `null` (deselect) never fires.
        if (category === null) return;
        setPendingSplitCategory(category);
        router.back();
      }}
    />
  );
}
