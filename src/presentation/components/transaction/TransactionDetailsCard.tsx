import { memo } from "react";
import { Alert, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { DetailRow } from "./DetailRow";
import { DatePickerField } from "./DatePickerField";
import type { Theme } from "@/theme";

interface TransactionDetailsCardProps {
  acctId: string | null;
  acctName: string;
  payeeId: string | null;
  payeeName: string;
  isTransfer: boolean;
  categoryId: string | null;
  categoryName: string;
  isSplit: boolean;
  splitCount: number;
  dateInt: number;
  dateStr: string;
  cents: number;
  transactionId?: string;
  isEdit: boolean;
  onDateChange: (dateInt: number) => void;
  onClearCategory?: () => void;
  cardStyle: object;
  dividerStyle: object;
  spacing: Theme["spacing"];
}

export const TransactionDetailsCard = memo(function TransactionDetailsCard({
  acctId,
  acctName,
  payeeId,
  payeeName,
  isTransfer,
  categoryId,
  categoryName,
  isSplit,
  splitCount,
  dateInt,
  dateStr,
  cents,
  transactionId,
  isEdit,
  onDateChange,
  onClearCategory,
  cardStyle,
  dividerStyle,
  spacing,
}: TransactionDetailsCardProps) {
  const router = useRouter();
  const { t } = useTranslation("transactions");

  return (
    <View style={{ marginTop: -20, zIndex: 1, paddingHorizontal: spacing.lg }}>
      <View style={cardStyle}>
        <DetailRow
          icon="wallet-outline"
          label={acctName}
          placeholder={t("account")}
          onPress={() =>
            router.push({ pathname: "./account-picker", params: { selectedId: acctId ?? "" } })
          }
        />
        <View style={dividerStyle} />

        <DetailRow
          icon="person-outline"
          label={payeeName}
          placeholder={t("payee")}
          onPress={() =>
            router.push({
              pathname: "./payee-picker",
              params: {
                selectedId: payeeId ?? "",
                selectedName: payeeName,
                accountId: acctId ?? "",
              },
            })
          }
        />
        <View style={dividerStyle} />

        <DetailRow
          icon={isSplit ? "git-branch-outline" : "folder-outline"}
          label={
            isTransfer
              ? ""
              : isSplit
                ? t("splitCategories", { count: splitCount })
                : categoryId
                  ? categoryName
                  : ""
          }
          placeholder={isTransfer ? t("noCategoryNeeded") : t("category")}
          onClear={onClearCategory}
          onPress={() => {
            if (isTransfer) {
              Alert.alert(t("transferTitle"), t("transferNoCategoryMessage"));
              return;
            }
            if (isSplit) {
              router.push({
                pathname: "./split",
                params: {
                  amount: String(cents),
                  payeeId: payeeId ?? "",
                  payeeName,
                  transactionId: transactionId ?? "",
                },
              });
            } else {
              const month = dateStr.slice(0, 7);
              router.push({
                pathname: "./category-picker",
                params: {
                  month,
                  selectedId: categoryId ?? "",
                  amount: String(cents),
                  payeeId: payeeId ?? "",
                  payeeName,
                  transactionId: transactionId ?? "",
                },
              });
            }
          }}
        />
        <View style={dividerStyle} />

        <DatePickerField dateInt={dateInt} onDateChange={onDateChange} />
      </View>
    </View>
  );
});
