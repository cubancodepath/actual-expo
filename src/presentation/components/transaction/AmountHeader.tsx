import { memo, type ReactNode } from "react";
import { Pressable, View, type ViewStyle } from "react-native";
import { useSyncedPref } from "@/presentation/hooks/useSyncedPref";
import { formatCents, formatExpression } from "@/lib/currency";
import { Text } from "../atoms/Text";
import { TypeToggle, type TransactionType } from "./TypeToggle";
import type { Theme } from "@/theme";

interface AmountHeaderProps {
  type: TransactionType;
  cents: number;
  headerBg: string;
  headerText: string;
  expressionMode: boolean;
  fullExpression: string;
  amountFocused: boolean;
  renderCursor: (style: ViewStyle, color: string) => ReactNode;
  onFocusAmount: () => void;
  onChangeType: (t: TransactionType) => void;
  spacing: Theme["spacing"];
  primaryColor: string;
  children?: ReactNode;
}

export const AmountHeader = memo(function AmountHeader({
  type,
  cents,
  headerBg,
  headerText,
  expressionMode,
  fullExpression,
  amountFocused,
  renderCursor,
  onFocusAmount,
  onChangeType,
  spacing,
  primaryColor,
  children,
}: AmountHeaderProps) {
  // Subscribe to format prefs for reactivity (re-render when any format pref changes)
  useSyncedPref("numberFormat");
  useSyncedPref("hideFraction");
  useSyncedPref("defaultCurrencyCode");
  useSyncedPref("defaultCurrencyCustomSymbol");
  useSyncedPref("currencySymbolPosition");
  useSyncedPref("currencySpaceBetweenAmountAndSymbol");

  const isExpense = type === "expense";

  return (
    <View
      style={{
        backgroundColor: headerBg,
        paddingTop: 56,
        paddingBottom: spacing.xxxl,
        paddingHorizontal: spacing.lg,
        borderBottomLeftRadius: 12,
        borderBottomRightRadius: 12,
        alignItems: "center",
        gap: spacing.md,
      }}
    >
      <View style={{ alignSelf: "stretch", marginTop: spacing.lg }}>
        <TypeToggle type={type} onChangeType={onChangeType} />
      </View>

      <Pressable
        onPress={onFocusAmount}
        style={{ paddingVertical: spacing.sm, alignSelf: "stretch", alignItems: "center" }}
        accessibilityLabel={`${isExpense ? "-" : ""}${formatCents(cents)}, ${isExpense ? "expense" : "income"} amount`}
        accessibilityRole="adjustable"
        accessibilityHint="Tap to edit amount"
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center" }}>
          {!expressionMode && (
            <>
              <Text
                style={{
                  fontSize: 32,
                  lineHeight: 40,
                  fontWeight: "700",
                  marginRight: spacing.xs,
                  color: headerText,
                }}
              >
                {isExpense ? "-" : ""}
              </Text>
              <Text
                style={{
                  fontSize: 32,
                  lineHeight: 40,
                  fontWeight: "700",
                  fontVariant: ["tabular-nums"],
                  color: headerText,
                }}
              >
                {formatCents(cents)}
              </Text>
            </>
          )}
          {expressionMode && (
            <Text
              style={{
                fontSize: 32,
                lineHeight: 40,
                fontWeight: "700",
                fontVariant: ["tabular-nums"],
                color: primaryColor,
              }}
              numberOfLines={1}
            >
              {formatExpression(fullExpression)}
            </Text>
          )}
          {renderCursor({ width: 2, height: 28, marginLeft: 2, borderRadius: 1 }, primaryColor)}
        </View>
      </Pressable>
      {children}
    </View>
  );
});
