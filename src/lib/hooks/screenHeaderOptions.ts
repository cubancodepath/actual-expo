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
 * A picker's chrome, search bar included, declared by the navigator.
 *
 * The geometry is here rather than only on the screen because it has to be
 * right in the FIRST native commit. A screen that adds `headerSearchBarOptions`
 * from its own body — however it does it — is applying them after the header
 * has already been configured once without a search bar, and UIKit gets to
 * decide where to put the field it just received: it lands on the navigation
 * bar's trailing edge and then slides down into the toolbar once it settles on
 * integration. That relocation is visible, and react-native-screens' own source
 * warns that reconfiguring a search bar repeatedly misbehaves on iOS 26.
 *
 * So the navigator declares WHERE the bar goes and the screen declares what it
 * does (placeholder, colours, `onChangeText`) via `Stack.SearchBar`, whose
 * options replace this whole key once they register.
 */
export function pickerHeaderOptions(
  placement: "stacked" | "integrated",
): NativeStackNavigationOptions {
  return {
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
    },
  };
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
