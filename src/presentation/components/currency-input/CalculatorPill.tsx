import type { RefObject } from "react";
import { Pressable, View } from "react-native";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { BlurView } from "expo-blur";
import { useTheme } from "../../providers/ThemeProvider";
import { Text } from "../atoms/Text";
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
  icon: import("../atoms/iconRegistry").IconName;
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
  /** When provided, renders a "Done" pill to the right. Used in list-editing contexts. */
  onDone?: () => void;
}

function DonePill({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();

  const content = (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        height: PILL_HEIGHT,
        paddingHorizontal: 20,
        justifyContent: "center",
        alignItems: "center",
        opacity: pressed ? 0.7 : 1,
      })}
      accessibilityRole="button"
      accessibilityLabel="Done editing"
    >
      <Text variant="body" color={colors.primary} style={{ fontWeight: "600" }}>
        Done
      </Text>
    </Pressable>
  );

  if (glass) {
    return (
      <GlassView style={{ borderRadius: PILL_HEIGHT / 2, overflow: "hidden" }}>{content}</GlassView>
    );
  }
  return (
    <BlurView
      tint="systemChromeMaterial"
      intensity={100}
      style={{ borderRadius: PILL_HEIGHT / 2, overflow: "hidden" }}
    >
      {content}
    </BlurView>
  );
}

export function CalculatorPill({ inputRef, onDone }: CalculatorPillProps) {
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
        icon="deleteBackward"
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
        alignItems: "center",
        paddingHorizontal: spacing.md,
        marginBottom: 6,
        gap: spacing.sm,
      }}
    >
      {pill}
      {onDone && <DonePill onPress={onDone} />}
    </View>
  );
}
