import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/presentation/providers/ThemeProvider";
import { useTabBarStore } from "@/stores/tabBarStore";

export default function TabsLayout() {
  const { colors } = useTheme();
  const tabBarHidden = useTabBarStore((s) => s.hidden);
  const { t } = useTranslation();

  return (
    <NativeTabs tintColor={colors.primary} hidden={tabBarHidden}>
      <NativeTabs.Trigger name="(budget)">
        <NativeTabs.Trigger.Icon sf="wallet.bifold.fill" md="account_balance_wallet" />
        <NativeTabs.Trigger.Label>{t("tabs.budget")}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(accounts)">
        <NativeTabs.Trigger.Icon sf="building.columns" md="account_balance" />
        <NativeTabs.Trigger.Label>{t("tabs.accounts")}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(spending)">
        <NativeTabs.Trigger.Icon sf="chart.line.uptrend.xyaxis" md="trending_up" />
        <NativeTabs.Trigger.Label>{t("tabs.spending")}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      {__DEV__ && (
        <NativeTabs.Trigger name="(test)">
          <NativeTabs.Trigger.Icon sf="flask" md="science" />
          <NativeTabs.Trigger.Label>Test</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      )}
    </NativeTabs>
  );
}
