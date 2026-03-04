import type { TextStyle } from "react-native";
import { useTheme } from "../../providers/ThemeProvider";
import { Text, type TextProps } from "./Text";
import { formatAmount, formatBalance, PRIVACY_MASK } from "../../../lib/format";
import { usePrivacyStore } from "../../../stores/privacyStore";
import type { TypographyVariant } from "../../../theme";

export interface AmountProps extends Omit<TextProps, "children" | "variant"> {
  /** Amount in cents (integer) */
  value: number;
  /** Show +/- sign */
  showSign?: boolean;
  variant?: TypographyVariant;
  /** Auto-color based on sign. Ignored when `color` prop is set. */
  colored?: boolean;
  /** Explicit color — overrides auto-coloring when provided. */
  color?: string;
  /** Font weight shorthand (avoids style={{ fontWeight }}) */
  weight?: TextStyle["fontWeight"];
  /** Text shown when value === 0 (e.g. "—"). Bypassed in privacy mode. */
  fallback?: string;
}

export function Amount({
  value,
  showSign = false,
  variant = "body",
  colored = true,
  color: colorProp,
  weight,
  fallback,
  style,
  ...props
}: AmountProps) {
  const { colors } = useTheme();
  const privacyMode = usePrivacyStore((s) => s.privacyMode);

  // Explicit color wins; otherwise auto-color when `colored` is true
  let color: string | undefined = colorProp;
  if (!colorProp && colored) {
    if (value > 0) color = colors.positive;
    else if (value < 0) color = colors.negative;
    else color = colors.textSecondary;
  }

  let text: string;
  if (privacyMode) {
    text = PRIVACY_MASK;
  } else if (fallback && value === 0) {
    text = fallback;
  } else {
    text = showSign ? formatAmount(value) : formatBalance(value);
  }

  return (
    <Text
      variant={variant}
      color={color}
      style={[{ fontVariant: ["tabular-nums"], fontWeight: weight }, style]}
      {...props}
    >
      {text}
    </Text>
  );
}
