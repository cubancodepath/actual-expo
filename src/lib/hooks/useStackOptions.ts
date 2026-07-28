import { useMemo } from "react";
import { useThemeColor } from "heroui-native";
import type { NativeStackNavigationOptions } from "@react-navigation/native-stack";

export type StackOptions = {
  /**
   * Regular pushes, and the children of a `fullScreenModal` — a full-screen
   * route *is* the canvas, so it sits at the base of the ladder.
   */
  screen: NativeStackNavigationOptions;
  /**
   * Pushes INSIDE a stack that is itself presented as a modal/sheet. The route
   * doesn't declare a presentation of its own, but it's still floating over the
   * screen behind it, so its canvas is the overlay.
   */
  sheet: NativeStackNavigationOptions;
  /** `presentation: "modal"` — a card over the visible parent screen. */
  modal: NativeStackNavigationOptions;
  /** `presentation: "formSheet"`, with the detents the route wants. */
  formSheet: (detents?: number[]) => NativeStackNavigationOptions;
};

/**
 * Navigator options built from HeroUI theme tokens.
 *
 * A navigator paints its own background *behind* the screen — React Navigation
 * falls back to its theme's `colors.background` when `contentStyle` is unset,
 * which is why every `<Stack>` must pick one of these. Sheets get `overlay`
 * (the token for floating containers) so the native sheet's rounded corners and
 * the screen root agree; everything else gets `background`.
 *
 * Replaces the old `@/lib/screenOptions`, which sourced its colors from the
 * legacy design-system theme and so painted modals a different color than the
 * HeroUI screens rendered inside them.
 */
export function useStackOptions(): StackOptions {
  const [background, overlay, foreground] = useThemeColor(["background", "overlay", "foreground"]);

  return useMemo(() => {
    const base = { headerTintColor: foreground, headerShadowVisible: false };
    const screen: NativeStackNavigationOptions = {
      ...base,
      headerStyle: { backgroundColor: background },
      contentStyle: { backgroundColor: background },
    };
    const sheet: NativeStackNavigationOptions = {
      ...base,
      headerStyle: { backgroundColor: overlay },
      contentStyle: { backgroundColor: overlay },
    };

    return {
      screen,
      sheet,
      modal: { ...sheet, presentation: "modal" },
      formSheet: (detents = [1.0]) => ({
        ...sheet,
        presentation: "formSheet",
        sheetAllowedDetents: detents,
      }),
    };
  }, [background, overlay, foreground]);
}
