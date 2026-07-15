import type { TextStyle } from "react-native";
import { cn } from "heroui-native";
import { NumberValue } from "heroui-native-pro";

type MoneyProps = {
  /** Amount in cents (our storage convention). */
  cents: number;
  /** ISO currency code. */
  currency?: string;
  /**
   * Colouring:
   * - `"auto"` (default): positive amounts are green, otherwise normal text.
   * - `"plain"`: always normal text colour (e.g. a budgeted/assigned amount).
   */
  tone?: "auto" | "plain";
  /** Extra classes merged onto the value text. */
  className?: string;
  /** Inline style for the value text (e.g. a dynamic hero font size). */
  valueStyle?: TextStyle;
};

/**
 * Currency display built on HeroUI's `NumberValue` (locale-aware Intl formatting).
 */
export function Money({
  cents,
  currency = "USD",
  tone = "auto",
  className,
  valueStyle,
}: MoneyProps) {
  const toneClass =
    tone === "plain" ? "text-foreground" : cents > 0 ? "text-positive" : "text-foreground";
  return (
    <NumberValue
      value={cents / 100}
      numberStyle="currency"
      currency={currency}
      minimumFractionDigits={2}
      maximumFractionDigits={2}
      classNames={{ value: cn(toneClass, className) }}
      styles={valueStyle ? { value: valueStyle } : undefined}
    />
  );
}
