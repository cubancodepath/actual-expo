import { useEffect, useImperativeHandle, useRef, useState } from "react";
import { InputAccessoryView, Platform, Pressable, TextInput, View, type ViewStyle } from "react-native";
import * as Haptics from "expo-haptics";
import { useTheme, useThemedStyles } from "../../providers/ThemeProvider";
import { Text } from "../atoms/Text";
import { CurrencySymbol } from "../atoms/CurrencySymbol";
import { KeyboardToolbar } from "../molecules/KeyboardToolbar";
import { MAX_CENTS, formatCents, formatExpression } from "../../../lib/currency";
import { withOpacity } from "../../../lib/colors";
import { formatAmountParts } from "../../../lib/format";
import { useCurrencyInput } from "./useCurrencyInput";
import { CalculatorPill } from "./CalculatorPill";
import type { Theme } from "../../../theme";

function triggerHaptic() {
  try {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  } catch {
    // Native module not linked yet — requires a rebuild
  }
}

export interface CurrencyInputRef {
  focus: () => void;
  /** Inject an arithmetic operator (+, -, *, /) into the current value */
  injectOperator: (op: string) => void;
  /** Evaluate the current expression and commit the result */
  evaluate: () => void;
  /** Smart backspace: in expression mode undoes operator/operand, otherwise resets to 0 */
  deleteBackward: () => void;
}

interface CurrencyInputProps {
  /** Amount in cents (always positive) */
  value: number;
  /** Called with new amount in cents */
  onChangeValue: (cents: number) => void;
  /** 'expense' shows -, 'income' shows +. Omit for neutral color. */
  type?: "expense" | "income";
  /** Auto-focus the input on mount */
  autoFocus?: boolean;
  /** Additional style for the container */
  style?: ViewStyle;
  /** Override the amount text color */
  color?: string;
  /** Compact variant with smaller font for secondary inputs */
  compact?: boolean;
  /** React 19 ref */
  ref?: React.Ref<CurrencyInputRef>;
}

/**
 * Banking-style currency input with integrated calculator toolbar.
 * Digits fill from right to left: 0.00 -> 0.01 -> 0.15 -> 1.52
 * Backspace removes the last digit: 1.52 -> 0.15 -> 0.01 -> 0.00
 *
 * Includes a glass pill calculator toolbar that appears above the keyboard
 * automatically (iOS: native InputAccessoryView, Android: animated KeyboardToolbar).
 */
export function CurrencyInput({
  value,
  onChangeValue,
  type,
  autoFocus = false,
  style,
  color: colorOverride,
  compact = false,
  ref,
}: CurrencyInputProps) {
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const accessoryID = "currencyInputAccessory";
  const selfRef = useRef<CurrencyInputRef>(null);

  // Buffer state (CurrencyInput-specific — tracks raw digit string)
  const [buffer, setBuffer] = useState(() => String(value));
  const lastExternalValue = useRef(value);

  // Sync buffer when value changes externally (e.g. parent setState in useEffect)
  useEffect(() => {
    if (value !== lastExternalValue.current) {
      lastExternalValue.current = value;
      setBuffer(String(value));
    }
  }, [value]);

  const ci = useCurrencyInput({ value, onChangeValue, autoFocus });

  useImperativeHandle(ref, () => {
    const handle: CurrencyInputRef = {
      focus: () => ci.inputRef.current?.focus(),
      injectOperator: (op: string) => ci.injectOperator(op, () => ci.inputRef.current?.focus()),
      evaluate: () => ci.evaluate(),
      deleteBackward: () => {
        if (ci.expressionMode) {
          ci.handleKeyPress?.({ nativeEvent: { key: "Backspace" } });
        } else {
          onChangeValue(0);
          setBuffer("0");
          lastExternalValue.current = 0;
        }
      },
    };
    selfRef.current = handle;
    return handle;
  });

  // Wrap the hook's handleChangeTextNormal with buffer logic + haptic
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

  const currentInputValue = ci.expressionMode ? ci.expressionInputValue : buffer;

  const compactOverride = compact ? { fontSize: 20, lineHeight: 26 } : undefined;
  const compactCursor = compact ? { height: 18 } : undefined;
  const compactContainer = compact ? { paddingVertical: theme.spacing.sm } : undefined;

  // Color: default to textPrimary, semantic only when type is explicit
  const defaultColor = type
    ? type === "expense"
      ? theme.colors.negative
      : theme.colors.positive
    : theme.colors.textPrimary;
  const amountColor = colorOverride ?? defaultColor;
  const prefix = type === "expense" ? "-" : "";
  const previewColor = withOpacity(amountColor, 0.6);

  const typeLabel = type === "expense" ? "expense amount" : type === "income" ? "income amount" : "amount";

  return (
    <View>
      {/* InputAccessoryView mounted first and unconditionally — prevents iOS unmount bug */}
      {Platform.OS === "ios" && (
        <InputAccessoryView nativeID={accessoryID} backgroundColor="transparent">
          <CalculatorPill inputRef={selfRef} />
        </InputAccessoryView>
      )}

      <Pressable
        style={[styles.container, compactContainer, style]}
        onPress={() => ci.inputRef.current?.focus()}
        accessibilityLabel={`${prefix}${formatCents(value)}, ${typeLabel}`}
        accessibilityRole="adjustable"
        accessibilityHint="Tap to edit amount"
      >
        <View style={styles.display}>
          {!ci.expressionMode &&
            (() => {
              const parts = formatAmountParts(value, false);
              const fontSize = compact ? 20 : 32;
              return (
                <>
                  <Text style={[styles.prefix, { color: amountColor }, compactOverride]}>
                    {prefix}
                  </Text>
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
                  <Text style={[styles.amount, { color: amountColor }, compactOverride]}>
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
          {ci.expressionMode && (
            <Text
              style={[styles.amount, { color: theme.colors.primary }, compactOverride]}
              numberOfLines={1}
            >
              {formatExpression(ci.fullExpression)}
            </Text>
          )}
          {ci.renderCursor(
            { ...styles.cursor, ...(compactCursor ?? {}) },
            theme.colors.primary,
          )}
        </View>

        <TextInput
          ref={ci.inputRef}
          style={styles.hiddenInput}
          keyboardType="number-pad"
          autoFocus={autoFocus}
          caretHidden
          contextMenuHidden
          value={currentInputValue}
          onChangeText={ci.expressionMode ? ci.handleChangeTextOperand : handleChangeTextNormal}
          onKeyPress={ci.handleKeyPress}
          onFocus={() => ci.setFocused(true)}
          onBlur={ci.handleBlur}
          inputAccessoryViewID={Platform.OS === "ios" ? accessoryID : undefined}
        />
      </Pressable>

      {/* Android: animated KeyboardToolbar positioning */}
      {Platform.OS !== "ios" && (
        <KeyboardToolbar style={{ paddingHorizontal: 0 }}>
          <CalculatorPill inputRef={selfRef} />
        </KeyboardToolbar>
      )}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
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
    height: 1,
    width: 1,
    pointerEvents: "none" as const,
  },
});
