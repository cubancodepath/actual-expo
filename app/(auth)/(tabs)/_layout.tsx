import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../../src/presentation/providers/ThemeProvider";
import { useTabBarStore } from "../../../src/stores/tabBarStore";

export const unstable_settings = {
  initialRouteName: "(budget)",
  anchor: "(budget)",
};

export default function TabsLayout() {
  const { colors } = useTheme();
  const tabBarHidden = useTabBarStore((s) => s.hidden);
  const { t } = useTranslation();

  return (
    <NativeTabs tintColor={colors.primary} hidden={tabBarHidden}>
      <NativeTabs.Trigger name="(accounts)">
        <NativeTabs.Trigger.Icon sf="creditcard" md="account_balance_wallet" />
        <NativeTabs.Trigger.Label>{t('tabs.accounts')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(budget)">
        <NativeTabs.Trigger.Icon sf="chart.pie" md="pie_chart" />
        <NativeTabs.Trigger.Label>{t('tabs.budget')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(spending)">
        <NativeTabs.Trigger.Icon sf="arrow.left.arrow.right" md="swap_horiz" />
        <NativeTabs.Trigger.Label>{t('tabs.spending')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
