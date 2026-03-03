import { useEffect, useRef, useState } from 'react';
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

function triggerHaptic() {
  try {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  } catch {
    // Native module not linked yet — requires a rebuild
  }
}
import { useTheme, useThemedStyles } from '../../providers/ThemeProvider';
import { Text } from './Text';
import type { Theme } from '../../../theme';

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
}

/** Max value: $999,999.99 = 99999999 cents */
const MAX_CENTS = 99999999;

/**
 * Format cents as display string.
 * 0 → "0.00", 150 → "1.50", 12345 → "123.45"
 */
function formatCents(c: number): string {
  const dollars = Math.floor(c / 100);
  const remainder = c % 100;
  return `${dollars.toLocaleString('en-US')}.${String(remainder).padStart(2, '0')}`;
}

/**
 * Banking-style currency input.
 * Digits fill from right to left: 0.00 → 0.01 → 0.15 → 1.52
 * Backspace removes the last digit: 1.52 → 0.15 → 0.01 → 0.00
 */
export function CurrencyInput({
  value,
  onChangeValue,
  type = 'expense',
  autoFocus = false,
  style,
}: CurrencyInputProps) {
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const inputRef = useRef<TextInput>(null);
  const [buffer, setBuffer] = useState(() => String(value));
  const [focused, setFocused] = useState(autoFocus);

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

  const amountColor = type === 'expense' ? theme.colors.negative : theme.colors.positive;
  const prefix = type === 'expense' ? '-$' : '$';

  function handleChangeText(text: string) {
    const digits = text.replace(/\D/g, '');
    const newCents = Math.min(parseInt(digits || '0', 10), MAX_CENTS);

    if (newCents === 0 && value === 0 && digits.length < buffer.length) {
      triggerHaptic();
    }

    setBuffer(digits);
    onChangeValue(newCents);
  }

  return (
    <View style={[styles.container, style]}>
      <Pressable style={styles.display} onPress={() => inputRef.current?.focus()}>
        <Text style={[styles.prefix, { color: amountColor }]}>
          {prefix}
        </Text>
        <Text style={[styles.amount, { color: amountColor }]}>
          {formatCents(value)}
        </Text>
        <Animated.View
          style={[styles.cursor, { backgroundColor: theme.colors.primary }, cursorStyle]}
        />
      </Pressable>
      <TextInput
        ref={inputRef}
        style={styles.hiddenInput}
        keyboardType="number-pad"
        autoFocus={autoFocus}
        caretHidden
        contextMenuHidden
        value={buffer}
        onChangeText={handleChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
    </View>
  );
}

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
