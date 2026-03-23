/**
 * SText — Branded SwiftUI Text with typography variants.
 *
 * Maps our design system variants to SwiftUI font() modifiers.
 * Supports color, weight override, line limit, and monospaced digits.
 */

import { Text as SUIText } from "@expo/ui/swift-ui";
import { foregroundStyle, lineLimit, monospacedDigit } from "@expo/ui/swift-ui/modifiers";
import { sFont, type SFontVariant } from "../tokens";
import type { CommonViewModifierProps } from "@expo/ui/swift-ui";

interface STextProps extends CommonViewModifierProps {
  children: string | number;
  /** Typography variant from design tokens */
  variant?: SFontVariant;
  /** Text color (hex or named) */
  color?: string;
  /** Max number of lines (truncates with ellipsis) */
  lines?: number;
  /** Use fixed-width digits */
  tabularNums?: boolean;
}

export function SText({
  children,
  variant = "body",
  color,
  lines,
  tabularNums = false,
  modifiers: extraModifiers,
}: STextProps) {
  const mods = [
    sFont[variant],
    ...(color ? [foregroundStyle(color)] : []),
    ...(lines != null ? [lineLimit(lines)] : []),
    ...(tabularNums ? [monospacedDigit()] : []),
    ...(extraModifiers ?? []),
  ];

  return <SUIText modifiers={mods}>{String(children)}</SUIText>;
}
