/**
 * SPill — SwiftUI status pill with colored background and auto-shrink text.
 *
 * Uses native ScalableText for minimumScaleFactor support.
 */

import { background, cornerRadius, padding, frame } from "@expo/ui/swift-ui/modifiers";
import { ScalableText } from "../../../../modules/actual-ui";
import { formatPrivacyAware } from "@/lib/format";
import { usePrivacyStore } from "@/stores/privacyStore";
import { useTheme } from "@/presentation/providers/ThemeProvider";
import type { CommonViewModifierProps } from "@expo/ui/swift-ui";

const fontSizeMap = { caption: 12, captionSm: 10, body: 14, bodySm: 13 } as const;
type PillVariant = keyof typeof fontSizeMap;

interface SPillProps extends CommonViewModifierProps {
  value: number;
  variant?: PillVariant;
  /** Fixed width for table alignment — text shrinks to fit */
  width?: number;
}

export function SPill({
  value,
  variant = "caption",
  width,
  modifiers: extraModifiers,
}: SPillProps) {
  const { colors } = useTheme();
  usePrivacyStore();

  const pillBg =
    value < 0 ? colors.negativeSubtle : value > 0 ? colors.positiveSubtle : colors.cardBackground;
  const pillText = value < 0 ? colors.negative : value > 0 ? colors.positive : colors.textMuted;

  const hasPill = value !== 0;
  const mods = [
    ...(extraModifiers ?? []),
    ...(hasPill
      ? [padding({ horizontal: 8, vertical: 2 }), background(pillBg), cornerRadius(100)]
      : []),
  ];

  return (
    <ScalableText
      text={formatPrivacyAware(value)}
      fontSize={fontSizeMap[variant]}
      fontWeight="bold"
      color={pillText}
      maxLines={1}
      minScale={0.5}
      monoDigits
      modifiers={mods}
    />
  );
}
