import { View } from "react-native";
import { Text } from "@/presentation/components/atoms/Text";
import { CurrencySymbol } from "@/presentation/components/atoms/CurrencySymbol";
import { useCursorBlink } from "@/presentation/hooks/useCursorBlink";
import { usePreferencesStore } from "@/stores/preferencesStore";
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

  // Subscribe to currency preferences so display re-renders on changes
  usePreferencesStore(
    (s) =>
      `${s.numberFormat}:${s.hideFraction}:${s.defaultCurrencyCode}:${s.defaultCurrencyCustomSymbol}:${s.currencySymbolPosition}:${s.currencySpaceBetweenAmountAndSymbol}`,
  );

  const isHero = fontSize >= 32;
  const cursorStyle = isHero
    ? { width: 2, height: 28, marginLeft: 2, borderRadius: 1 }
    : { width: 1.5, height: 16, marginLeft: 1, borderRadius: 1 };

  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      {isActive && expressionMode ? (
        <Text
          variant={isHero ? undefined : "body"}
          style={
            isHero
              ? {
                  fontSize: 32,
                  lineHeight: 40,
                  fontWeight: "700",
                  fontVariant: ["tabular-nums"],
                  color: primaryColor,
                }
              : { fontWeight: "600", fontVariant: ["tabular-nums"], color: primaryColor }
          }
          numberOfLines={1}
        >
          {formatExpression(fullExpression)}
        </Text>
      ) : (
        (() => {
          const parts = formatAmountParts(Math.abs(amount), false);
          return (
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
              <Text
                variant={isHero ? undefined : "body"}
                style={
                  isHero
                    ? {
                        fontSize: 32,
                        lineHeight: 40,
                        fontWeight: "700",
                        fontVariant: ["tabular-nums"],
                        color,
                      }
                    : { fontWeight: "600", fontVariant: ["tabular-nums"], color }
                }
              >
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
          );
        })()
      )}
      {renderCursor(cursorStyle, primaryColor)}
    </View>
  );
}
