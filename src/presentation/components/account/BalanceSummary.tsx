import { Pressable, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useThemedStyles } from '../../providers/ThemeProvider';
import { Text, Amount } from '..';
import type { Theme } from '../../../theme';

interface BalanceSummaryProps {
  balance: number;
  clearedBalance: number;
}

export function BalanceSummary({ balance, clearedBalance }: BalanceSummaryProps) {
  const { colors, spacing } = useTheme();
  const styles = useThemedStyles(createStyles);
  const unclearedBalance = balance - clearedBalance;
  const hasBreakdown = balance !== clearedBalance;

  // Single progress value: 0 = centered, 1 = expanded
  const progress = useSharedValue(0);
  // Measure container width to know how far to shift
  const containerWidth = useSharedValue(0);

  function toggle() {
    if (!hasBreakdown) return;
    progress.value = withTiming(progress.value === 0 ? 1 : 0, { duration: 250 });
  }

  // Balance slides left: at progress=0 translateX=0 (centered), at progress=1 shifts left
  const balanceBlockStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * -(containerWidth.value * 0.22) }],
  }));

  // Breakdown fades in on the right
  const breakdownStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
  }));

  const chevronStyle = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
  }));

  return (
    <View
      style={styles.container}
      onLayout={(e) => { containerWidth.value = e.nativeEvent.layout.width; }}
    >
      <Pressable onPress={toggle} style={styles.pressable}>
        {/* Balance — slides from center to left */}
        <Animated.View style={balanceBlockStyle}>
          <View style={styles.balanceInner}>
            <Amount value={balance} variant="headingLg" colored />
            {hasBreakdown && (
              <Animated.View style={chevronStyle}>
                <Ionicons
                  name="chevron-expand-outline"
                  size={14}
                  color={colors.textMuted}
                  style={{ marginLeft: spacing.xs }}
                />
              </Animated.View>
            )}
          </View>
          <Text variant="caption" color={colors.textMuted} align="center">
            Current Balance
          </Text>
        </Animated.View>

        {/* Breakdown — positioned right, fades in */}
        {hasBreakdown && (
          <Animated.View style={[styles.breakdown, breakdownStyle]}>
            <View style={styles.breakdownLine}>
              <Text variant="caption" color={colors.textSecondary} style={styles.breakdownLabel}>Cleared</Text>
              <Amount value={clearedBalance} variant="bodySm" />
            </View>
            <View style={styles.breakdownLine}>
              <Text variant="caption" color={colors.textSecondary} style={styles.breakdownLabel}>Uncleared</Text>
              <Amount value={unclearedBalance} variant="bodySm" />
            </View>
          </Animated.View>
        )}
      </Pressable>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    paddingVertical: theme.spacing.lg,
  },
  pressable: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: theme.spacing.lg,
  },
  balanceInner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  breakdown: {
    position: 'absolute' as const,
    right: theme.spacing.lg,
    alignItems: 'flex-end' as const,
    gap: theme.spacing.xxs,
  },
  breakdownLabel: {
    width: 65,
    marginRight: theme.spacing.xs,
  },
  breakdownLine: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
});
