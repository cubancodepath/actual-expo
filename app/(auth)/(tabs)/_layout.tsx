import { Tabs } from "expo-router";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useThemeColor } from "heroui-native";
import { useTranslation } from "react-i18next";
import { Platform } from "react-native";
import { FloatingTabBar } from "@/ui/navigation/FloatingTabBar";
import { TABS } from "@/lib/config/tabs";
import { useTabBarStore } from "@/stores/tabBarStore";

export default function TabsLayout() {
  const accent = useThemeColor("accent");
  const muted = useThemeColor("muted");
  const background = useThemeColor("background");
  const tabBarHidden = useTabBarStore((s) => s.hidden);
  const { t } = useTranslation();

  if (Platform.OS === "ios") {
    return (
      <NativeTabs tintColor={accent} iconColor={muted} hidden={tabBarHidden}>
        {TABS.map((tab) => (
          <NativeTabs.Trigger key={tab.name} name={tab.name}>
            <NativeTabs.Trigger.Icon sf={tab.sf} md={tab.md} />
            <NativeTabs.Trigger.Label>{t(tab.labelKey)}</NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>
        ))}
      </NativeTabs>
    );
  }

  return (
    <Tabs
      // A tab navigator paints its own scene background, independent of the
      // Stack inside each tab — without `sceneStyle` it falls back to the
      // navigation theme instead of our token.
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: "none" },
        sceneStyle: { backgroundColor: background },
      }}
      tabBar={(props) => <FloatingTabBar {...props} />}
    >
      {TABS.map((tab) => (
        <Tabs.Screen key={tab.name} name={tab.name} />
      ))}
    </Tabs>
  );
}
