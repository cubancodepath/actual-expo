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
 * The hero modals DO stay transparent on Android: their tinted hero bleeds up
 * under the bar by design, so that one is a layout requirement rather than a
 * platform idiom.
 */
export const HERO_HEADER_OPTIONS: NativeStackNavigationOptions = {
  headerTransparent: true,
  headerStyle: { backgroundColor: "transparent" },
};
