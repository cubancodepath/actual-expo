import { useMemo } from "react";
import type {
  NativeStackHeaderItem,
  NativeStackNavigationOptions,
} from "@react-navigation/native-stack";
import type { HeaderAction, HeaderActions } from "./types";

function toItem(action: HeaderAction): NativeStackHeaderItem {
  return {
    type: "button",
    label: action.label,
    onPress: action.onPress,
    disabled: action.disabled,
    variant: action.emphasis ?? "plain",
    // Only written natively when present (RNSBarButtonItem.mm), so actions
    // without one keep inheriting the navigation bar's tint.
    tintColor: action.tintColor,
    ...(action.icon
      ? { icon: { type: "sfSymbol", name: action.icon.sfSymbol }, accessibilityLabel: action.label }
      : null),
  };
}

/**
 * Turns header actions into navigation options.
 *
 * This iOS variant emits real `UIBarButtonItem`s via `unstable_header*Items`,
 * so UIKit owns their colour, their metrics and — from iOS 26 — whether they
 * share the bar's glass background. That sidesteps the whole class of problems
 * that come from putting an RN view in a native bar: a custom button neither
 * inherits `headerTintColor` (the native config's `color` does not cascade into
 * `ScreenStackHeaderRightView`) nor matches the bar's 44pt height.
 *
 * The Android override renders pressables instead, since bar button items are
 * `@platform ios`.
 *
 * Memoise what you pass in: expo-router re-runs `setOptions` whenever the
 * options object changes identity.
 */
export function useHeaderActionOptions({
  left,
  right,
}: HeaderActions): NativeStackNavigationOptions {
  return useMemo(
    () => ({
      // A custom left action stands in for the back button, not beside it.
      headerBackVisible: !left,
      unstable_headerLeftItems: left ? () => [toItem(left)] : undefined,
      unstable_headerRightItems: right ? () => [toItem(right)] : undefined,
    }),
    [left, right],
  );
}
