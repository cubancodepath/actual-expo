import { useLocalSearchParams } from "expo-router";
import { EditCategoryScreen } from "@/features/budget/screens/EditCategoryScreen";

export default function EditCategoryRoute() {
  const { categoryId } = useLocalSearchParams<{ categoryId: string }>();
  return <EditCategoryScreen categoryId={categoryId} />;
}
