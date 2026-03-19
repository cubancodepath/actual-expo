import { StyleSheet, View } from "react-native";
import { Text } from "@/presentation/components/atoms/Text";
import { CurrencySymbol } from "@/presentation/components/atoms/CurrencySymbol";
import { useCursorBlink } from "@/presentation/hooks/useCursorBlink";
import { useSyncedPref } from "@/presentation/hooks/useSyncedPref";
import { formatAmountParts } from "@/lib/format";
import { formatCents, formatExpression } from "@/lib/currency";

interface CurrencyAmountDisplayProps {
  amount: number;
  isActive: boolean;
  expressionMode: boolean;
  fullExpression: string;
  color: string;
  primaryColor: string;
  fontSize?: number;
}

/**
 * Renders a formatted currency amount with optional expression mode and blinking cursor.
 *
 * Used across budget rows, split rows, cover/move source rows, reconcile, and hold screens
 * to display amounts with consistent currency symbol positioning and expression evaluation.
 */
export function CurrencyAmountDisplay({
  amount,
  isActive,
  expressionMode,
  fullExpression,
  color,
  primaryColor,
  fontSize = 14,
}: CurrencyAmountDisplayProps) {
  const { renderCursor } = useCursorBlink(isActive);

  // Subscribe to format prefs for reactivity (re-render when any format pref changes)
  useSyncedPref("numberFormat");
  useSyncedPref("hideFraction");
  useSyncedPref("defaultCurrencyCode");
  useSyncedPref("defaultCurrencyCustomSymbol");
  useSyncedPref("currencySymbolPosition");
  useSyncedPref("currencySpaceBetweenAmountAndSymbol");

  const isHero = fontSize >= 32;
  const parts = isActive && expressionMode ? null : formatAmountParts(Math.abs(amount), false);
  const amountStyle = isHero ? styles.heroText : styles.compactText;
  const cursorStyle = isHero ? styles.heroCursor : styles.compactCursor;

  return (
    <View style={styles.container}>
      {isActive && expressionMode ? (
        <Text style={[amountStyle, { color: primaryColor }]} numberOfLines={1}>
          {formatExpression(fullExpression)}
        </Text>
      ) : parts ? (
        <>
          {parts.svgSymbol && parts.position === "before" && (
            <>
              <CurrencySymbol
                symbol={parts.symbol}
                svgSymbol={parts.svgSymbol}
                fontSize={fontSize}
                color={color}
              />
              {parts.spaceBetween && <View style={{ width: Math.round(fontSize / 3) }} />}
            </>
          )}
          <Text style={[amountStyle, { color }]}>
            {parts.svgSymbol ? parts.number : formatCents(Math.abs(amount))}
          </Text>
          {parts.svgSymbol && parts.position === "after" && (
            <>
              {parts.spaceBetween && <View style={{ width: Math.round(fontSize / 3) }} />}
              <CurrencySymbol
                symbol={parts.symbol}
                svgSymbol={parts.svgSymbol}
                fontSize={fontSize}
                color={color}
              />
            </>
          )}
        </>
      ) : null}
      {renderCursor(cursorStyle, primaryColor)}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
  },
  compactText: {
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  heroText: {
    fontSize: 32,
    lineHeight: 40,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  compactCursor: {
    width: 1.5,
    height: 16,
    marginLeft: 1,
    borderRadius: 1,
  },
  heroCursor: {
    width: 2,
    height: 28,
    marginLeft: 2,
    borderRadius: 1,
  },
});
