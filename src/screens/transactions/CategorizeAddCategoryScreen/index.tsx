import { useRouter } from "expo-router";
import { CategorySelectView } from "@/ui/entity-select/CategorySelectView";
import { todayInt } from "@/lib/date";
import { useCategorize } from "@/screens/transactions/CategorizeScreen/context/CategorizeProvider";

/**
 * Single-select picker that adds one more category to the categorize stack's
 * in-progress split, returned through the provider's mailbox.
 */
export function CategorizeAddCategoryScreen() {
  const router = useRouter();
  const { txn, setPendingCategory } = useCategorize();

  return (
    <CategorySelectView
      date={txn?.date ?? todayInt()}
      onPick={(category) => {
        // No selectedCategoryId here, so `null` (deselect) never fires.
        if (category === null) return;
        setPendingCategory(category);
        router.back();
      }}
    />
  );
}
