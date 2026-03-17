import { useImperativeHandle, useRef, useState } from "react";
import { TextInput } from "react-native";
import { usePreferencesStore } from "@/stores/preferencesStore";
import { MAX_CENTS } from "@/lib/currency";
import { useExpressionMode } from "@/presentation/hooks/useExpressionMode";
import { useCursorBlink } from "@/presentation/hooks/useCursorBlink";
import { useKeyboardBlur } from "@/presentation/hooks/useKeyboardBlur";
import type { CurrencyInputRef } from "@/presentation/components/currency-input";

export const AMOUNT_ACCESSORY_ID = "txnAmountCalc";

export function useAmountInput(initialCents = 0) {
  const [cents, setCents] = useState(initialCents);
  const [amountFocused, setAmountFocused] = useState(false);
  const [buffer, setBuffer] = useState(() => String(initialCents));
  const sharedInputRef = useRef<TextInput>(null);
  const selfRef = useRef<CurrencyInputRef>(null);

  // Subscribe to format prefs for reactivity
  usePreferencesStore(
    (s) =>
      `${s.numberFormat}:${s.hideFraction}:${s.defaultCurrencyCode}:${s.defaultCurrencyCustomSymbol}:${s.currencySymbolPosition}:${s.currencySpaceBetweenAmountAndSymbol}`,
  );

  // Expression mode
  const expr = useExpressionMode({
    value: cents,
    onChangeValue: (v) => {
      setCents(v);
    },
  });

  // Sync buffer when cents changes externally (e.g. edit loading)
  const lastExternalCents = useRef(cents);
  if (cents !== lastExternalCents.current) {
    lastExternalCents.current = cents;
    setBuffer(String(cents));
  }

  // Imperative ref for calculator pill
  useImperativeHandle(selfRef, () => ({
    focus: () => sharedInputRef.current?.focus(),
    injectOperator: (op) => expr.injectOperator(op, () => sharedInputRef.current?.focus()),
    evaluate: () => expr.evaluate(),
    deleteBackward: () => {
      if (expr.expressionMode) {
        expr.handleKeyPress?.({ nativeEvent: { key: "Backspace" } });
      } else {
        setCents(0);
        setBuffer("0");
      }
    },
  }));

  function handleAmountBlur() {
    expr.handleBlurExpression();
    setAmountFocused(false);
  }

  useKeyboardBlur(amountFocused, handleAmountBlur);

  const currentAmountInputValue = expr.expressionMode ? expr.expressionInputValue : buffer;

  function handleAmountChangeText(text: string) {
    if (expr.expressionMode) {
      expr.handleChangeTextOperand(text);
    } else {
      const digits = text.replace(/\D/g, "");
      const newCents = Math.min(parseInt(digits || "0", 10), MAX_CENTS);
      setBuffer(digits);
      setCents(newCents);
    }
  }

  // Cursor blink for display-only amount
  const { renderCursor } = useCursorBlink(amountFocused);

  return {
    cents,
    setCents,
    amountFocused,
    setAmountFocused,
    buffer,
    expr,
    renderCursor,
    sharedInputRef,
    selfRef,
    currentAmountInputValue,
    handleAmountChangeText,
    handleAmountBlur,
    AMOUNT_ACCESSORY_ID,
  };
}
