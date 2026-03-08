import { useEffect, useRef, useState } from 'react';
import { evalArithmetic } from '../../lib/arithmetic';
import { MAX_CENTS, centsToDollars, dollarsToCents } from '../../lib/currency';

interface UseExpressionModeOptions {
  /** Current value in cents */
  value: number;
  /** Called when the evaluated result changes */
  onChangeValue: (cents: number) => void;
}

/**
 * Shared expression-mode logic for currency inputs.
 *
 * Manages:
 * - Expression state (left operand + operator string, right operand in cents)
 * - Refs to avoid stale closures in imperative handles
 * - Committing / evaluating expressions
 * - Banking-style text change handling for the right operand
 * - Computing preview and hidden-input value
 *
 * Returns everything both CurrencyInput and CompactCurrencyInput need.
 */
export function useExpressionMode({ value, onChangeValue }: UseExpressionModeOptions) {
  const [expressionMode, setExpressionMode] = useState(false);
  /** Left operand + operator, e.g. "4345.67+" (right operand stored separately) */
  const [expression, setExpression] = useState('');
  /** Right operand in cents — banking-style (digits fill right-to-left) */
  const [operandCents, setOperandCents] = useState(0);

  // Refs to avoid stale closures in useImperativeHandle
  const valueRef = useRef(value);
  const expressionModeRef = useRef(false);
  const expressionRef = useRef('');
  const operandCentsRef = useRef(0);
  const onChangeValueRef = useRef(onChangeValue);

  // Keep refs in sync
  valueRef.current = value;
  onChangeValueRef.current = onChangeValue;
  useEffect(() => { expressionModeRef.current = expressionMode; }, [expressionMode]);
  useEffect(() => { expressionRef.current = expression; }, [expression]);
  useEffect(() => { operandCentsRef.current = operandCents; }, [operandCents]);

  /** Build the full expression string for evaluation. */
  function buildFullExpr(expr: string, cents: number): string {
    return expr + centsToDollars(cents);
  }

  /** Reset all expression state. */
  function resetExpression() {
    setExpressionMode(false);
    setExpression('');
    setOperandCents(0);
    expressionModeRef.current = false;
    expressionRef.current = '';
    operandCentsRef.current = 0;
  }

  /** Evaluate current expression, commit result, exit expression mode. */
  function commitExpression(): number | null {
    const fullExpr = buildFullExpr(expressionRef.current, operandCentsRef.current);
    const result = evalArithmetic(fullExpr);
    if (result !== null && result >= 0) {
      const cents = dollarsToCents(result);
      onChangeValueRef.current(cents);
      valueRef.current = cents;
    }
    resetExpression();
    return result;
  }

  /** Inject an arithmetic operator. Call from imperative handle. */
  function injectOperator(op: string, focusInput?: () => void) {
    if (!expressionModeRef.current) {
      const dollars = centsToDollars(valueRef.current);
      const newExpr = dollars + op;
      setExpression(newExpr);
      expressionRef.current = newExpr;
      setOperandCents(0);
      operandCentsRef.current = 0;
      setExpressionMode(true);
      expressionModeRef.current = true;
    } else {
      const prev = expressionRef.current.trim();
      const lastChar = prev[prev.length - 1];

      if (lastChar && /[+\-*/]/.test(lastChar) && operandCentsRef.current === 0) {
        // Replace trailing operator (right operand is still empty)
        const newExpr = prev.slice(0, -1) + op;
        setExpression(newExpr);
        expressionRef.current = newExpr;
      } else {
        // Evaluate current expression first (chaining: 200+50 then + → 250+)
        const fullExpr = buildFullExpr(prev, operandCentsRef.current);
        const result = evalArithmetic(fullExpr);
        if (result !== null && result >= 0) {
          const cents = dollarsToCents(result);
          onChangeValueRef.current(cents);
          valueRef.current = cents;
          const newExpr = String(result) + op;
          setExpression(newExpr);
          expressionRef.current = newExpr;
        } else {
          const newExpr = prev + op;
          setExpression(newExpr);
          expressionRef.current = newExpr;
        }
        setOperandCents(0);
        operandCentsRef.current = 0;
      }
    }
    focusInput?.();
  }

  /** Evaluate the current expression if in expression mode. */
  function evaluate() {
    if (!expressionModeRef.current) return;
    commitExpression();
  }

  /** Handle text changes for the right operand (banking-style: digits fill right-to-left). */
  function handleChangeTextOperand(text: string) {
    const digits = text.replace(/\D/g, '');
    const newCents = Math.min(parseInt(digits || '0', 10), MAX_CENTS);
    setOperandCents(newCents);
    operandCentsRef.current = newCents;

    // Update live preview / parent value
    const fullExpr = buildFullExpr(expressionRef.current, newCents);
    const result = evalArithmetic(fullExpr);
    if (result !== null && result >= 0) {
      onChangeValue(dollarsToCents(result));
    }
  }

  /** Handle key press — detects Backspace on empty operand to remove operator. */
  function handleKeyPress(e: { nativeEvent: { key: string } }) {
    if (!expressionModeRef.current) return;
    if (e.nativeEvent.key === 'Backspace' && operandCentsRef.current === 0) {
      // Operand is empty — strip trailing operator and exit expression mode
      const expr = expressionRef.current;
      const leftDollars = expr.slice(0, -1); // e.g., "4345.67+" → "4345.67"
      const leftValue = parseFloat(leftDollars);
      if (!isNaN(leftValue)) {
        const leftCents = dollarsToCents(leftValue);
        onChangeValueRef.current(leftCents);
        valueRef.current = leftCents;
      }
      resetExpression();
    }
  }

  /** Handle blur: finalize expression if active. */
  function handleBlurExpression() {
    if (expressionModeRef.current) {
      commitExpression();
    }
  }

  // Full expression string for display (always shows 2 decimals on right operand)
  const fullExpression = expressionMode
    ? expression + (operandCents / 100).toFixed(2)
    : '';

  // Preview of expression result
  const previewExpr = expressionMode
    ? buildFullExpr(expression, operandCents)
    : null;
  const preview = previewExpr ? evalArithmetic(previewExpr) : null;
  const previewCents = preview !== null && preview >= 0 ? dollarsToCents(preview) : null;

  // The raw cents value for the hidden TextInput (banking-style)
  const expressionInputValue = String(operandCents);

  return {
    expressionMode,
    expression,
    fullExpression,
    previewCents,
    expressionInputValue,
    injectOperator,
    evaluate,
    commitExpression,
    handleChangeTextOperand,
    handleKeyPress,
    handleBlurExpression,
  };
}
