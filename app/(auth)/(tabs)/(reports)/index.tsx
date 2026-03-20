import { ScrollView } from "react-native";
import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/presentation/providers/ThemeProvider";
import { useCommonMenuActions } from "@/presentation/hooks/useCommonMenuItems";
import { NetWorthCard } from "@/presentation/components/dashboard/NetWorthCard";
import { CashFlowCard } from "@/presentation/components/dashboard/CashFlowCard";
import { SpendingByCategoryCard } from "@/presentation/components/dashboard/SpendingByCategoryCard";
import { SavingsRateCard } from "@/presentation/components/dashboard/SavingsRateCard";
import { AgeOfMoneyCard } from "@/presentation/components/dashboard/AgeOfMoneyCard";

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
      <NetWorthCard />
      <CashFlowCard />
      <SpendingByCategoryCard />
      <SavingsRateCard />
      <AgeOfMoneyCard />
    </ScrollView>
  );
}
