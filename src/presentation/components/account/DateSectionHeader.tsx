import { View } from "react-native";
import { useTheme } from "../../providers/ThemeProvider";
import { Text, Amount } from "..";
import { formatDateLong, todayInt } from "../../../lib/date";
import { useSyncedPref } from "../../hooks/useSyncedPref";

function yesterdayInt(): number {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return parseInt(`${y}${m}${day}`, 10);
}

interface DateSectionHeaderProps {
  date: number;
  dailyTotal?: number;
}

export function DateSectionHeader({ date, dailyTotal }: DateSectionHeaderProps) {
  const { colors, spacing } = useTheme();
  useSyncedPref("dateFormat");

  const today = todayInt();
  const yesterday = yesterdayInt();
  const label = date === today ? "Today" : date === yesterday ? "Yesterday" : formatDateLong(date);

  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "baseline",
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.xl,
        paddingBottom: spacing.xs,
        backgroundColor: colors.pageBackground,
      }}
    >
      <Text
        variant="caption"
        color={colors.textMuted}
        style={{ textTransform: "uppercase", letterSpacing: 1.2, fontWeight: "700" }}
      >
        {label}
      </Text>
      {dailyTotal != null && dailyTotal !== 0 && (
        <Amount
          value={dailyTotal}
          variant="caption"
          weight="600"
          showSign
          colored={false}
          color={dailyTotal > 0 ? colors.vibrantPositive : colors.textMuted}
        />
      )}
    </View>
  );
}
