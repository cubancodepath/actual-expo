import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Pressable, TextInput, View, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTheme, useThemedStyles } from '../../providers/ThemeProvider';
import { Text } from './Text';
import { useExpressionMode } from '../../hooks/useExpressionMode';
import { MAX_CENTS, formatCents, formatExpression } from '../../../lib/currency';
import type { Theme } from '../../../theme';

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
}

interface CurrencyInputProps {
  /** Amount in cents (always positive) */
  value: number;
  /** Called with new amount in cents */
  onChangeValue: (cents: number) => void;
  /** 'expense' shows -$, 'income' shows +$ */
  type?: 'expense' | 'income';
  /** Auto-focus the input on mount */
  autoFocus?: boolean;
  /** Additional style for the container */
  style?: ViewStyle;
  /** Override the amount text color (defaults to expense/income semantic color) */
  color?: string;
}

/**
 * Banking-style currency input.
 * Digits fill from right to left: 0.00 → 0.01 → 0.15 → 1.52
 * Backspace removes the last digit: 1.52 → 0.15 → 0.01 → 0.00
 *
 * Supports inline calculator via ref: injectOperator() and evaluate().
 */
export const CurrencyInput = forwardRef<CurrencyInputRef, CurrencyInputProps>(
  function CurrencyInput({
    value,
    onChangeValue,
    type = 'expense',
    autoFocus = false,
    style,
    color: colorOverride,
  }, ref) {
    const theme = useTheme();
    const styles = useThemedStyles(createStyles);
    const inputRef = useRef<TextInput>(null);
    const [buffer, setBuffer] = useState(() => String(value));
    const [focused, setFocused] = useState(autoFocus);
    const lastExternalValue = useRef(value);

    // Sync buffer when value changes externally (e.g. parent setState in useEffect)
    useEffect(() => {
      if (value !== lastExternalValue.current) {
        lastExternalValue.current = value;
        setBuffer(String(value));
      }
    }, [value]);

    const expr = useExpressionMode({ value, onChangeValue });

    const cursorOpacity = useSharedValue(autoFocus ? 1 : 0);

    useImperativeHandle(ref, () => ({
      focus: () => inputRef.current?.focus(),
      injectOperator: (op: string) => expr.injectOperator(op, () => inputRef.current?.focus()),
      evaluate: () => expr.evaluate(),
    }));

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

    const amountColor = colorOverride ?? (type === 'expense' ? theme.colors.negative : theme.colors.positive);
    const prefix = type === 'expense' ? '-$' : '$';

    function handleChangeTextNormal(text: string) {
      const digits = text.replace(/\D/g, '');
      const newCents = Math.min(parseInt(digits || '0', 10), MAX_CENTS);

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

    const currentInputValue = expr.expressionMode
      ? expr.expressionInputValue
      : buffer;

    return (
      <Pressable style={[styles.container, style]} onPress={() => inputRef.current?.focus()}>
        <View style={styles.display}>
          {!expr.expressionMode && (
            <>
              <Text style={[styles.prefix, { color: amountColor }]}>
                {prefix}
              </Text>
              <Text style={[styles.amount, { color: amountColor }]}>
                {formatCents(value)}
              </Text>
            </>
          )}
          {expr.expressionMode && (
            <Text
              style={[styles.amount, { color: theme.colors.primary }]}
              numberOfLines={1}
            >
              {formatExpression(expr.fullExpression)}
            </Text>
          )}
          <Animated.View
            style={[styles.cursor, { backgroundColor: theme.colors.primary }, cursorStyle]}
          />
        </View>

        {/* Live preview of expression result */}
        {expr.expressionMode && expr.previewCents !== null && (
          <Text
            variant="body"
            color={theme.colors.textMuted}
            style={{ fontVariant: ['tabular-nums'], marginTop: 2, textAlign: 'center' }}
          >
            = ${formatCents(expr.previewCents)}
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
        />
      </Pressable>
    );
  },
);

const createStyles = (theme: Theme) => ({
  container: {
    alignItems: 'center' as const,
    paddingVertical: theme.spacing.xl,
  },
  display: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  prefix: {
    fontSize: 32,
    lineHeight: 40,
    fontWeight: '700' as const,
    marginRight: theme.spacing.xs,
  },
  amount: {
    fontSize: 32,
    lineHeight: 40,
    fontWeight: '700' as const,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
  },
  cursor: {
    width: 2,
    height: 28,
    marginLeft: 2,
    borderRadius: 1,
  },
  hiddenInput: {
    position: 'absolute' as const,
    opacity: 0,
    height: 0,
    width: 0,
  },
});
