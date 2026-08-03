import { useMemo } from "react";
import type {
  NativeStackHeaderItem,
  NativeStackNavigationOptions,
} from "@react-navigation/native-stack";
import type { HeaderAction, HeaderActions } from "./types";

function toItem(action: HeaderAction): NativeStackHeaderItem {
  const shared = {
    label: action.label,
    disabled: action.disabled,
    // Only written natively when present (RNSBarButtonItem.mm), so actions
    // without one keep inheriting the navigation bar's tint.
    tintColor: action.tintColor,
    ...(action.icon
      ? {
          icon: { type: "sfSymbol" as const, name: action.icon.sfSymbol },
          accessibilityLabel: action.label,
        }
      : null),
  };

  // An overflow menu is a UIMenu hung off the bar button item, so UIKit presents
  // it — anchored, dismissed and animated like every other menu in the system,
  // which a JS popover drawn over the bar can only imitate.
  if (action.items) {
    return {
      ...shared,
      type: "menu",
      menu: {
        items: action.items.map((item) => ({
          type: "action" as const,
          label: item.label,
          description: item.description,
          onPress: item.onPress,
          disabled: item.disabled,
          destructive: item.destructive,
          ...(item.icon ? { icon: { type: "sfSymbol" as const, name: item.icon.sfSymbol } } : null),
        })),
      },
    };
  }

  return {
    ...shared,
    type: "button",
    onPress: action.onPress,
    variant: action.emphasis ?? "plain",
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
  return useMemo(() => {
    const rights = right ? (Array.isArray(right) ? right : [right]) : [];
    return {
      // A custom left action stands in for the back button, not beside it.
      headerBackVisible: !left,
      unstable_headerLeftItems: left ? () => [toItem(left)] : undefined,
      // Passed in reading order, NOT reversed: UIKit does place
      // rightBarButtonItems[0] at the screen edge, but native-stack already
      // flips the array for that (useHeaderConfigProps.tsx, "iOS renders right
      // items in reverse order"). Reversing here too would cancel it out.
      unstable_headerRightItems: rights.length > 0 ? () => rights.map(toItem) : undefined,
    };
  }, [left, right]);
}
