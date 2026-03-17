import { useImperativeHandle, useRef } from "react";
import { Platform, TextInput, View, type ViewStyle } from "react-native";
import { useTheme } from "../../providers/ThemeProvider";
import { Text } from "../atoms/Text";
import { CurrencySymbol } from "../atoms/CurrencySymbol";
import { formatCents, formatExpression } from "../../../lib/currency";
import { formatAmountParts } from "../../../lib/format";
import { useCurrencyInput } from "./useCurrencyInput";

/** Shared nativeID for all CompactCurrencyInput instances */
export const COMPACT_ACCESSORY_ID = "compactCurrencyInputAccessory";

/**
 * Module-level ref pointing to the currently focused CompactCurrencyInput.
 * Updated on focus, cleared on blur. Read by CompactCalculatorAccessory.
 */
export const activeCompactRef: { current: CompactCurrencyInputRef | null } = { current: null };
export const activeExpressionMode: { current: boolean } = { current: false };

export interface CompactCurrencyInputRef {
  focus: () => void;
  blur: () => void;
  injectOperator: (op: string) => void;
  evaluate: () => void;
  deleteBackward: () => void;
}

interface CompactCurrencyInputProps {
  value: number;
  onChangeValue: (cents: number) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  autoFocus?: boolean;
  color?: string;
  style?: ViewStyle;
  ref?: React.Ref<CompactCurrencyInputRef>;
}

/**
 * Compact banking-style currency input for inline use in lists/rows.
 *
 * IMPORTANT: When using multiple CompactCurrencyInput instances on a screen,
 * mount a single <CompactCalculatorAccessory /> at the screen level to provide
 * the shared calculator toolbar.
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
    onFocus: () => {
      // Register this instance as the active input
      activeCompactRef.current = selfRef.current;
      activeExpressionMode.current = ci.expressionMode;
      onFocusProp?.();
    },
    onBlur: () => {
      activeCompactRef.current = null;
      activeExpressionMode.current = false;
      onBlurProp?.();
    },
  });

  const selfRef = useRef<CompactCurrencyInputRef>(null);

  const focusedRef = useRef(false);
  focusedRef.current = ci.focused;
  const handleBlurRef = useRef(ci.handleBlur);
  handleBlurRef.current = ci.handleBlur;

  // Keep expression mode ref in sync
  activeExpressionMode.current = ci.expressionMode;

  useImperativeHandle(ref, () => {
    const handle: CompactCurrencyInputRef = {
      focus: () => ci.inputRef.current?.focus(),
      blur: () => {
        ci.inputRef.current?.blur();
        if (focusedRef.current) handleBlurRef.current();
      },
      injectOperator: (op: string) => ci.injectOperator(op, () => ci.inputRef.current?.focus()),
      evaluate: () => ci.evaluate(),
      deleteBackward: () => {
        if (ci.expressionMode) {
          ci.handleKeyPress?.({ nativeEvent: { key: "Backspace" } });
        } else {
          onChangeValue(0);
        }
      },
    };
    selfRef.current = handle;
    return handle;
  });

  const currentInputValue = ci.expressionMode ? ci.expressionInputValue : String(Math.abs(value));

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
            const fontSize = 14;
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
        style={{ position: "absolute", opacity: 0, height: 1, width: 1, pointerEvents: "none" }}
        keyboardType="number-pad"
        autoFocus={autoFocus}
        caretHidden
        contextMenuHidden
        value={currentInputValue}
        onChangeText={ci.expressionMode ? ci.handleChangeTextOperand : ci.handleChangeTextNormal}
        onKeyPress={ci.handleKeyPress}
        onFocus={ci.handleFocus}
        onBlur={ci.handleBlur}
        inputAccessoryViewID={Platform.OS === "ios" ? COMPACT_ACCESSORY_ID : undefined}
      />
    </View>
  );
}
