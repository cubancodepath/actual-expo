import { View } from "react-native";
import { useTheme } from "../../providers/ThemeProvider";
import { Text } from "..";
import { formatDateLong } from "../../../lib/date";
import { useSyncedPref } from "../../hooks/useSyncedPref";

interface UpcomingDateHeaderProps {
  date: number;
}

export function UpcomingDateHeader({ date }: UpcomingDateHeaderProps) {
  const { colors, spacing, borderWidth: bw } = useTheme();
  useSyncedPref("dateFormat");

  return (
    <View
      style={{
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.xs,
        backgroundColor: colors.primarySubtle,
        opacity: 0.6,
        borderTopWidth: bw.thin,
        borderBottomWidth: bw.thin,
        borderColor: colors.divider,
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
