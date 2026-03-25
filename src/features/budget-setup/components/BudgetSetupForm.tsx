import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { CurrencyInput, TextField, Input, Label } from "@/ui";

type BudgetSetupFormProps = {
  budgetName: string;
  onBudgetNameChange: (v: string) => void;
  accountName: string;
  onAccountNameChange: (v: string) => void;
  balance: number;
  onBalanceChange: (v: number) => void;
};

export function BudgetSetupForm({
  budgetName,
  onBudgetNameChange,
  accountName,
  onAccountNameChange,
  balance,
  onBalanceChange,
}: BudgetSetupFormProps) {
  const { t } = useTranslation("setup");

  return (
    <View className="gap-6">
      <TextField>
        <Label>{t("budgetName")}</Label>
        <Input
          value={budgetName}
          onChangeText={onBudgetNameChange}
          placeholder={t("budgetNamePlaceholder")}
          autoCapitalize="words"
          className="rounded-md"
        />
      </TextField>

      <TextField>
        <Label>{t("accountName")}</Label>
        <Input
          value={accountName}
          onChangeText={onAccountNameChange}
          placeholder={t("accountNamePlaceholder")}
          autoCapitalize="words"
          className="rounded-md"
        />
      </TextField>

      <View className="items-center mt-2">
        <Text className="text-xs font-medium text-muted uppercase tracking-widest mb-1">
          {t("balance")}
        </Text>
        <CurrencyInput value={balance} onChange={onBalanceChange} />
      </View>
    </View>
  );
}
