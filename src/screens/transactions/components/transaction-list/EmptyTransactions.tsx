import { useTranslation } from "react-i18next";
import { ReceiptText } from "lucide-react-native";
import { EmptyState } from "heroui-native-pro";
import { useThemeColor } from "heroui-native";

/** Centered empty state shown when the query returns no transactions. */
export function EmptyTransactions() {
  const { t } = useTranslation("transactions");
  const foreground = useThemeColor("foreground");
  return (
    <EmptyState>
      <EmptyState.Header>
        <EmptyState.Media variant="icon">
          <ReceiptText size={20} color={foreground} />
        </EmptyState.Media>
        <EmptyState.Title>{t("list.empty.title")}</EmptyState.Title>
        <EmptyState.Description>{t("list.empty.description")}</EmptyState.Description>
      </EmptyState.Header>
    </EmptyState>
  );
}
