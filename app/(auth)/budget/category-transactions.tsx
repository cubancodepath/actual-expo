import { useLocalSearchParams } from "expo-router";
import { CategoryTransactionsScreen } from "@/screens/transactions/TransactionsListScreen";

export default function CategoryTransactionsRoute() {
  const { categoryId, categoryName, month } = useLocalSearchParams<{
    categoryId: string;
    categoryName?: string;
    month?: string;
  }>();
  return (
    <CategoryTransactionsScreen categoryId={categoryId} categoryName={categoryName} month={month} />
  );
}
