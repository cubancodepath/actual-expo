import type { NativeStackNavigationOptions } from "@react-navigation/native-stack";

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
