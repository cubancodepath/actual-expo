import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import {
  InputAccessoryView,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
  type ViewStyle,
} from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { EaseView } from "react-native-ease";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SymbolView } from "expo-symbols";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { BlurView } from "expo-blur";
import { useTheme, useThemedStyles } from "@/presentation/providers/ThemeProvider";
import { Text } from "@/presentation/components/atoms/Text";
import { useExpressionMode } from "@/presentation/hooks/useExpressionMode";

const glass = isLiquidGlassAvailable();
import { MAX_CENTS, formatCents, formatExpression } from "@/lib/currency";
import { withOpacity } from "@/lib/colors";
import { formatAmountParts } from "@/lib/format";
import { CurrencySymbol } from "@/presentation/components/atoms/CurrencySymbol";
import { usePreferencesStore } from "@/stores/preferencesStore";
import type { Theme } from "@/theme";

const CALC_ACCESSORY_ID = "calcToolbar";

// ---------------------------------------------------------------------------
// TestCurrencyInput — copy of CurrencyInput with inputAccessoryViewID support
// ---------------------------------------------------------------------------

function triggerHaptic() {
  try {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  } catch {
    // Native module not linked yet
  }
}

interface TestCurrencyInputRef {
  focus: () => void;
  injectOperator: (op: string) => void;
  evaluate: () => void;
  deleteBackward: () => void;
}

interface TestCurrencyInputProps {
  value: number;
  onChangeValue: (cents: number) => void;
  type?: "expense" | "income";
  autoFocus?: boolean;
  style?: ViewStyle;
  color?: string;
  inputAccessoryViewID?: string;
  onExpressionModeChange?: (active: boolean) => void;
}

const TestCurrencyInput = forwardRef<TestCurrencyInputRef, TestCurrencyInputProps>(
  function TestCurrencyInput(
    { value, onChangeValue, type, autoFocus = false, style, color: colorOverride, inputAccessoryViewID, onExpressionModeChange },
    ref,
  ) {
    const theme = useTheme();
    const styles = useThemedStyles(createInputStyles);
    const reducedMotion = useReducedMotion();
    const inputRef = useRef<TextInput>(null);
    const [buffer, setBuffer] = useState(() => String(value));
    const [focused, setFocused] = useState(autoFocus);
    const lastExternalValue = useRef(value);

    useEffect(() => {
      if (value !== lastExternalValue.current) {
        lastExternalValue.current = value;
        setBuffer(String(value));
      }
    }, [value]);

    const expr = useExpressionMode({ value, onChangeValue });

    useEffect(() => {
      onExpressionModeChange?.(expr.expressionMode);
    }, [expr.expressionMode]);

    // Refs for keyboard hide listener
    const focusedRef = useRef(false);
    focusedRef.current = focused;
    const handleBlurRef = useRef<() => void>(() => {});

    useImperativeHandle(ref, () => ({
      focus: () => inputRef.current?.focus(),
      injectOperator: (op: string) => expr.injectOperator(op, () => inputRef.current?.focus()),
      evaluate: () => expr.evaluate(),
      deleteBackward: () => {
        if (expr.expressionMode) {
          expr.handleKeyPress({ nativeEvent: { key: "Backspace" } });
        } else {
          onChangeValue(0);
          setBuffer("0");
          lastExternalValue.current = 0;
        }
      },
    }));

    // Cursor: visible when focused, blink via EaseView loop (native animation)
    const cursorVisible = focused && !reducedMotion;
    const cursorStatic = focused && reducedMotion;

    // Keyboard hide fallback — catches scroll-dismiss, tab switches
    useEffect(() => {
      const event = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
      const sub = Keyboard.addListener(event, () => {
        if (focusedRef.current) handleBlurRef.current();
      });
      return () => sub.remove();
    }, []);

    usePreferencesStore(
      (s) =>
        `${s.numberFormat}:${s.hideFraction}:${s.defaultCurrencyCode}:${s.defaultCurrencyCustomSymbol}:${s.currencySymbolPosition}:${s.currencySpaceBetweenAmountAndSymbol}`,
    );

    // Color: default to textPrimary, semantic only when type is explicit
    const defaultColor = type
      ? type === "expense" ? theme.colors.negative : theme.colors.positive
      : theme.colors.textPrimary;
    const amountColor = colorOverride ?? defaultColor;
    const prefix = type === "expense" ? "-" : "";
    // Preview color derives from amount color for contrast on colored backgrounds
    const previewColor = withOpacity(amountColor, 0.6);

    function handleChangeTextNormal(text: string) {
      const digits = text.replace(/\D/g, "");
      const newCents = Math.min(parseInt(digits || "0", 10), MAX_CENTS);
      if (newCents === 0 && value === 0 && digits.length < buffer.length) {
        triggerHaptic();
      }
      setBuffer(digits);
      lastExternalValue.current = newCents;
      onChangeValue(newCents);
    }

    function handleBlur() {
      expr.handleBlurExpression();
      setFocused(false);
    }
    handleBlurRef.current = handleBlur;

    const currentInputValue = expr.expressionMode ? expr.expressionInputValue : buffer;

    return (
      <Pressable
        style={[styles.container, style]}
        onPress={() => inputRef.current?.focus()}
        accessibilityLabel={`${prefix}${formatCents(value)}, ${type === "expense" ? "expense amount" : type === "income" ? "income amount" : "amount"}`}
        accessibilityRole="adjustable"
        accessibilityHint="Tap to edit amount"
      >
        <View style={styles.display}>
          {!expr.expressionMode &&
            (() => {
              const parts = formatAmountParts(value, false);
              const fontSize = 32;
              return (
                <>
                  <Text style={[styles.prefix, { color: amountColor }]}>{prefix}</Text>
                  {parts.svgSymbol && parts.position === "before" && (
                    <>
                      <CurrencySymbol
                        symbol={parts.symbol}
                        svgSymbol={parts.svgSymbol}
                        fontSize={fontSize}
                        color={amountColor}
                      />
                      {parts.spaceBetween && <View style={{ width: Math.round(fontSize / 3) }} />}
                    </>
                  )}
                  <Text style={[styles.amount, { color: amountColor }]}>
                    {parts.svgSymbol ? parts.number : formatCents(value)}
                  </Text>
                  {parts.svgSymbol && parts.position === "after" && (
                    <>
                      {parts.spaceBetween && <View style={{ width: Math.round(fontSize / 3) }} />}
                      <CurrencySymbol
                        symbol={parts.symbol}
                        svgSymbol={parts.svgSymbol}
                        fontSize={fontSize}
                        color={amountColor}
                      />
                    </>
                  )}
                </>
              );
            })()}
          {expr.expressionMode && (
            <Text
              style={[styles.amount, { color: theme.colors.primary }]}
              numberOfLines={1}
            >
              {formatExpression(expr.fullExpression)}
            </Text>
          )}
          {focused ? (
            reducedMotion ? (
              <View style={[styles.cursor, { backgroundColor: theme.colors.primary, opacity: 1 }]} />
            ) : (
              <EaseView
                initialAnimate={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ type: "timing", duration: 500, easing: "easeInOut", loop: "reverse" }}
                style={[styles.cursor, { backgroundColor: theme.colors.primary }]}
              />
            )
          ) : (
            <View style={[styles.cursor, { backgroundColor: theme.colors.primary, opacity: 0 }]} />
          )}
        </View>

        {expr.expressionMode && expr.previewCents !== null && (
          <Text
            variant="body"
            color={previewColor}
            style={{ fontVariant: ["tabular-nums"], marginTop: 2, textAlign: "center" }}
          >
            = {formatCents(expr.previewCents)}
          </Text>
        )}

        <TextInput
          ref={inputRef}
          style={styles.hiddenInput}
          keyboardType="number-pad"
          autoFocus={autoFocus}
          caretHidden
          contextMenuHidden
          value={currentInputValue}
          onChangeText={expr.expressionMode ? expr.handleChangeTextOperand : handleChangeTextNormal}
          onKeyPress={expr.expressionMode ? expr.handleKeyPress : undefined}
          onFocus={() => setFocused(true)}
          onBlur={handleBlur}
          inputAccessoryViewID={inputAccessoryViewID}
        />
      </Pressable>
    );
  },
);

const createInputStyles = (theme: Theme) => ({
  container: {
    alignItems: "center" as const,
    paddingVertical: theme.spacing.xl,
  },
  display: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  prefix: {
    fontSize: 32,
    lineHeight: 40,
    fontWeight: "700" as const,
    marginRight: theme.spacing.xs,
  },
  amount: {
    fontSize: 32,
    lineHeight: 40,
    fontWeight: "700" as const,
    fontVariant: ["tabular-nums"] as "tabular-nums"[],
  },
  cursor: {
    width: 2,
    height: 28,
    marginLeft: 2,
    borderRadius: 1,
  },
  hiddenInput: {
    position: "absolute" as const,
    opacity: 0,
    height: 0,
    width: 0,
  },
});

// ---------------------------------------------------------------------------
// Test Playground Screen
// ---------------------------------------------------------------------------

const OPERATORS: { icon: "plus" | "minus" | "multiply" | "divide"; value: "+" | "-" | "*" | "/" }[] = [
  { icon: "plus", value: "+" },
  { icon: "minus", value: "-" },
  { icon: "multiply", value: "*" },
  { icon: "divide", value: "/" },
];

const ICON_SIZE = 20;
const BAR_HEIGHT = 44;
const DIVIDER_HEIGHT = 20;

const pillStyle = {
  flexDirection: "row" as const,
  alignItems: "center" as const,
  height: BAR_HEIGHT,
  paddingHorizontal: 12,
  borderRadius: BAR_HEIGHT / 2,
};

function ToolbarDivider({ color }: { color: string }) {
  return (
    <View
      style={{
        width: 1,
        height: DIVIDER_HEIGHT,
        backgroundColor: color,
        opacity: 0.3,
        marginHorizontal: 4,
      }}
    />
  );
}

function ToolbarButton({
  icon,
  color,
  onPress,
}: {
  icon: Parameters<typeof SymbolView>[0]["name"];
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => ({
        paddingHorizontal: 6,
        paddingVertical: 8,
        borderRadius: 8,
        backgroundColor: pressed ? "rgba(255,255,255,0.12)" : "transparent",
      })}
      accessibilityRole="button"
    >
      <SymbolView name={icon} size={ICON_SIZE} tintColor={color} />
    </Pressable>
  );
}

function PillContent({
  currencyRef,
  isExpressionMode,
  colors,
}: {
  currencyRef: React.RefObject<TestCurrencyInputRef | null>;
  isExpressionMode: boolean;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  return (
    <>
      {/* Operators */}
      {OPERATORS.map(({ icon, value }) => (
        <ToolbarButton
          key={value}
          icon={icon}
          color={colors.textPrimary}
          onPress={() => currencyRef.current?.injectOperator(value)}
        />
      ))}
      {/* Divider + Equals (always visible, color changes when active) */}
      <ToolbarDivider color={colors.textMuted} />
      <ToolbarButton
        icon="equal"
        color={isExpressionMode ? colors.primary : colors.textMuted}
        onPress={() => currencyRef.current?.evaluate()}
      />
      {/* Divider + Delete (smart backspace) */}
      <ToolbarDivider color={colors.textMuted} />
      <ToolbarButton
        icon="delete.backward"
        color={colors.textMuted}
        onPress={() => currencyRef.current?.deleteBackward()}
      />
    </>
  );
}

export default function TestPlayground() {
  const { colors, spacing, borderRadius: br, borderWidth: bw } = useTheme();
  const insets = useSafeAreaInsets();
  const [cents, setCents] = useState(0);
  const [isExpressionMode, setIsExpressionMode] = useState(false);
  const currencyRef = useRef<TestCurrencyInputRef>(null);

  const cardStyle = {
    backgroundColor: colors.cardBackground,
    borderRadius: br.lg,
    borderWidth: bw.thin,
    borderColor: colors.cardBorder,
    overflow: "hidden" as const,
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.pageBackground }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + spacing.lg,
          paddingHorizontal: spacing.lg,
          paddingBottom: 120,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Text
          variant="headingLg"
          color={colors.textPrimary}
          style={{ marginBottom: spacing.xl }}
        >
          Test Playground
        </Text>

        {/* CurrencyInput with native InputAccessoryView */}
        <Text
          variant="captionSm"
          color={colors.textMuted}
          style={{ fontWeight: "700", letterSpacing: 0.8, marginBottom: spacing.sm }}
        >
          CURRENCYINPUT + INPUTACCESSORYVIEW
        </Text>

        <View style={cardStyle}>
          <TestCurrencyInput
            ref={currencyRef}
            value={cents}
            onChangeValue={setCents}
            type="expense"
            autoFocus={false}
            color={colors.negative}
            inputAccessoryViewID={Platform.OS === "ios" ? CALC_ACCESSORY_ID : undefined}
            onExpressionModeChange={setIsExpressionMode}
          />
        </View>

        {/* Notes */}
        <View style={{ marginTop: spacing.lg, gap: spacing.xs }}>
          <Text variant="captionSm" color={colors.textMuted}>
            Tap the amount to focus. The CalculatorToolbar appears via
            native InputAccessoryView instead of the animated KeyboardToolbar.
          </Text>
        </View>
      </ScrollView>

      {/* Native InputAccessoryView — Apple-style glass pill + dismiss button */}
      {Platform.OS === "ios" && (
        <InputAccessoryView nativeID={CALC_ACCESSORY_ID} backgroundColor="transparent">
          <View
            style={{
              flexDirection: "row",
              justifyContent: "flex-end",
              paddingHorizontal: spacing.md,
              marginBottom: 6,
            }}
          >
            {glass ? (
              <GlassView style={pillStyle}>
                <PillContent
                  currencyRef={currencyRef}
                  isExpressionMode={isExpressionMode}
                  colors={colors}
                />
              </GlassView>
            ) : (
              <BlurView tint="systemChromeMaterial" intensity={100} style={pillStyle}>
                <PillContent
                  currencyRef={currencyRef}
                  isExpressionMode={isExpressionMode}
                  colors={colors}
                />
              </BlurView>
            )}
          </View>
        </InputAccessoryView>
      )}
    </View>
  );
}
