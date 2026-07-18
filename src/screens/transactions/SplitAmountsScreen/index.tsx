import { useMemo } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSelector } from "@tanstack/react-store";
import { SplitAmountsView } from "@/screens/transactions/components/category-select/SplitAmountsView";
import type { SplitLineForm } from "@/screens/transactions/components/category-select/types";
import { useTransactionForm } from "@/screens/transactions/NewTransactionScreen/context/TransactionFormProvider";

/**
 * The transaction form's split editor: glue between the shared
 * {@link SplitAmountsView} and the form context. The categories were chosen in
 * the category picker (`ids` param); saving writes the split back to the shared
 * form and returns to the `new` screen — persistence happens on the form's Save.
 */
export function SplitAmountsScreen() {
  const router = useRouter();
  const { ids } = useLocalSearchParams<{ ids?: string }>();
  const { form, categories, actions, pendingSplitCategory, setPendingSplitCategory } =
    useTransactionForm();
  const total = useSelector(form.store, (s) => s.values.amount);
  const payeeName = useSelector(form.store, (s) => s.values.payeeName);
  const type = useSelector(form.store, (s) => s.values.type);
  const existing = useSelector(form.store, (s) => s.values.splitLines);

  // Build one line per selected category, pre-filling the amount from an existing
  // split (when editing) or 0 (when creating). Keyed on `ids` only — the initial
  // draft should not reset while the user types.
  const initialLines = useMemo<SplitLineForm[]>(
    () =>
      (ids ?? "")
        .split(",")
        .filter(Boolean)
        .map((id) => ({
          categoryId: id,
          categoryName: categories.find((c) => c.id === id)?.name ?? "",
          amount: existing?.find((l) => l.categoryId === id)?.amount ?? 0,
        })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ids],
  );

  return (
    <SplitAmountsView
      initialLines={initialLines}
      totalCents={total}
      isIncome={type === "income"}
      payeeName={payeeName}
      onAddCategory={() => router.push("/(auth)/transaction/split-add-category")}
      pendingCategory={pendingSplitCategory}
      onPendingConsumed={() => setPendingSplitCategory(null)}
      onSave={(lines) => {
        if (lines.length < 2) {
          // One category isn't a split — assign it to the parent as a normal
          // category (the parent already holds the full total).
          const only = lines[0];
          if (only?.categoryId) {
            actions.selectCategory({ id: only.categoryId, name: only.categoryName });
          }
          actions.setSplitLines(null);
        } else {
          actions.setSplitLines(lines);
        }
        // Back to `new` regardless of how we got here (picker→split, or split direct).
        router.dismissTo("/(auth)/transaction/new");
      }}
    />
  );
}
