import { View } from "react-native";
import { useTheme } from "../../providers/ThemeProvider";
import { Text } from "./Text";
import type { ThemeColors } from "../../../theme";

type PillVariant = "default" | "primary" | "warning" | "error" | "success";
type PillFill = "solid" | "subtle";
type PillSize = "sm" | "md";

export interface PillProps {
  label: string;
  variant?: PillVariant;
  fill?: PillFill;
  size?: PillSize;
  numberOfLines?: number;
  maxWidth?: number | string;
}

function getColors(colors: ThemeColors, variant: PillVariant, fill: PillFill) {
  if (variant === "default") {
    return { bg: colors.buttonSecondaryBackground, text: colors.textPrimary };
  }

  if (fill === "solid") {
    const bgMap: Record<Exclude<PillVariant, "default">, string> = {
      primary: colors.primaryFill,
      warning: colors.warningFill,
      error: colors.negativeFill,
      success: colors.positiveFill,
    };
    return { bg: bgMap[variant], text: colors.primaryText };
  }

  // subtle — all use default text color
  const map: Record<Exclude<PillVariant, "default">, { bg: string; text: string }> = {
    primary: { bg: colors.primarySubtle, text: colors.textPrimary },
    warning: { bg: colors.warningBackground, text: colors.textPrimary },
    error: { bg: colors.errorBackground, text: colors.textPrimary },
    success: { bg: colors.successBackground, text: colors.textPrimary },
  };
  return map[variant];
}

export function Pill({
  label,
  variant = "default",
  fill = "subtle",
  size = "sm",
  numberOfLines = 1,
  maxWidth,
}: PillProps) {
  const { colors, spacing, borderRadius } = useTheme();
  const { bg, text } = getColors(colors, variant, fill);

  return (
    <View
      style={{
        backgroundColor: bg,
        borderRadius: borderRadius.full,
        paddingHorizontal: spacing.sm,
        paddingVertical: size === "sm" ? spacing.xxs : spacing.xs,
        flexShrink: 1,
        alignSelf: "flex-start",
        maxWidth: maxWidth as number | undefined,
      }}
    >
      <Text variant={size === "sm" ? "caption" : "body"} color={text} numberOfLines={numberOfLines}>
        {label}
      </Text>
    </View>
  );
}
