import { StyleSheet, View, type TextStyle } from "react-native";
import { cn, useThemeColor } from "heroui-native";
import { NumberValue } from "heroui-native-pro";
import { useResolveClassNames } from "uniwind";
import { usePrivacyMode } from "@/lib/hooks/usePrivacyMode";
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
};

/**
 * Currency display built on HeroUI's `NumberValue` (locale-aware Intl formatting).
 *
 * When privacy mode is active (and `mask` isn't disabled) the amount is redacted
 * with a hand-drawn scribble in the exact colour the number would have had — it
 * IS the number, just struck out. The number is rendered invisibly underneath
 * only to reserve its footprint, so the scribble (and any wrapping pill) stays
 * the same size/position as the text.
 */
export function Money({
  cents,
  currency = "USD",
  tone = "auto",
  className,
  valueStyle,
  mask = true,
}: MoneyProps) {
  const foreground = useThemeColor("foreground");
  const [privacyMode] = usePrivacyMode();
  const blurred = mask && privacyMode;

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
      minimumFractionDigits={2}
      maximumFractionDigits={2}
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
