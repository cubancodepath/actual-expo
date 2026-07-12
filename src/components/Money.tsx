import { cn } from "heroui-native";
import { NumberValue } from "heroui-native-pro";

type MoneyProps = {
  /** Amount in cents (our storage convention). */
  cents: number;
  /** ISO currency code. */
  currency?: string;
  /** Extra classes merged onto the value text. */
  className?: string;
};

/**
 * Currency display built on HeroUI's `NumberValue` (locale-aware Intl formatting).
 * Only positive amounts are coloured (green); negative and zero use the normal
 * text colour.
 */
export function Money({ cents, currency = "USD", className }: MoneyProps) {
  return (
    <NumberValue
      value={cents / 100}
      numberStyle="currency"
      currency={currency}
      minimumFractionDigits={2}
      maximumFractionDigits={2}
      classNames={{
        value: cn(cents > 0 ? "text-positive" : "text-foreground", className),
      }}
    />
  );
}
