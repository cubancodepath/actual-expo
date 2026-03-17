import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { useTheme } from "@/presentation/providers/ThemeProvider";
import { Text } from "@/presentation/components/atoms/Text";
import { CurrencyAmountDisplay } from "./CurrencyAmountDisplay";

interface EditableAmountRowProps {
  label: string;
  amount: number;
  isActive: boolean;
  expressionMode: boolean;
  fullExpression: string;
  onPress: () => void;
  /** Content rendered BEFORE the amount display (e.g., category selector) */
  left?: ReactNode;
  /** Content rendered AFTER the amount display (e.g., balance pill, remove button) */
  children?: ReactNode;
}

/**
 * A composable row component for multi-row currency editing screens.
 * Renders a label, currency amount display with cursor, and optional
 * left/right content via composition.
 *
 * Layout: [left] [label (flex:1)] [CurrencyAmountDisplay] [children]
 */
export function EditableAmountRow({
  label,
  amount,
  isActive,
  expressionMode,
  fullExpression,
  onPress,
  left,
  children,
}: EditableAmountRowProps) {
  const { colors, spacing } = useTheme();

  const displayColor = isActive
    ? colors.primary
    : amount > 0
      ? colors.textPrimary
      : colors.textMuted;

  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingLeft: spacing.md,
        paddingRight: spacing.xs,
        paddingVertical: spacing.sm,
        minHeight: 48,
      }}
    >
      {left}

      <Text variant="body" color={colors.textPrimary} numberOfLines={1} style={{ flex: 1 }}>
        {label}
      </Text>

      <CurrencyAmountDisplay
        amount={amount}
        isActive={isActive}
        expressionMode={expressionMode}
        fullExpression={fullExpression}
        color={displayColor}
        primaryColor={colors.primary}
      />

      {children}
    </Pressable>
  );
}
