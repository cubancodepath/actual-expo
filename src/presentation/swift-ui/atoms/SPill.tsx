/**
 * SPill — SwiftUI status pill with colored background.
 *
 * Displays a currency amount inside a rounded pill with
 * background color based on balance status.
 */

import { Text as SUIText } from "@expo/ui/swift-ui";
import {
  foregroundStyle,
  background,
  cornerRadius,
  padding,
  monospacedDigit,
  lineLimit,
} from "@expo/ui/swift-ui/modifiers";
import { sFont, type SFontVariant } from "../tokens";
import { formatPrivacyAware } from "@/lib/format";
import { usePrivacyStore } from "@/stores/privacyStore";
import { useTheme } from "@/presentation/providers/ThemeProvider";
import type { CommonViewModifierProps } from "@expo/ui/swift-ui";

interface SPillProps extends CommonViewModifierProps {
  /** Amount in cents */
  value: number;
  /** Typography variant */
  variant?: SFontVariant;
}

export function SPill({ value, variant = "caption", modifiers: extraModifiers }: SPillProps) {
  const { colors } = useTheme();
  usePrivacyStore();

  const pillBg =
    value < 0 ? colors.negativeSubtle : value > 0 ? colors.positiveSubtle : colors.cardBackground;

  const pillText = value < 0 ? colors.negative : value > 0 ? colors.positive : colors.textMuted;

  const mods = [
    sFont[variant],
    monospacedDigit(),
    lineLimit(1),
    foregroundStyle(pillText),
    padding({ horizontal: 10, vertical: 3 }),
    background(pillBg),
    cornerRadius(100),
    ...(extraModifiers ?? []),
  ];

  return <SUIText modifiers={mods}>{formatPrivacyAware(value)}</SUIText>;
}
