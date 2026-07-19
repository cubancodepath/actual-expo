import { useMemo } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { LoadingScreen } from "@/ui/LoadingScreen";
import { SplitAmountsView } from "@/screens/transactions/components/category-select/SplitAmountsView";
import type { SplitLineForm } from "@/ui/entity-select/types";
import { useCategories } from "@/lib/hooks/useCategories";
import { useCategorize } from "@/screens/transactions/CategorizeScreen/context/CategorizeProvider";

/**
 * Split editor of the categorize stack. Reached from the picker's multi-select
 * (`ids` param) or directly when the transaction is already split (no param —
 * its existing lines seed the draft). Saving persists immediately and closes.
 */
export function CategorizeSplitAmountsScreen() {
  const router = useRouter();
  const { ids } = useLocalSearchParams<{ ids?: string }>();
  const {
    txn,
    existingSplitLines,
    isLoading,
    applyCategory,
    applySplit,
    pendingCategory,
    setPendingCategory,
  } = useCategorize();
  const { categories } = useCategories();

  // One line per picked category (amounts pre-filled from the existing split);
  // direct entry on an already-split transaction edits its lines as-is. The
  // view seeds its draft from this only at mount, so recomputes are harmless.
  const initialLines = useMemo<SplitLineForm[]>(() => {
    const picked = (ids ?? "").split(",").filter(Boolean);
    if (picked.length === 0) return existingSplitLines;
    return picked.map((id) => ({
      categoryId: id,
      categoryName: categories.find((c) => c.id === id)?.name ?? "",
      amount: existingSplitLines.find((l) => l.categoryId === id)?.amount ?? 0,
    }));
  }, [ids, existingSplitLines, categories]);

  // `isLoading` also covers the children fetch — the view seeds its draft at
  // mount, so an already-split direct entry must wait for its lines.
  if (!txn || isLoading) {
    return <LoadingScreen />;
  }

  return (
    <SplitAmountsView
      initialLines={initialLines}
      totalCents={Math.abs(txn.amount)}
      isIncome={txn.amount >= 0}
      payeeName={txn.payeeName ?? ""}
      onAddCategory={() => router.push("/(auth)/transaction-categorize/add-category")}
      pendingCategory={pendingCategory}
      onPendingConsumed={() => setPendingCategory(null)}
      onSave={(lines) => {
        if (lines.length > 1) {
          applySplit(lines);
        } else if (lines[0]?.categoryId) {
          // One category isn't a split — plain assignment.
          applyCategory({ id: lines[0].categoryId, name: lines[0].categoryName });
        } else {
          router.dismiss();
        }
      }}
    />
  );
}
