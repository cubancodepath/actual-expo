import { StyleSheet, View } from "react-native";
import { Text } from "@/presentation/components/atoms/Text";
import { useCursorBlink } from "@/presentation/hooks/useCursorBlink";
import { useSyncedPref } from "@/presentation/hooks/useSyncedPref";
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
  fontSize,
}: CurrencyAmountDisplayProps) {
  const { renderCursor } = useCursorBlink(isActive);

  // Subscribe to format prefs for reactivity (re-render when any format pref changes)
  useSyncedPref("numberFormat");
  useSyncedPref("hideFraction");
  useSyncedPref("defaultCurrencyCode");
  useSyncedPref("defaultCurrencyCustomSymbol");
  useSyncedPref("currencySymbolPosition");
  useSyncedPref("currencySpaceBetweenAmountAndSymbol");

  const isHero = (fontSize ?? 14) >= 32;
  const amountStyle = isHero ? styles.heroText : styles.compactText;
  const cursorStyle = isHero ? styles.heroCursor : styles.compactCursor;

  return (
    <View style={styles.container}>
      {isActive && expressionMode ? (
        <Text style={[amountStyle, { color: primaryColor }]} numberOfLines={1}>
          {formatExpression(fullExpression)}
        </Text>
      ) : (
        <Text style={[amountStyle, { color }]}>{formatCents(Math.abs(amount))}</Text>
      )}
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
