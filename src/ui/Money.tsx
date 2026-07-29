import { StyleSheet, View, type TextStyle } from "react-native";
import { useTranslation } from "react-i18next";
import { cn, useThemeColor } from "heroui-native";
import { NumberValue } from "heroui-native-pro";
import { useResolveClassNames } from "uniwind";
import { usePrivacyMode } from "@/lib/hooks/usePrivacyMode";
import { useFormat } from "@/lib/hooks/useFormat";
import { PrivacyScribble } from "@/ui/PrivacyScribble";
import { moneyText } from "@/ui/moneyText";

type MoneyProps = {
  /** Amount in cents (our storage convention). */
  cents: number;
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

// Wrap an RTL symbol in LTR embedding marks so it renders on the correct side,
// matching upstream's `applyCurrencyStyling`.
const ltr = (s: string) => (s ? `‪${s}‬` : "");

/**
 * Currency display built on HeroUI's `NumberValue`, driven by the reactive
 * `useFormat` hook so it honours the synced number + currency prefs: grouping/
 * decimal separators, hidden decimals, per-currency decimals, and the currency
 * symbol at the configured position/space (like upstream's `useFormat` +
 * `applyCurrencyStyling`). With no currency set the symbol is empty → just the
 * number. Changing any of those settings updates every amount live.
 *
 * When privacy mode is active (and `mask` isn't disabled) the amount is redacted
 * with a hand-drawn scribble in the exact colour the number would have had — and
 * the number leaves the accessibility tree with it, so "Hide Amounts" hides the
 * figure from VoiceOver/TalkBack too, not just from the screen.
 *
 * Outside privacy mode the amount is announced as one string. `NumberValue`
 * renders sign, symbol and digits as separate `Text` nodes, which a screen
 * reader would otherwise read as three unrelated fragments.
 */
export function Money({
  cents,
  tone = "auto",
  className,
  valueStyle,
  mask = true,
  showSign = false,
  noDecimals = false,
}: MoneyProps) {
  const foreground = useThemeColor("foreground");
  const [privacyMode] = usePrivacyMode();
  const { t } = useTranslation("common");
  const format = useFormat();
  const { locale, minimumFractionDigits, symbol, symbolPosition, spaceBetween } = format;
  const blurred = mask && privacyMode;

  const fractionDigits = noDecimals ? 0 : minimumFractionDigits;

  const toneClass =
    tone === "plain" ? "text-foreground" : cents > 0 ? "text-positive" : "text-foreground";
  const valueClassName = cn(toneClass, className) ?? "";

  // The amount's resolved text colour, so the scribble inherits it exactly.
  const resolvedColor = (useResolveClassNames(valueClassName).color as string) || foreground;

  // Sign lives outside the symbol (upstream order: "-€100" / "-100 €"). The
  // number itself is rendered unsigned.
  const sign = cents < 0 ? "-" : showSign && cents > 0 ? "+" : "";
  const gap = spaceBetween ? " " : "";
  const before = symbolPosition !== "after";
  const prefixText = `${sign}${before && symbol ? `${ltr(symbol)}${gap}` : ""}`;
  const suffixText = !before && symbol ? `${gap}${ltr(symbol)}` : "";

  const numberValue = (
    <NumberValue
      // `NumberValue`'s root is a View and forwards ViewProps, so the amount can
      // be announced as one element without a wrapper that would change layout.
      accessible
      accessibilityLabel={moneyText(cents, format, { showSign, noDecimals })}
      value={Math.abs(cents) / 100}
      numberStyle="decimal"
      locale={locale}
      signDisplay="never"
      minimumFractionDigits={fractionDigits}
      maximumFractionDigits={fractionDigits}
      classNames={{ value: valueClassName }}
      styles={{ value: valueStyle }}
    >
      {prefixText ? (
        <NumberValue.Prefix className={valueClassName} style={valueStyle}>
          {prefixText}
        </NumberValue.Prefix>
      ) : null}
      <NumberValue.Value />
      {suffixText ? (
        <NumberValue.Suffix className={valueClassName} style={valueStyle}>
          {suffixText}
        </NumberValue.Suffix>
      ) : null}
    </NumberValue>
  );

  if (!blurred) return numberValue;

  // Redaction: the invisible amount reserves its exact footprint (so wrapping
  // pills/chips stay text-sized) and the scribble fills it.
  //
  // `opacity: 0` hides the number from the eye but NOT from the accessibility
  // tree — without the two flags below, privacy mode would blur every amount on
  // screen while VoiceOver read them out loud, which is the one place the
  // feature is meant to protect. The flags are platform-split by design:
  // `accessibilityElementsHidden` is the iOS lever, `importantForAccessibility`
  // the Android one, and both are needed.
  return (
    <View
      className="relative justify-center"
      accessible
      accessibilityLabel={t("a11y.amountHidden")}
    >
      <View
        style={{ opacity: 0 }}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {numberValue}
      </View>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <PrivacyScribble color={resolvedColor} />
      </View>
    </View>
  );
}
