import * as Haptics from "expo-haptics";

/**
 * Tactile feedback for custom controls. Native controls fire their own haptics;
 * anything hand-rolled (a custom switch, a swipe action, a long-press menu) has
 * to ask for them explicitly.
 *
 * Both are fire-and-forget: a failed haptic is never worth surfacing or
 * awaiting, so the promise is swallowed rather than left unhandled.
 */

/** Selection-weight tap: toggles, tab switches, crossing a swipe threshold. */
export function lightHaptic() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** Heavier confirmation: a long-press landing, a destructive swipe committing. */
export function mediumHaptic() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}
