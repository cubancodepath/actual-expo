import * as Haptics from "expo-haptics";
import { Tabs } from "expo-router";
import { cn, PressableFeedback, Surface, useThemeColor } from "heroui-native";
import type { ComponentProps } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenFade } from "@/ui/navigation/ScreenFade";
import { TABS } from "@/lib/config/tabs";
import { useTabBarStore } from "@/stores/tabBarStore";

export const TAB_BAR_SAFE_OFFSET_ADDON_PX = 12;
const TAB_BAR_FADE_HEIGHT_PX = 140;
const ICON_SIZE = 22;

/** Fire-and-forget haptic; swallows rejections where the engine is absent. */
const fireHaptic = (): void => {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch((): void => {});
};

/**
 * Props Expo Router's JS `Tabs` passes to a custom `tabBar` renderer.
 *
 * Derived from `Tabs` because expo-router 55 has no public type for this.
 * TODO(expo-router >= 56): replace with `import type { BottomTabBarProps } from "expo-router/js-tabs"`.
 */
type FloatingTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>["tabBar"]>>[0];

/**
 * Branded bottom navigation for Android, mirroring the iOS `NativeTabs`.
 * Built entirely from HeroUI primitives (`Surface`, `PressableFeedback`) and
 * tinted with the shared theme tokens, so it tracks light/dark and the same
 * `--accent` / `--muted` colors as the rest of the migrated app.
 */
export const FloatingTabBar = ({
  state,
  navigation,
}: FloatingTabBarProps): React.ReactElement | null => {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const hidden = useTabBarStore((s) => s.hidden);
  const accentForeground = useThemeColor("accent-foreground");
  const muted = useThemeColor("muted");

  if (hidden) {
    return null;
  }

  return (
    <View pointerEvents="box-none" style={{ position: "absolute", left: 0, right: 0, bottom: 0 }}>
      <ScreenFade edge="bottom" height={insets.bottom + TAB_BAR_FADE_HEIGHT_PX} />
      <View
        pointerEvents="box-none"
        style={{
          alignItems: "center",
          marginBottom: insets.bottom + TAB_BAR_SAFE_OFFSET_ADDON_PX,
        }}
      >
        <Surface
          variant="default"
          className="flex-row items-center gap-1 rounded-full p-1.5 shadow-overlay"
        >
          {state.routes.map((route, index) => {
            const config = TABS.find((tab) => tab.name === route.name);
            if (config === undefined) {
              return null;
            }
            const isFocused = state.index === index;
            const label = t(config.labelKey);
            const Icon = config.icon;

            const handlePress = (): void => {
              fireHaptic();
              const event = navigation.emit({
                type: "tabPress",
                target: route.key,
                canPreventDefault: true,
              });
              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(route.name, route.params);
              }
            };

            const handleLongPress = (): void => {
              navigation.emit({ type: "tabLongPress", target: route.key });
            };

            return (
              <PressableFeedback
                key={route.key}
                accessibilityRole="button"
                accessibilityState={isFocused ? { selected: true } : {}}
                accessibilityLabel={label}
                onPress={handlePress}
                onLongPress={handleLongPress}
                hitSlop={6}
                className={cn(
                  "h-11 w-14 items-center justify-center rounded-full",
                  isFocused ? "bg-accent shadow-sm" : "bg-transparent",
                )}
              >
                <PressableFeedback.Highlight />
                <Icon
                  size={ICON_SIZE}
                  color={isFocused ? accentForeground : muted}
                  strokeWidth={isFocused ? 2.4 : 2}
                />
              </PressableFeedback>
            );
          })}
        </Surface>
      </View>
    </View>
  );
};
