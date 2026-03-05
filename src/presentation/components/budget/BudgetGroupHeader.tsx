import { Pressable } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../providers/ThemeProvider';
import { Text } from '../atoms/Text';
import { Amount } from '../atoms/Amount';
import type { BudgetGroup } from '../../../budgets/types';

interface BudgetGroupHeaderProps {
  group: BudgetGroup;
  isCollapsed: boolean;
  onToggle: () => void;
}

export function BudgetGroupHeader({ group, isCollapsed, onToggle }: BudgetGroupHeaderProps) {
  const { colors, spacing } = useTheme();

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: withTiming(isCollapsed ? '-90deg' : '0deg', { duration: 200 }) }],
  }));

  const balanceColor = group.is_income
    ? colors.positive
    : group.balance < 0
      ? colors.negative
      : group.balance > 0
        ? colors.positive
        : colors.textMuted;

  const balanceValue = group.is_income ? group.spent : group.balance;

  return (
    <Pressable
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.pageBackground,
        paddingHorizontal: spacing.lg + spacing.lg,
        paddingVertical: spacing.md,
        paddingTop: spacing.lg + spacing.md,
        paddingBottom: spacing.md,
        gap: 6,
      }}
      onPress={onToggle}
    >
      <Animated.View style={chevronStyle}>
        <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
      </Animated.View>
      <Text
        variant="captionSm"
        color={colors.textSecondary}
        style={{ flex: 1, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: '700' }}
      >
        {group.name}
      </Text>
      <Amount value={balanceValue} variant="caption" color={balanceColor} weight="600" />
    </Pressable>
  );
}
