import * as Haptics from "expo-haptics";

/**
 * Tactile feedback for custom controls. Native controls fire their own haptics;
 * anything hand-rolled (a custom switch, a swipe action, a long-press menu) has
 * to ask for them explicitly.
 *
 * Both are fire-and-forget: a failed haptic is never worth surfacing or
 * awaiting, so the promise is swallowed rather than left unhandled.
 */

/**
 * The lightest tick there is, and the only one meant to fire over and over: the
 * selection generator, for a value that changes continuously under the finger —
 * a picker rolling past its options, a dragged row crossing the one below it.
 *
 * Deliberately weaker than {@link lightHaptic}. Impact-Light repeated a dozen
 * times a second reads as a rattle; this reads as detents.
 */
export function selectionHaptic() {
  Haptics.selectionAsync().catch(() => {});
}

/** Light confirmation: a toggle, a tab switch, a gesture landing and sticking. */
export function lightHaptic() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** Heavier confirmation: a long-press landing, a destructive swipe committing. */
export function mediumHaptic() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}

/** Success notification: an action completed in the background (e.g. duplicate). */
export function successHaptic() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

/** Refusal: a gesture that landed somewhere it isn't allowed and snapped back. */
export function warningHaptic() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
}
