import { useEffect } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { LoadingScreen } from "@/ui/LoadingScreen";
import { CategorySelectView } from "@/screens/transactions/components/category-select/CategorySelectView";
import { useCategorize } from "./context/CategorizeProvider";

/**
 * Entry of the categorize modal stack: loads the transaction and shows the
 * category selector with pick → apply → close semantics. An already-split
 * transaction skips straight to the split editor (same as the edit flow).
 */
export function CategorizeScreen() {
  const router = useRouter();
  const { transactionId } = useLocalSearchParams<{ transactionId: string }>();
  const { txn, isLoading, initialize, applyCategory } = useCategorize();

  // This leaf owns the URL — the layout provider must not read route params
  // (stale global routeInfo on its first render).
  useEffect(() => {
    initialize(transactionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isParent = txn?.is_parent ?? false;
  useEffect(() => {
    if (isParent) router.replace("/(auth)/transaction-categorize/split-amounts");
  }, [isParent, router]);

  if (isLoading || !txn || isParent) {
    return <LoadingScreen />;
  }

  return (
    <CategorySelectView
      date={txn.date}
      selectedCategoryId={txn.category}
      allowSplit
      onPick={(category) => {
        // Deselect is a no-op here — closing the modal is the cancel gesture,
        // and quick-categorize should not silently un-categorize.
        if (category) applyCategory(category);
      }}
      onSplitNext={(ids) =>
        router.push({
          pathname: "/(auth)/transaction-categorize/split-amounts",
          params: { ids: ids.join(",") },
        })
      }
    />
  );
}
