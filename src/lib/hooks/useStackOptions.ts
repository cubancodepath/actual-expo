import { useMemo } from "react";
import { useThemeColor } from "heroui-native";
import type { NativeStackNavigationOptions } from "@react-navigation/native-stack";

export type StackOptions = {
  /** A pushed route, a tab root, or a `fullScreenModal`. */
  screen: NativeStackNavigationOptions;
  /** `presentation: "modal"` — a card over the visible parent screen. */
  modal: NativeStackNavigationOptions;
  /** `presentation: "formSheet"`, with the detents the route wants. */
  formSheet: (detents?: number[]) => NativeStackNavigationOptions;
};

/**
 * Navigator options built from the HeroUI theme tokens.
 *
 * Every `<Stack>` needs one of these: React Navigation paints its own
 * background *behind* each screen and falls back to its theme's
 * `colors.background` whenever `contentStyle` is unset — which is where the
 * white flashes between screens came from.
 *
 * All three sets share the same `background` canvas on purpose. A route modal
 * is a full screen with a backdrop; its elevation comes from the rounded
 * corners, the shadow and the dimmed screen behind it, not from a different
 * token. Keeping the route's `contentStyle` equal to the screen root's own
 * background is also what stops a mismatched crescent from showing behind a
 * formSheet's rounded corners.
 *
 * Replaces the old `@/lib/screenOptions`, which sourced its colors from the
 * legacy design-system theme and so painted modals a different color than the
 * HeroUI screens rendered inside them.
 */
export function useStackOptions(): StackOptions {
  const [background, foreground] = useThemeColor(["background", "foreground"]);

  return useMemo(() => {
    const screen: NativeStackNavigationOptions = {
      headerTintColor: foreground,
      headerShadowVisible: false,
      headerStyle: { backgroundColor: background },
      contentStyle: { backgroundColor: background },
    };

    return {
      screen,
      modal: { ...screen, presentation: "modal" },
      formSheet: (detents = [1.0]) => ({
        ...screen,
        presentation: "formSheet",
        sheetAllowedDetents: detents,
      }),
    };
  }, [background, foreground]);
}
