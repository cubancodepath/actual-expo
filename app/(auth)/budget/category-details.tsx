import { useLocalSearchParams } from "expo-router";
import { CategoryDetailsScreen } from "@/screens/budget/CategoryDetailsScreen";

export default function CategoryDetailsRoute() {
  const { categoryId } = useLocalSearchParams<{ categoryId: string }>();
  return <CategoryDetailsScreen categoryId={categoryId} />;
}
