import { View } from "react-native";
import { useTheme } from "../../providers/ThemeProvider";
import { Text } from "..";
import { formatDateLong } from "../../../lib/date";
import { useSyncedPref } from "../../hooks/useSyncedPref";

interface DateSectionHeaderProps {
  date: number;
}

export function DateSectionHeader({ date }: DateSectionHeaderProps) {
  const { colors, spacing } = useTheme();
  // Subscribe to dateFormat so component re-renders when it changes
  useSyncedPref("dateFormat");

  return (
    <View
      style={{
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.lg,
        paddingBottom: spacing.sm,
        backgroundColor: colors.pageBackground,
      }}
    >
      <Text
        variant="captionSm"
        color={colors.textMuted}
        style={{ textTransform: "uppercase", letterSpacing: 0.8, fontWeight: "700" }}
      >
        {formatDateLong(date)}
      </Text>
    </View>
  );
}
