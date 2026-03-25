import { View } from "react-native";
import { Skeleton } from "@/ui";

export function BudgetLoadingState() {
  return (
    <View className="gap-4 mt-8">
      <Skeleton className="h-4 w-32 rounded-md" />
      <Skeleton className="h-14 w-full rounded-md" />
      <Skeleton className="h-14 w-full rounded-md" />
      <Skeleton className="h-14 w-full rounded-md" />
    </View>
  );
}
