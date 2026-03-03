import { useTheme } from "../../providers/ThemeProvider";
import { Text, type TextProps } from "./Text";
import type { TypographyVariant } from "../../../theme";

export interface AmountProps extends Omit<TextProps, "children" | "variant"> {
  /** Amount in cents (integer) */
  value: number;
  /** Show +/- sign */
  showSign?: boolean;
  variant?: TypographyVariant;
  /** Override automatic green/red coloring */
  colored?: boolean;
}

function formatCurrency(cents: number, showSign: boolean): string {
  const abs = Math.abs(cents) / 100;
  const formatted = abs.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  if (showSign && cents > 0) return `+$${formatted}`;
  if (cents < 0) return `-$${formatted}`;
  return `$${formatted}`;
}

export function Amount({
  value,
  showSign = false,
  variant = "body",
  colored = true,
  style,
  ...props
}: AmountProps) {
  const { colors } = useTheme();

  let color: string | undefined;
  if (colored) {
    if (value > 0) color = colors.positive;
    else if (value < 0) color = colors.negative;
    else color = colors.textSecondary;
  }

  return (
    <Text
      variant={variant}
      color={color}
      style={[{ fontVariant: ["tabular-nums"] }, style]}
      {...props}
    >
      {formatCurrency(value, showSign)}
    </Text>
  );
}
