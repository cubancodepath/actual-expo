import { View } from "react-native";
import { useTheme } from "@/design-system/providers/ThemeProvider";
import { Skeleton } from "@/design-system/atoms/Skeleton";
import { Card } from "@/design-system/atoms/Card";

function WidgetSkeleton({ height = 180 }: { height?: number }) {
  const { spacing } = useTheme();

  return (
    <Card style={{ padding: spacing.lg, gap: spacing.md }}>
      <Skeleton width={100} height={12} />
      <Skeleton width={160} height={24} />
      <Skeleton width="100%" height={height} />
    </Card>
  );
}

export function DashboardSkeleton() {
  const { spacing } = useTheme();

  return (
    <View style={{ gap: spacing.lg }}>
      <WidgetSkeleton height={140} />
      <WidgetSkeleton height={120} />
      <WidgetSkeleton height={180} />
      <WidgetSkeleton height={100} />
    </View>
  );
}
