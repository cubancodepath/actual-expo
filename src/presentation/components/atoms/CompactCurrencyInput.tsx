import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Keyboard, Platform, TextInput, View, type ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  cancelAnimation,
} from "react-native-reanimated";
import { useTheme } from "../../providers/ThemeProvider";
import { Text } from "./Text";
import { CurrencySymbol } from "./CurrencySymbol";
import { useExpressionMode } from "../../hooks/useExpressionMode";
import { MAX_CENTS, formatCents, formatExpression } from "../../../lib/currency";
import { formatAmountParts } from "../../../lib/format";
import { usePreferencesStore } from "../../../stores/preferencesStore";

export interface CompactCurrencyInputRef {
  focus: () => void;
  /** Blur the input, committing any pending expression */
  blur: () => void;
  /** Inject an arithmetic operator (+, -, *, /) into the current value */
  injectOperator: (op: string) => void;
  /** Evaluate the current expression and commit the result */
  evaluate: () => void;
}

interface CompactCurrencyInputProps {
  /** Amount in cents */
  value: number;
  /** Called with new amount in cents on every keystroke */
  onChangeValue: (cents: number) => void;
  /** Called when input gains focus */
  onFocus?: () => void;
  /** Called when input loses focus */
  onBlur?: () => void;
  /** Auto-focus on mount */
  autoFocus?: boolean;
  /** Override the value text color */
  color?: string;
  /** Additional container style */
  style?: ViewStyle;
}

/**
 * Compact banking-style currency input for inline use in lists/rows.
 * Digits fill from right to left: 0.00 → 0.01 → 0.15 → 1.52
 * No border/background — designed to look inline. Shows blinking cursor when focused.
 *
 * Supports inline calculator: inject operators via ref.injectOperator().
 * In expression mode, shows the expression and a live preview of the result.
 */
export const CompactCurrencyInput = forwardRef<CompactCurrencyInputRef, CompactCurrencyInputProps>(
  function CompactCurrencyInput(
    {
      value,
      onChangeValue,
      onFocus: onFocusProp,
      onBlur: onBlurProp,
      autoFocus = false,
      color: colorProp,
      style,
    },
    ref,
  ) {
    const { colors } = useTheme();
    const inputRef = useRef<TextInput>(null);
    const [focused, setFocused] = useState(autoFocus);

    // Subscribe to format prefs for reactivity (formatCents reads module-level config)
    usePreferencesStore(
      (s) =>
        `${s.numberFormat}:${s.hideFraction}:${s.defaultCurrencyCode}:${s.defaultCurrencyCustomSymbol}:${s.currencySymbolPosition}:${s.currencySpaceBetweenAmountAndSymbol}`,
    );

    const expr = useExpressionMode({ value, onChangeValue });

    const cursorOpacity = useSharedValue(autoFocus ? 1 : 0);

    useEffect(() => {
      if (focused) {
        cursorOpacity.value = withRepeat(
          withSequence(
            withTiming(1, { duration: 0 }),
            withTiming(1, { duration: 500 }),
            withTiming(0, { duration: 100 }),
            withTiming(0, { duration: 400 }),
          ),
          -1,
        );
      } else {
        cancelAnimation(cursorOpacity);
        cursorOpacity.value = 0;
      }
    }, [focused]);

    const cursorStyle = useAnimatedStyle(() => ({
      opacity: cursorOpacity.value,
    }));

    // ── Normal mode: banking-style digit handling ──
    function handleChangeTextNormal(text: string) {
      const digits = text.replace(/\D/g, "");
      const newCents = Math.min(parseInt(digits || "0", 10), MAX_CENTS);
      onChangeValue(newCents);
    }

    // ── Blur handler: finalize expression ──
    function handleBlur() {
      expr.handleBlurExpression();
      setFocused(false);
      onBlurProp?.();
    }

    // Refs to avoid stale closures in useImperativeHandle and keyboard listener
    const focusedRef = useRef(false);
    focusedRef.current = focused;
    const handleBlurRef = useRef(handleBlur);
    handleBlurRef.current = handleBlur;

    useImperativeHandle(ref, () => ({
      focus: () => inputRef.current?.focus(),
      blur: () => {
        inputRef.current?.blur();
        // Run blur logic directly — zero-size TextInput may not fire onBlur reliably
        if (focusedRef.current) handleBlurRef.current();
      },
      injectOperator: (op: string) => expr.injectOperator(op, () => inputRef.current?.focus()),
      evaluate: () => expr.evaluate(),
    }));

    // Fallback: when the keyboard hides, force blur if still focused.
    // Catches scroll-dismiss, tab switches, and Keyboard.dismiss()
    // even when the zero-size TextInput doesn't fire onBlur reliably.
    useEffect(() => {
      const event = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
      const sub = Keyboard.addListener(event, () => {
        if (focusedRef.current) {
          handleBlurRef.current();
        }
      });
      return () => sub.remove();
    }, []);

    const currentInputValue = expr.expressionMode
      ? expr.expressionInputValue
      : String(Math.abs(value));

    const isNeg = value < 0;
    const displayColor = colorProp ?? (value !== 0 ? colors.textPrimary : colors.textMuted);

    return (
      <View style={[{ flexDirection: "column", alignItems: "flex-end" }, style]}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          {!expr.expressionMode &&
            (() => {
              const parts = formatAmountParts(Math.abs(value), false);
              const fontSize = 14; // body variant
              return (
                <>
                  {isNeg && (
                    <Text variant="body" color={displayColor} style={{ marginRight: 1 }}>
                      -
                    </Text>
                  )}
                  {parts.svgSymbol && parts.position === "before" && (
                    <>
                      <CurrencySymbol
                        symbol={parts.symbol}
                        svgSymbol={parts.svgSymbol}
                        fontSize={fontSize}
                        color={displayColor}
                      />
                      {parts.spaceBetween && <View style={{ width: Math.round(fontSize / 3) }} />}
                    </>
                  )}
                  <Text
                    variant="body"
                    style={{
                      fontWeight: "600",
                      fontVariant: ["tabular-nums"],
                      color: displayColor,
                    }}
                  >
                    {parts.svgSymbol ? parts.number : formatCents(Math.abs(value))}
                  </Text>
                  {parts.svgSymbol && parts.position === "after" && (
                    <>
                      {parts.spaceBetween && <View style={{ width: Math.round(fontSize / 3) }} />}
                      <CurrencySymbol
                        symbol={parts.symbol}
                        svgSymbol={parts.svgSymbol}
                        fontSize={fontSize}
                        color={displayColor}
                      />
                    </>
                  )}
                </>
              );
            })()}

          {expr.expressionMode && (
            <Text
              variant="body"
              style={{
                fontWeight: "600",
                fontVariant: ["tabular-nums"],
                color: colors.primary,
              }}
              numberOfLines={1}
            >
              {formatExpression(expr.fullExpression)}
            </Text>
          )}

          <Animated.View
            style={[
              {
                width: 1.5,
                height: 16,
                marginLeft: 1,
                borderRadius: 1,
                backgroundColor: colors.primary,
              },
              cursorStyle,
            ]}
          />
        </View>

        {/* Live preview of expression result */}
        {expr.expressionMode && expr.previewCents !== null && (
          <Text
            variant="captionSm"
            color={colors.textMuted}
            style={{ fontVariant: ["tabular-nums"], marginTop: 1 }}
          >
            = {formatCents(expr.previewCents)}
          </Text>
        )}

        <TextInput
          ref={inputRef}
          style={{ position: "absolute", opacity: 0, height: 0, width: 0 }}
          keyboardType="number-pad"
          autoFocus={autoFocus}
          caretHidden
          contextMenuHidden
          value={currentInputValue}
          onChangeText={expr.expressionMode ? expr.handleChangeTextOperand : handleChangeTextNormal}
          onKeyPress={expr.expressionMode ? expr.handleKeyPress : undefined}
          onFocus={() => {
            setFocused(true);
            onFocusProp?.();
          }}
          onBlur={handleBlur}
        />
      </View>
    );
  },
);
