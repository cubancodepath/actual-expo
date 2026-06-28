import { View } from "react-native";
import { useTheme } from "@/design-system/providers/ThemeProvider";
import { Skeleton } from "@/design-system/atoms/Skeleton";
import { Card } from "@/design-system/atoms/Card";
import { RowSeparator } from "@/design-system/atoms/RowSeparator";

const ROWS = 3;

export function AccountListSkeleton() {
  const { spacing } = useTheme();

  return (
    <Card style={{ marginHorizontal: spacing.lg }}>
      {Array.from({ length: ROWS }).map((_, i) => (
        <View key={i}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.lg,
              minHeight: 44,
              gap: spacing.sm,
            }}
          >
            <Skeleton width="60%" height={14} />
            <View style={{ flex: 1 }} />
            <Skeleton width={70} height={14} />
            <Skeleton width={16} height={16} borderRadius={8} />
          </View>
          {i < ROWS - 1 && <RowSeparator insetLeft={spacing.md} insetRight={spacing.md} />}
        </View>
      ))}
    </Card>
  );
}
