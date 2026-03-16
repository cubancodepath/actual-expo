import type { RefObject } from "react";
import { View } from "react-native";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { BlurView } from "expo-blur";
import { useTheme } from "../../providers/ThemeProvider";
import { PillButton } from "./PillButton";
import { PillDivider } from "./PillDivider";
import type { CurrencyInputRef } from "./CurrencyInput";

const glass = isLiquidGlassAvailable();

const PILL_HEIGHT = 44;

const pillStyle = {
  flexDirection: "row" as const,
  alignItems: "center" as const,
  height: PILL_HEIGHT,
  paddingHorizontal: 12,
  borderRadius: PILL_HEIGHT / 2,
};

const OPERATORS: {
  icon: "plus" | "minus" | "multiply" | "divide";
  value: "+" | "-" | "*" | "/";
  label: string;
}[] = [
  { icon: "plus", value: "+", label: "Add" },
  { icon: "minus", value: "-", label: "Subtract" },
  { icon: "multiply", value: "*", label: "Multiply" },
  { icon: "divide", value: "/", label: "Divide" },
];

interface CalculatorPillProps {
  inputRef: RefObject<CurrencyInputRef | null>;
  isExpressionMode: boolean;
}

export function CalculatorPill({ inputRef, isExpressionMode }: CalculatorPillProps) {
  const { colors, spacing } = useTheme();

  const content = (
    <>
      {OPERATORS.map(({ icon, value, label }) => (
        <PillButton
          key={value}
          icon={icon}
          color={colors.textPrimary}
          onPress={() => inputRef.current?.injectOperator(value)}
          label={label}
        />
      ))}
      <PillDivider color={colors.textMuted} />
      <PillButton
        icon="equal"
        color={isExpressionMode ? colors.primary : colors.textMuted}
        onPress={() => inputRef.current?.evaluate()}
        label="Calculate result"
      />
      <PillDivider color={colors.textMuted} />
      <PillButton
        icon="delete.backward"
        color={colors.textMuted}
        onPress={() => inputRef.current?.deleteBackward()}
        label="Delete"
      />
    </>
  );

  const pill = glass ? (
    <GlassView style={pillStyle}>{content}</GlassView>
  ) : (
    <BlurView tint="systemChromeMaterial" intensity={100} style={pillStyle}>
      {content}
    </BlurView>
  );

  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "flex-end",
        paddingHorizontal: spacing.md,
        marginBottom: 6,
      }}
    >
      {pill}
    </View>
  );
}
