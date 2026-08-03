import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useThemeColor } from "heroui-native";
import type { NativeStackNavigationOptions } from "@react-navigation/native-stack";
import type { PickerSearch } from "@/lib/config/pickerSearch";

/**
 * Header chrome for scrolling list screens (pickers, split amounts) — declared
 * by the navigator rather than by the screen, the same place the HeroUI fitness
 * example puts it.
 *
 * iOS floats the list under a translucent header: on iOS 26 the system paints
 * liquid glass behind it, and `ScreenFade` covers older versions.
 *
 * The Android override (`.android.ts`) keeps the navigator's solid header — a
 * translucent nav bar over scrolling content is an iOS idiom, not an Android
 * one.
 */
export const TRANSLUCENT_HEADER_OPTIONS: NativeStackNavigationOptions = {
  headerTransparent: true,
  // headerTransparent only clears the background when headerStyle doesn't set
  // one, and useStackOptions sets an opaque one.
  headerStyle: { backgroundColor: "transparent" },
};

/**
 * A picker's chrome, search bar included, declared by the navigator.
 *
 * This has to be right in the FIRST native commit. A screen that only adds
 * `headerSearchBarOptions` from its own body is applying them after the header
 * has already been configured once without them, so the bar — and, on a route
 * the navigator left `headerShown: false`, the entire header — appears a frame
 * late and shoves the content down.
 *
 * It returns the bar's COMPLETE configuration rather than just the geometry
 * because the screen's `Stack.SearchBar` replaces this key rather than merging
 * into it: anything left out here would still be arriving late. Both sides
 * build it from the same {@link PickerSearch} so they cannot drift.
 */
export function usePickerHeaderOptions(search: PickerSearch): NativeStackNavigationOptions {
  const { t } = useTranslation("transactions");
  const [foreground, accent] = useThemeColor(["foreground", "accent"]);
  const { placement, placeholderKey } = search;

  return useMemo(
    () => ({
      ...TRANSLUCENT_HEADER_OPTIONS,
      headerSearchBarOptions: {
        placement,
        // Only an integrated bar may fall through to the bottom toolbar. Left at
        // its default (true) a stacked bar can be moved down by UIKit, which is
        // the opposite of what "stacked" asks for.
        allowToolbarIntegration: placement === "integrated",
        hideWhenScrolling: false,
        // UIKit hides the nav bar while the search field is active (the prop
        // defaults to true before iOS 26), which would drop the title and the
        // header actions — Cancel/Next/Split — exactly when they're needed.
        hideNavigationBar: false,
        placeholder: t(placeholderKey),
        autoCapitalize: "none" as const,
        textColor: foreground,
        tintColor: accent,
      },
    }),
    [placement, placeholderKey, t, foreground, accent],
  );
}

/**
 * Header chrome for the transaction/schedule editor modals.
 *
 * Transparent on BOTH platforms, unlike {@link TRANSLUCENT_HEADER_OPTIONS} —
 * here it isn't an iOS idiom but a layout requirement: those screens open with a
 * tinted hero that deliberately bleeds up under the bar, and an opaque header
 * would slice its top off.
 */
export const HERO_HEADER_OPTIONS: NativeStackNavigationOptions = {
  headerTransparent: true,
  headerStyle: { backgroundColor: "transparent" },
};
