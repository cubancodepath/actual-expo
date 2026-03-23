import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../providers/ThemeProvider";
import { Text } from "..";
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
}

export function DateSectionHeader({ date }: DateSectionHeaderProps) {
  const { t } = useTranslation("transactions");
  const { colors, spacing } = useTheme();
  useSyncedPref("dateFormat");

  const today = todayInt();
  const yesterday = yesterdayInt();
  const label =
    date === today ? t("today") : date === yesterday ? t("yesterday") : formatDateLong(date);

  return (
    <View
      style={{
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
    </View>
  );
}
