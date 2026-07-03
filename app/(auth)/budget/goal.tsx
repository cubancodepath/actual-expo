import { useLocalSearchParams } from "expo-router";
import { GoalScreen } from "@/features/budget/screens/GoalScreen";

export default function GoalRoute() {
  const { categoryId, dismissCount } = useLocalSearchParams<{
    categoryId: string;
    dismissCount?: string;
  }>();
  return <GoalScreen categoryId={categoryId} dismissCount={dismissCount} />;
}
