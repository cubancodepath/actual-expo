import { ScrollView } from "react-native";
import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/design-system/providers/ThemeProvider";
import { useCommonMenuActions } from "@/shared/hooks/useCommonMenuItems";
import { NetWorthCard } from "@/features/reports/components/NetWorthCard";
import { CashFlowCard } from "@/features/reports/components/CashFlowCard";
import { SpendingByCategoryCard } from "@/features/reports/components/SpendingByCategoryCard";
import { SavingsRateCard } from "@/features/reports/components/SavingsRateCard";
import { AgeOfMoneyCard } from "@/features/reports/components/AgeOfMoneyCard";
import { BudgetProgressCard } from "@/features/reports/components/BudgetProgressCard";

export default function ReportsScreen() {
  const { spacing } = useTheme();
  const { t } = useTranslation();
  const commonActions = useCommonMenuActions();

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        padding: spacing.lg,
        gap: spacing.lg,
        paddingBottom: spacing.xxxl,
      }}
    >
      <Stack.Screen.Title large>{t("tabs.reports")}</Stack.Screen.Title>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Menu icon="ellipsis">{commonActions}</Stack.Toolbar.Menu>
      </Stack.Toolbar>
      <BudgetProgressCard />
      <NetWorthCard />
      <CashFlowCard />
      <SpendingByCategoryCard />
      <SavingsRateCard />
      <AgeOfMoneyCard />
    </ScrollView>
  );
}
