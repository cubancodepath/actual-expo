import { StyleSheet, View, type TextStyle } from "react-native";
import { cn, useThemeColor } from "heroui-native";
import { NumberValue } from "heroui-native-pro";
import { useResolveClassNames } from "uniwind";
import { usePrivacyMode } from "@/lib/hooks/usePrivacyMode";
import { useFormat } from "@/lib/hooks/useFormat";
import { PrivacyScribble } from "@/ui/PrivacyScribble";

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
  /**
   * Honour privacy mode (redact the amount when "Hide Amounts" is on). Default
   * `true`. Set `false` in entry/input contexts where the user must see the
   * value they're typing.
   */
  mask?: boolean;
  /** Show a leading "+" on positive amounts (upstream's `financial-with-sign`). */
  showSign?: boolean;
  /** Drop the decimals regardless of `hideFraction` (upstream's `financial-no-decimals`). */
  noDecimals?: boolean;
};

/**
 * Currency display built on HeroUI's `NumberValue`, driven by the reactive
 * `useFormat` hook so it honours the synced `numberFormat` / `hideFraction`
 * prefs (grouping/decimal separators, hidden decimals) — like upstream's
 * `FinancialAmount`/`useFormat`. Changing those settings updates every amount
 * live.
 *
 * When privacy mode is active (and `mask` isn't disabled) the amount is redacted
 * with a hand-drawn scribble in the exact colour the number would have had — it
 * IS the number, just struck out. The number is rendered invisibly underneath
 * only to reserve its footprint, so the scribble (and any wrapping pill) stays
 * the same size/position as the text.
 *
 * TODO(currency): the currency symbol still comes from `NumberValue`'s Intl
 * currency mode (device/locale-driven), which is NOT upstream-faithful. Our
 * `useFormat` intentionally omits the currency machinery for now — pair Money +
 * useFormat with desktop-client/src/hooks/useFormat.ts (symbol position/space,
 * per-currency decimals) when the currency UI is introduced.
 */
export function Money({
  cents,
  currency = "USD",
  tone = "auto",
  className,
  valueStyle,
  mask = true,
  showSign = false,
  noDecimals = false,
}: MoneyProps) {
  const foreground = useThemeColor("foreground");
  const [privacyMode] = usePrivacyMode();
  const { locale, minimumFractionDigits, maximumFractionDigits } = useFormat();
  const blurred = mask && privacyMode;

  const fractionDigits = noDecimals ? 0 : minimumFractionDigits;

  const toneClass =
    tone === "plain" ? "text-foreground" : cents > 0 ? "text-positive" : "text-foreground";
  const valueClassName = cn(toneClass, className) ?? "";

  // The amount's actual resolved text colour, so the scribble inherits it
  // exactly (chip foregrounds, accent, positive, …).
  const resolvedColor = (useResolveClassNames(valueClassName).color as string) || foreground;

  const numberValue = (
    <NumberValue
      value={cents / 100}
      numberStyle="currency"
      currency={currency}
      locale={locale}
      signDisplay={showSign ? "exceptZero" : "auto"}
      minimumFractionDigits={fractionDigits}
      maximumFractionDigits={noDecimals ? 0 : maximumFractionDigits}
      classNames={{ value: valueClassName }}
      styles={{ value: blurred ? { ...valueStyle, opacity: 0 } : valueStyle }}
    />
  );

  if (!blurred) return numberValue;

  // Redaction: the invisible number reserves the exact text footprint so the
  // wrapping pill/chip stays text-sized, and the scribble fills that footprint
  // (uniform scale via `slice`, so it never looks stretched or cramped) —
  // behaving like the text it replaces.
  return (
    <View className="relative justify-center">
      {numberValue}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <PrivacyScribble color={resolvedColor} />
      </View>
    </View>
  );
}
