import type { NativeStackNavigationOptions } from "@react-navigation/native-stack";

/**
 * Android list-screen header: nothing to add — it inherits the navigator's
 * solid header from `useStackOptions`.
 *
 * See the base file for why Android deliberately does not get the translucent
 * treatment.
 */
export const TRANSLUCENT_HEADER_OPTIONS: NativeStackNavigationOptions = {};

/**
 * Nothing to seed: `placement` is an iOS concept (there is no toolbar for a
 * search bar to be integrated into), so Android's bar is fully described by the
 * screen and appears where the platform puts it.
 */
export function pickerHeaderOptions(
  _placement: "stacked" | "integrated",
): NativeStackNavigationOptions {
  return {};
}

/**
 * The hero modals DO stay transparent on Android: their tinted hero bleeds up
 * under the bar by design, so that one is a layout requirement rather than a
 * platform idiom.
 */
export const HERO_HEADER_OPTIONS: NativeStackNavigationOptions = {
  headerTransparent: true,
  headerStyle: { backgroundColor: "transparent" },
};
