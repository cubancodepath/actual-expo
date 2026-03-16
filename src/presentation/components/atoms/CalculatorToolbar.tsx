import { View } from "react-native";
import { useTheme } from "../../providers/ThemeProvider";
import { GlassButton } from "./GlassButton";
import type { SFSymbol } from "sf-symbols-typescript";

type Operator = "+" | "-" | "*" | "/";

const OPERATORS: { icon: SFSymbol; value: Operator }[] = [
  { icon: "plus", value: "+" },
  { icon: "minus", value: "-" },
  { icon: "multiply", value: "*" },
  { icon: "divide", value: "/" },
];

interface CalculatorToolbarProps {
  /** Called when an operator button is pressed */
  onOperator: (op: Operator) => void;
  /** Called when the equals button is pressed */
  onEvaluate?: () => void;
}

/**
 * Row of round arithmetic operator buttons for inline calculator input.
 * Uses SF Symbols for a native look. Designed to sit inside a KeyboardToolbar.
 */
export function CalculatorToolbar({ onOperator, onEvaluate }: CalculatorToolbarProps) {
  const { spacing, colors } = useTheme();

  return (
    <View style={{ flexDirection: "row", gap: spacing.xs }}>
      {OPERATORS.map(({ icon, value }) => (
        <GlassButton
          key={value}
          icon={icon}
          iconSize={16}
          onPress={() => onOperator(value)}
          hitSlop={4}
        />
      ))}
      {onEvaluate && (
        <GlassButton
          icon="equal"
          iconSize={16}
          variant="tinted"
          tintColor={colors.primary}
          onPress={onEvaluate}
          hitSlop={4}
        />
      )}
    </View>
  );
}
