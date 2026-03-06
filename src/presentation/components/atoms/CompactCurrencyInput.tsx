import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { TextInput, View, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';
import { useTheme } from '../../providers/ThemeProvider';
import { Text } from './Text';

export interface CompactCurrencyInputRef {
  focus: () => void;
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
  /** Additional container style */
  style?: ViewStyle;
}

/** Max value: $999,999.99 = 99999999 cents */
const MAX_CENTS = 99999999;

function formatCents(c: number): string {
  const dollars = Math.floor(c / 100);
  const remainder = c % 100;
  return `${dollars.toLocaleString('en-US')}.${String(remainder).padStart(2, '0')}`;
}

/**
 * Compact banking-style currency input for inline use in lists/rows.
 * Digits fill from right to left: 0.00 → 0.01 → 0.15 → 1.52
 * No border/background — designed to look inline. Shows blinking cursor when focused.
 */
export const CompactCurrencyInput = forwardRef<CompactCurrencyInputRef, CompactCurrencyInputProps>(
  function CompactCurrencyInput({ value, onChangeValue, onFocus: onFocusProp, onBlur, autoFocus = false, style }, ref) {
    const { colors, spacing } = useTheme();
    const inputRef = useRef<TextInput>(null);
    const [focused, setFocused] = useState(autoFocus);

    const cursorOpacity = useSharedValue(autoFocus ? 1 : 0);

    useImperativeHandle(ref, () => ({
      focus: () => inputRef.current?.focus(),
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

    function handleChangeText(text: string) {
      const digits = text.replace(/\D/g, '');
      const newCents = Math.min(parseInt(digits || '0', 10), MAX_CENTS);
      onChangeValue(newCents);
    }

    return (
      <View style={[{ flexDirection: 'row', alignItems: 'center' }, style]}>
        <Text
          variant="body"
          color={colors.textMuted}
          style={{ marginRight: 1 }}
        >
          $
        </Text>
        <Text
          variant="body"
          style={{
            fontWeight: '600',
            fontVariant: ['tabular-nums'],
            color: value > 0 ? colors.textPrimary : colors.textMuted,
          }}
        >
          {formatCents(value)}
        </Text>
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
        <TextInput
          ref={inputRef}
          style={{ position: 'absolute', opacity: 0, height: 0, width: 0 }}
          keyboardType="number-pad"
          autoFocus={autoFocus}
          caretHidden
          contextMenuHidden
          value={String(value)}
          onChangeText={handleChangeText}
          onFocus={() => { setFocused(true); onFocusProp?.(); }}
          onBlur={() => {
            setFocused(false);
            onBlur?.();
          }}
        />
      </View>
    );
  },
);
