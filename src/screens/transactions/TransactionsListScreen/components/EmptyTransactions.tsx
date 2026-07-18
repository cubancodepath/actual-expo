import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Typography, useThemeColor } from "heroui-native";
import { ReceiptText } from "lucide-react-native";

/** Centered empty state shown when the query returns no transactions. */
export function EmptyTransactions() {
  const { t } = useTranslation("transactions");
  const muted = useThemeColor("muted");
  return (
    <View className="items-center gap-3 px-8 py-16">
      <ReceiptText size={32} color={muted} />
      <Typography className="text-base font-semibold text-foreground">
        {t("list.empty.title")}
      </Typography>
      <Typography className="text-center text-sm text-muted">
        {t("list.empty.description")}
      </Typography>
    </View>
  );
}
