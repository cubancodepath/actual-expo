import { useEffect, useRef, useState } from 'react';
import { evalArithmetic } from '../../lib/arithmetic';
import { centsToDollars, dollarsToCents } from '../../lib/currency';

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
 * - Expression state (expression string, mode toggle)
 * - Refs to avoid stale closures in imperative handles
 * - Committing / evaluating expressions
 * - Text change handling in expression mode
 * - Computing preview and hidden-input value
 *
 * Returns everything both CurrencyInput and CompactCurrencyInput need.
 */
export function useExpressionMode({ value, onChangeValue }: UseExpressionModeOptions) {
  const [expressionMode, setExpressionMode] = useState(false);
  const [expression, setExpression] = useState('');

  // Refs to avoid stale closures in useImperativeHandle
  const valueRef = useRef(value);
  const expressionModeRef = useRef(false);
  const expressionRef = useRef('');
  const onChangeValueRef = useRef(onChangeValue);

  // Keep refs in sync
  valueRef.current = value;
  onChangeValueRef.current = onChangeValue;
  useEffect(() => { expressionModeRef.current = expressionMode; }, [expressionMode]);
  useEffect(() => { expressionRef.current = expression; }, [expression]);

  /** Evaluate current expression, commit result, exit expression mode. */
  function commitExpression(): number | null {
    const expr = expressionRef.current;
    const result = evalArithmetic(expr);
    if (result !== null && result >= 0) {
      const cents = dollarsToCents(result);
      onChangeValueRef.current(cents);
      valueRef.current = cents;
    }
    setExpressionMode(false);
    setExpression('');
    expressionModeRef.current = false;
    expressionRef.current = '';
    return result;
  }

  /** Inject an arithmetic operator. Call from imperative handle. */
  function injectOperator(op: string, focusInput?: () => void) {
    if (!expressionModeRef.current) {
      const dollars = centsToDollars(valueRef.current);
      const newExpr = dollars + op;
      setExpression(newExpr);
      expressionRef.current = newExpr;
      setExpressionMode(true);
      expressionModeRef.current = true;
    } else {
      const prev = expressionRef.current.trim();
      const lastChar = prev[prev.length - 1];

      if (lastChar && /[+\-*/]/.test(lastChar)) {
        // Replace trailing operator
        const newExpr = prev.slice(0, -1) + op;
        setExpression(newExpr);
        expressionRef.current = newExpr;
      } else {
        // Evaluate current expression first (chaining: 200+400 then + → 600+)
        const result = evalArithmetic(prev);
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
      }
    }
    focusInput?.();
  }

  /** Evaluate the current expression if in expression mode. */
  function evaluate() {
    if (!expressionModeRef.current) return;
    commitExpression();
  }

  /** Handle text changes while in expression mode. */
  function handleChangeTextExpression(text: string) {
    const cleaned = text.replace(/[^0-9.]/g, '');
    const expr = expressionRef.current;

    const lastOpIndex = Math.max(
      expr.lastIndexOf('+'),
      expr.lastIndexOf('-'),
      expr.lastIndexOf('*'),
      expr.lastIndexOf('/'),
    );

    const newExpr = lastOpIndex >= 0
      ? expr.slice(0, lastOpIndex + 1) + cleaned
      : cleaned;

    setExpression(newExpr);
    expressionRef.current = newExpr;

    const result = evalArithmetic(newExpr);
    if (result !== null && result >= 0) {
      onChangeValue(dollarsToCents(result));
    }
  }

  /** Handle blur: finalize expression if active. */
  function handleBlurExpression() {
    if (expressionModeRef.current) {
      commitExpression();
    }
  }

  // Preview of expression result
  const preview = expressionMode ? evalArithmetic(expression) : null;
  const previewCents = preview !== null && preview >= 0 ? dollarsToCents(preview) : null;

  // The "current number being typed" for the hidden input value
  const expressionInputValue = (() => {
    const lastOpIndex = Math.max(
      expression.lastIndexOf('+'),
      expression.lastIndexOf('-'),
      expression.lastIndexOf('*'),
      expression.lastIndexOf('/'),
    );
    return lastOpIndex >= 0 ? expression.slice(lastOpIndex + 1) : expression;
  })();

  return {
    expressionMode,
    expression,
    previewCents,
    expressionInputValue,
    injectOperator,
    evaluate,
    commitExpression,
    handleChangeTextExpression,
    handleBlurExpression,
  };
}
