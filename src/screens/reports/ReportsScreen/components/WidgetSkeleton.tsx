import { View } from "react-native";
import { Skeleton } from "heroui-native";

/**
 * Shared first-load skeleton for a report card body. Cards render this while
 * their spreadsheet resolves for the first time; after that, stale data stays
 * visible during refetches (see hooks/useReport.ts).
 */
export function WidgetSkeleton() {
  return (
    <View className="flex-1 justify-end gap-2">
      <Skeleton className="h-3 w-2/3 rounded-md" />
      <Skeleton className="h-3 w-1/2 rounded-md" />
      <Skeleton className="h-16 w-full rounded-lg" />
    </View>
  );
}
