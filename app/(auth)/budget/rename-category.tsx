import { useLocalSearchParams } from "expo-router";
import { RenameCategoryScreen } from "@/screens/budget/RenameCategoryScreen";

export default function RenameCategoryRoute() {
  const { categoryId, currentName } = useLocalSearchParams<{
    categoryId: string;
    currentName: string;
  }>();
  return <RenameCategoryScreen categoryId={categoryId} currentName={currentName ?? ""} />;
}
