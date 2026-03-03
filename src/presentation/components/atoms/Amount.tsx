import { useTheme } from "../../providers/ThemeProvider";
import { Text, type TextProps } from "./Text";
import { formatAmount, formatBalance } from "../../../lib/format";
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
      {showSign ? formatAmount(value) : formatBalance(value)}
    </Text>
  );
}
