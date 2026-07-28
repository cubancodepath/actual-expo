import { useLocalSearchParams } from "expo-router";
import { CategoryTransactionsScreen } from "@/screens/transactions/TransactionsListScreen";
import { SurfaceLevel } from "@/ui/surface-level";

export default function CategoryTransactionsRoute() {
  const { categoryId, categoryName, month } = useLocalSearchParams<{
    categoryId: string;
    categoryName?: string;
    month?: string;
  }>();
  // Presented as a card modal, so the same TransactionRow that sits on
  // `bg-surface` in the tab list drops a rung here.
  return (
    <SurfaceLevel context="sheet">
      <CategoryTransactionsScreen
        categoryId={categoryId}
        categoryName={categoryName}
        month={month}
      />
    </SurfaceLevel>
  );
}
