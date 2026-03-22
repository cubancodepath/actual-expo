/**
 * SAmount — SwiftUI currency amount display with auto-shrink.
 *
 * Uses native ScalableText for minimumScaleFactor support.
 * Formats cents as currency string, respects privacy mode,
 * auto-colors based on sign.
 */

import { formatPrivacyAware } from "@/lib/format";
import { usePrivacyStore } from "@/stores/privacyStore";
import { useTheme } from "@/presentation/providers/ThemeProvider";
import { ScalableText } from "../../../../modules/actual-ui";
import { sFont, type SFontVariant } from "../tokens";
import type { CommonViewModifierProps } from "@expo/ui/swift-ui";

// Extract font size from our token presets
const fontSizeMap: Record<SFontVariant, number> = {
  displayLg: 30,
  displaySm: 24,
  headingLg: 20,
  headingSm: 17,
  bodyLg: 15,
  body: 14,
  bodyMedium: 14,
  bodySm: 13,
  caption: 12,
  captionSm: 10,
};
const fontWeightMap: Record<SFontVariant, string> = {
  displayLg: "semibold",
  displaySm: "bold",
  headingLg: "bold",
  headingSm: "semibold",
  bodyLg: "medium",
  body: "regular",
  bodyMedium: "medium",
  bodySm: "regular",
  caption: "regular",
  captionSm: "medium",
};

interface SAmountProps extends CommonViewModifierProps {
  value: number;
  variant?: SFontVariant;
  color?: string;
  colored?: boolean;
  lines?: number;
  weight?: string;
  letterSpacing?: number;
}

export function SAmount({
  value,
  variant = "body",
  color: colorProp,
  colored = true,
  lines = 1,
  weight,
  letterSpacing,
  modifiers: extraModifiers,
}: SAmountProps) {
  const { colors } = useTheme();
  usePrivacyStore();

  let color = colorProp;
  if (!colorProp && colored) {
    if (value > 0) color = colors.vibrantPositive;
    else if (value < 0) color = colors.vibrantNegative;
    else color = colors.textMuted;
  }

  return (
    <ScalableText
      text={formatPrivacyAware(value)}
      fontSize={fontSizeMap[variant]}
      fontWeight={(weight ?? fontWeightMap[variant]) as any}
      color={color}
      maxLines={lines}
      minScale={0.5}
      monoDigits
      letterSpacing={letterSpacing}
      modifiers={extraModifiers}
    />
  );
}
