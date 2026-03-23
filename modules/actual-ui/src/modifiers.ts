import { createModifier } from "@expo/ui/swift-ui/modifiers";

/**
 * Sets the minimum scale factor for text that doesn't fit.
 * When text is too large for its container, it shrinks down to this factor
 * instead of truncating. Equivalent to SwiftUI's .minimumScaleFactor().
 *
 * @param factor - Scale factor between 0 and 1 (e.g. 0.7 = shrink up to 70%)
 */
export const minimumScaleFactor = (factor: number) =>
  createModifier("minimumScaleFactor", { factor });
