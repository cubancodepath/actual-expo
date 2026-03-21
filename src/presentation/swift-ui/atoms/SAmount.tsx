/**
 * SAmount — SwiftUI currency amount display.
 *
 * Formats cents as currency string, respects privacy mode,
 * auto-colors based on sign, uses monospaced digits.
 */

import { Text as SUIText } from "@expo/ui/swift-ui";
import { foregroundStyle, lineLimit, monospacedDigit } from "@expo/ui/swift-ui/modifiers";
import { sFont, type SFontVariant } from "../tokens";
import { formatPrivacyAware } from "@/lib/format";
import { usePrivacyStore } from "@/stores/privacyStore";
import { useTheme } from "@/presentation/providers/ThemeProvider";
import type { CommonViewModifierProps } from "@expo/ui/swift-ui";

interface SAmountProps extends CommonViewModifierProps {
  /** Amount in cents */
  value: number;
  /** Typography variant */
  variant?: SFontVariant;
  /** Explicit color — overrides auto-coloring */
  color?: string;
  /** Auto-color based on sign (default true) */
  colored?: boolean;
  /** Max lines */
  lines?: number;
}

export function SAmount({
  value,
  variant = "body",
  color: colorProp,
  colored = true,
  lines,
  modifiers: extraModifiers,
}: SAmountProps) {
  const { colors } = useTheme();
  usePrivacyStore(); // subscribe to re-render on privacy toggle

  let color = colorProp;
  if (!colorProp && colored) {
    if (value > 0) color = colors.positive;
    else if (value < 0) color = colors.negative;
    else color = colors.textMuted;
  }

  const mods = [
    sFont[variant],
    monospacedDigit(),
    ...(color ? [foregroundStyle(color)] : []),
    ...(lines != null ? [lineLimit(lines)] : []),
    ...(extraModifiers ?? []),
  ];

  return <SUIText modifiers={mods}>{formatPrivacyAware(value)}</SUIText>;
}
