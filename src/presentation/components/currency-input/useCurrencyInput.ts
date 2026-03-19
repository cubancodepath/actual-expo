import { useState, useRef, type ReactNode } from "react";
import { TextInput, type ViewStyle } from "react-native";
import { useExpressionMode } from "../../hooks/useExpressionMode";
import { useCursorBlink } from "../../hooks/useCursorBlink";
import { useKeyboardBlur } from "../../hooks/useKeyboardBlur";
import { useSyncedPref } from "../../hooks/useSyncedPref";
import { MAX_CENTS } from "../../../lib/currency";

interface UseCurrencyInputOptions {
  value: number;
  onChangeValue: (cents: number) => void;
  autoFocus?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
}

/**
 * Shared hook for currency input logic.
 *
 * Composes useExpressionMode, useCursorBlink, and useKeyboardBlur.
 * Provides banking-style digit handling, focus/blur state, and
 * expression-mode helpers.
 *
 * NOTE: Does NOT manage buffer state (CurrencyInput-specific) or
 * haptic feedback (CurrencyInput-specific). The handleChangeTextNormal
 * here is the simple version used by CompactCurrencyInput. CurrencyInput
 * wraps it with its own buffer logic.
 */
export function useCurrencyInput({
  value,
  onChangeValue,
  autoFocus = false,
  onFocus: onFocusProp,
  onBlur: onBlurProp,
}: UseCurrencyInputOptions) {
  const [focused, setFocused] = useState(autoFocus);
  const inputRef = useRef<TextInput>(null);

  // Subscribe to format prefs for reactivity (formatCents reads module-level config)
  useSyncedPref("numberFormat");
  useSyncedPref("hideFraction");
  useSyncedPref("defaultCurrencyCode");
  useSyncedPref("defaultCurrencyCustomSymbol");
  useSyncedPref("currencySymbolPosition");
  useSyncedPref("currencySpaceBetweenAmountAndSymbol");

  const expr = useExpressionMode({ value, onChangeValue });
  const { renderCursor } = useCursorBlink(focused);

  // ── Normal mode: banking-style digit handling (simple version) ──
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

  // ── Focus handler ──
  function handleFocus() {
    setFocused(true);
    onFocusProp?.();
  }

  useKeyboardBlur(focused, handleBlur);

  return {
    focused,
    setFocused,
    expressionMode: expr.expressionMode,
    fullExpression: expr.fullExpression,
    previewCents: expr.previewCents,
    expressionInputValue: expr.expressionInputValue,
    inputRef,
    handleChangeTextNormal,
    handleChangeTextOperand: expr.handleChangeTextOperand,
    handleKeyPress: expr.expressionMode ? expr.handleKeyPress : undefined,
    handleBlur,
    handleFocus,
    renderCursor: renderCursor as (style: ViewStyle, color: string) => ReactNode,
    injectOperator: expr.injectOperator,
    evaluate: expr.evaluate,
    handleBlurExpression: expr.handleBlurExpression,
  };
}
