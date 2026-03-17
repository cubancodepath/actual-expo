import { useId, useImperativeHandle, useRef } from "react";
import { TextInput } from "react-native";
import { useExpressionMode } from "./useExpressionMode";
import { useKeyboardBlur } from "./useKeyboardBlur";
import { MAX_CENTS } from "@/lib/currency";
import type { CurrencyInputRef } from "@/presentation/components/currency-input";

interface UseSharedAmountInputOptions {
  /** Current active amount in cents (derived from the active row's state) */
  activeAmount: number;
  /** Whether any row is currently being edited */
  isActive: boolean;
  /** Called when the amount changes (should update the active row's state) */
  onAmountChange: (cents: number) => void;
  /** Called when editing ends (blur) — should clear the active row ID */
  onBlur: () => void;
  /** Called to reset amount to 0 when deleteBackward in normal mode */
  onClear: () => void;
}

/**
 * Composes the shared hidden-input setup pattern used across multi-row
 * currency editing screens (cover-source, move-money, split, assign).
 *
 * Internally wires up: useId, refs, useExpressionMode, useKeyboardBlur,
 * useImperativeHandle (for CalculatorPill), handleChangeText, and currentInputValue.
 */
export function useSharedAmountInput({
  activeAmount,
  isActive,
  onAmountChange,
  onBlur,
  onClear,
}: UseSharedAmountInputOptions) {
  const accessoryID = useId();
  const sharedInputRef = useRef<TextInput>(null);
  const selfRef = useRef<CurrencyInputRef>(null);

  const expr = useExpressionMode({
    value: activeAmount,
    onChangeValue: onAmountChange,
  });

  const handleBlur = () => {
    expr.handleBlurExpression();
    onBlur();
  };

  useKeyboardBlur(isActive, handleBlur);

  useImperativeHandle(selfRef, () => ({
    focus: () => sharedInputRef.current?.focus(),
    injectOperator: (op: string) => expr.injectOperator(op, () => sharedInputRef.current?.focus()),
    evaluate: () => expr.evaluate(),
    deleteBackward: () => {
      if (expr.expressionMode) {
        expr.handleKeyPress({ nativeEvent: { key: "Backspace" } });
      } else {
        onClear();
      }
    },
  }));

  const currentInputValue = expr.expressionMode ? expr.expressionInputValue : String(activeAmount);

  function handleChangeText(text: string) {
    if (!isActive) return;
    if (expr.expressionMode) {
      expr.handleChangeTextOperand(text);
    } else {
      const digits = text.replace(/\D/g, "");
      const newCents = Math.min(parseInt(digits || "0", 10), MAX_CENTS);
      onAmountChange(newCents);
    }
  }

  return {
    // For SharedAmountInput component
    accessoryID,
    sharedInputRef,
    selfRef,
    currentInputValue,
    handleChangeText,
    handleBlur,
    // For the screen
    expr,
    focus: () => {
      setTimeout(() => sharedInputRef.current?.focus(), 50);
    },
    blur: () => sharedInputRef.current?.blur(),
  };
}
