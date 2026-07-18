import { useRouter } from "expo-router";
import { useSelector } from "@tanstack/react-store";
import { CategorySelectView } from "@/ui/entity-select/CategorySelectView";
import { useTransactionForm } from "@/screens/transactions/NewTransactionScreen/context/TransactionFormProvider";

/**
 * The transaction form's category picker: glue between the shared
 * {@link CategorySelectView} and the form context. Picking writes to the form
 * and closes; deselecting clears and stays open; the split multi-select hands
 * off to the split-amounts screen. (An already-split transaction opens
 * split-amounts directly, so this screen is only reached in single mode.)
 */
export function CategoryPickerScreen() {
  const router = useRouter();
  const { form, actions } = useTransactionForm();
  const categoryId = useSelector(form.store, (s) => s.values.categoryId);
  const date = useSelector(form.store, (s) => s.values.date);

  return (
    <CategorySelectView
      date={date}
      selectedCategoryId={categoryId}
      allowSplit
      onPick={(category) => {
        if (category === null) {
          actions.clearCategory();
        } else {
          actions.selectCategory(category);
          router.back();
        }
      }}
      onSplitNext={(ids) =>
        router.push({
          pathname: "/(auth)/transaction/split-amounts",
          params: { ids: ids.join(",") },
        })
      }
    />
  );
}
