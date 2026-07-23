import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Typography } from "heroui-native";
import { formatDateHuman, todayInt, yesterdayInt } from "@/core/shared/months";

/** Muted section label above each date block ("Today" / "Yesterday" / full date). */
export function DateHeader({ date }: { date: number }) {
  const { t, i18n } = useTranslation("transactions");
  const label =
    date === todayInt()
      ? t("today")
      : date === yesterdayInt()
        ? t("yesterday")
        : formatDateHuman(date, i18n.language);
  return (
    <View className="px-4 pb-1.5 pt-4">
      <Typography className="text-[13px] font-semibold text-muted">{label}</Typography>
    </View>
  );
}
