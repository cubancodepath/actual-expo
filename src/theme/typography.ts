import { TextStyle } from "react-native";

// System font — matches Actual Budget's approach (no custom fonts)

export const typography = {
  displayLg: {
    fontSize: 30,
    lineHeight: 38,
    fontWeight: "600",
  },
  displaySm: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  headingLg: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  headingSm: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "600",
  },
  bodyLg: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "500",
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "400",
  },
  bodySm: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "400",
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400",
  },
  captionSm: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "500",
  },
} as const satisfies Record<string, TextStyle>;

export type TypographyVariant = keyof typeof typography;
export type Typography = typeof typography;
