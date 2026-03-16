import { View } from "react-native";
import { useTheme } from "../../providers/ThemeProvider";
import { Skeleton } from "../atoms/Skeleton";

const ROWS = 6;

export function PayeesListSkeleton() {
  const { spacing } = useTheme();

  return (
    <View>
      {Array.from({ length: ROWS }).map((_, i) => (
        <View
          key={i}
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 16,
            paddingVertical: 12,
            gap: 12,
          }}
        >
          <Skeleton width={18} height={18} borderRadius={9} />
          <View style={{ flex: 1, gap: spacing.xs }}>
            <Skeleton width="50%" height={14} />
            <Skeleton width={60} height={12} />
          </View>
        </View>
      ))}
    </View>
  );
}
