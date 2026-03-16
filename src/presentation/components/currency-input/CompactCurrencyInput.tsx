import { useImperativeHandle, useRef } from "react";
import { TextInput, View, type ViewStyle } from "react-native";
import { useTheme } from "../../providers/ThemeProvider";
import { Text } from "../atoms/Text";
import { CurrencySymbol } from "../atoms/CurrencySymbol";
import { formatCents, formatExpression } from "../../../lib/currency";
import { formatAmountParts } from "../../../lib/format";
import { useCurrencyInput } from "./useCurrencyInput";

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
  /** React 19 ref */
  ref?: React.Ref<CompactCurrencyInputRef>;
}

/**
 * Compact banking-style currency input for inline use in lists/rows.
 * Digits fill from right to left: 0.00 -> 0.01 -> 0.15 -> 1.52
 * No border/background — designed to look inline. Shows blinking cursor when focused.
 *
 * Supports inline calculator: inject operators via ref.injectOperator().
 * In expression mode, shows the expression and a live preview of the result.
 */
export function CompactCurrencyInput({
  value,
  onChangeValue,
  onFocus: onFocusProp,
  onBlur: onBlurProp,
  autoFocus = false,
  color: colorProp,
  style,
  ref,
}: CompactCurrencyInputProps) {
  const { colors } = useTheme();

  const ci = useCurrencyInput({
    value,
    onChangeValue,
    autoFocus,
    onFocus: onFocusProp,
    onBlur: onBlurProp,
  });

  // Ref for imperative blur
  const focusedRef = useRef(false);
  focusedRef.current = ci.focused;
  const handleBlurRef = useRef(ci.handleBlur);
  handleBlurRef.current = ci.handleBlur;

  useImperativeHandle(ref, () => ({
    focus: () => ci.inputRef.current?.focus(),
    blur: () => {
      ci.inputRef.current?.blur();
      // Run blur logic directly — zero-size TextInput may not fire onBlur reliably
      if (focusedRef.current) handleBlurRef.current();
    },
    injectOperator: (op: string) => ci.injectOperator(op, () => ci.inputRef.current?.focus()),
    evaluate: () => ci.evaluate(),
  }));

  const currentInputValue = ci.expressionMode
    ? ci.expressionInputValue
    : String(Math.abs(value));

  const isNeg = value < 0;
  const displayColor = colorProp ?? (value !== 0 ? colors.textPrimary : colors.textMuted);

  return (
    <View
      style={[{ flexDirection: "column", alignItems: "flex-end" }, style]}
      accessibilityLabel={`${formatCents(Math.abs(value))}`}
      accessibilityRole="adjustable"
    >
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        {!ci.expressionMode &&
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

        {ci.expressionMode && (
          <Text
            variant="body"
            style={{
              fontWeight: "600",
              fontVariant: ["tabular-nums"],
              color: colors.primary,
            }}
            numberOfLines={1}
          >
            {formatExpression(ci.fullExpression)}
          </Text>
        )}

        {ci.renderCursor(
          { width: 1.5, height: 16, marginLeft: 1, borderRadius: 1 },
          colors.primary,
        )}
      </View>

      {/* Live preview of expression result */}
      {ci.expressionMode && ci.previewCents !== null && (
        <Text
          variant="captionSm"
          color={colors.textMuted}
          style={{ fontVariant: ["tabular-nums"], marginTop: 1 }}
        >
          = {formatCents(ci.previewCents)}
        </Text>
      )}

      <TextInput
        ref={ci.inputRef}
        style={{ position: "absolute", opacity: 0, height: 0, width: 0 }}
        keyboardType="number-pad"
        autoFocus={autoFocus}
        caretHidden
        contextMenuHidden
        value={currentInputValue}
        onChangeText={ci.expressionMode ? ci.handleChangeTextOperand : ci.handleChangeTextNormal}
        onKeyPress={ci.handleKeyPress}
        onFocus={ci.handleFocus}
        onBlur={ci.handleBlur}
      />
    </View>
  );
}
