import { View } from "react-native";
import { Skeleton } from "heroui-native";
import { ReportWidget } from "./ReportWidget";

/**
 * Neutral placeholder shown for a widget type whose real graph isn't wired up
 * yet. Keeps the dashboard renderable end-to-end (title + slot) while individual
 * report cards land in later phases.
 */
export function PlaceholderWidget({ title, height }: { title: string; height: number }) {
  return (
    <ReportWidget title={title} height={height}>
      <View className="flex-1 justify-end gap-2">
        <Skeleton className="h-3 w-2/3 rounded-md" />
        <Skeleton className="h-3 w-1/2 rounded-md" />
        <Skeleton className="h-16 w-full rounded-lg" />
      </View>
    </ReportWidget>
  );
}
