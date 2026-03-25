import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Spinner } from "@/ui";

type BudgetOpeningOverlayProps = {
  phase: "downloading" | "opening";
  budgetName?: string | null;
};

export function BudgetOpeningOverlay({ phase, budgetName }: BudgetOpeningOverlayProps) {
  const { t } = useTranslation("common");
  const label = phase === "downloading" ? t("downloadingBudget") : t("openingBudget");

  return (
    <View
      className="absolute inset-0 bg-background/80 items-center justify-center"
      pointerEvents="box-only"
    >
      <View className="items-center gap-4">
        <Spinner themeColor="accent" />
        <Text className="text-base font-medium text-foreground">{label}</Text>
        {budgetName && <Text className="text-sm text-muted">{budgetName}</Text>}
      </View>
    </View>
  );
}
