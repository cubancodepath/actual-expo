import { View } from "react-native";
import { useTheme } from "../../providers/ThemeProvider";
import { Skeleton } from "../atoms/Skeleton";
import { Card } from "../atoms/Card";

const GROUPS = 2;
const CATS_PER_GROUP = 3;

function GroupSkeleton() {
  const { spacing, borderRadius: br } = useTheme();

  return (
    <View>
      {/* Group header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: spacing.lg + spacing.lg,
          paddingTop: spacing.lg + spacing.md,
          paddingBottom: spacing.md,
          gap: 6,
        }}
      >
        <Skeleton width="40%" height={12} />
        <View style={{ flex: 1 }} />
        <Skeleton width={60} height={12} />
      </View>

      {/* Category rows */}
      <Card style={{ marginHorizontal: spacing.lg }}>
        {Array.from({ length: CATS_PER_GROUP }).map((_, i) => (
          <View
            key={i}
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: spacing.lg,
              paddingVertical: 12,
              minHeight: 44,
              gap: spacing.sm,
              borderBottomWidth: i < CATS_PER_GROUP - 1 ? 0.5 : 0,
              borderBottomColor: "rgba(255,255,255,0.06)",
            }}
          >
            <Skeleton width="45%" height={14} />
            <View style={{ flex: 1 }} />
            <Skeleton width={55} height={14} />
            <Skeleton width={50} height={22} borderRadius={br.full} />
          </View>
        ))}
      </Card>
    </View>
  );
}

export function BudgetListSkeleton() {
  return (
    <View>
      {Array.from({ length: GROUPS }).map((_, i) => (
        <GroupSkeleton key={i} />
      ))}
    </View>
  );
}
