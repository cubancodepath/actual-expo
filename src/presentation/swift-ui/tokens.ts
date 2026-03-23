/**
 * SwiftUI Design Tokens — mirrors our RN theme system for native components.
 *
 * Typography presets, spacing constants, and border radius values
 * that match the existing React Native design system.
 */

import { font } from "@expo/ui/swift-ui/modifiers";

// ---------------------------------------------------------------------------
// Typography — maps our RN variants to SwiftUI font() modifiers
// ---------------------------------------------------------------------------

export const sFont = {
  displayLg: font({ size: 30, weight: "semibold" }),
  displaySm: font({ size: 24, weight: "bold" }),
  headingLg: font({ size: 20, weight: "bold" }),
  headingSm: font({ size: 17, weight: "semibold" }),
  bodyLg: font({ size: 15, weight: "medium" }),
  body: font({ size: 14 }),
  bodyMedium: font({ size: 14, weight: "medium" }),
  bodySm: font({ size: 13 }),
  caption: font({ size: 12 }),
  captionSm: font({ size: 10, weight: "medium" }),
} as const;

export type SFontVariant = keyof typeof sFont;

// ---------------------------------------------------------------------------
// Spacing — same 4px grid as RN theme
// ---------------------------------------------------------------------------

export const sSpacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

// ---------------------------------------------------------------------------
// Border Radius
// ---------------------------------------------------------------------------

export const sRadius = {
  sm: 6,
  md: 12,
  lg: 16,
  xl: 20,
  full: 9999,
} as const;
