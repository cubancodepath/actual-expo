import type { TextStyle } from "react-native";
import { useTheme } from "../../providers/ThemeProvider";
import { Text, type TextProps } from "./Text";
import { formatAmount, formatBalance, PRIVACY_MASK } from "../../../lib/format";
import { usePrivacyStore } from "../../../stores/privacyStore";
import { useSyncedPref } from "../../hooks/useSyncedPref";
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
  // Subscribe to format prefs so component re-renders when they change.
  useSyncedPref("numberFormat");
  useSyncedPref("hideFraction");
  useSyncedPref("defaultCurrencyCode");
  useSyncedPref("defaultCurrencyCustomSymbol");
  useSyncedPref("currencySymbolPosition");
  useSyncedPref("currencySpaceBetweenAmountAndSymbol");

  // Explicit color wins; otherwise auto-color when `colored` is true
  let color: string | undefined = colorProp;
  if (!colorProp && colored) {
    if (value > 0) color = colors.positive;
    else if (value < 0) color = colors.negative;
    else color = colors.textSecondary;
  }

  const textStyle: TextStyle[] = [
    { fontVariant: ["tabular-nums"], fontWeight: weight },
    style as TextStyle,
  ];

  // Privacy mode or fallback — always plain text
  if (privacyMode) {
    return (
      <Text variant={variant} color={color} style={textStyle} {...props}>
        {PRIVACY_MASK}
      </Text>
    );
  }
  if (fallback && value === 0) {
    return (
      <Text variant={variant} color={color} style={textStyle} {...props}>
        {fallback}
      </Text>
    );
  }

  const text = showSign ? formatAmount(value) : formatBalance(value);
  return (
    <Text variant={variant} color={color} style={textStyle} {...props}>
      {text}
    </Text>
  );
}
