import { Pressable } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../providers/ThemeProvider';
import { Text } from '../atoms/Text';
import { formatBalance } from '../../../lib/format';
import type { BudgetGroup } from '../../../budgets/types';

interface BudgetGroupHeaderProps {
  group: BudgetGroup;
  isCollapsed: boolean;
  onToggle: () => void;
}

export function BudgetGroupHeader({ group, isCollapsed, onToggle }: BudgetGroupHeaderProps) {
  const { colors, spacing, borderWidth: bw } = useTheme();

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
        paddingHorizontal: spacing.lg,
        paddingVertical: 10,
        backgroundColor: colors.cardBackground,
        borderTopWidth: bw.thin,
        borderBottomWidth: bw.thin,
        borderColor: colors.divider,
        marginTop: 6,
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
        style={{ flex: 1, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '700' }}
      >
        {group.name}
      </Text>
      <Text
        variant="caption"
        color={balanceColor}
        style={{ fontWeight: '600', fontVariant: ['tabular-nums'] }}
      >
        {formatBalance(balanceValue)}
      </Text>
    </Pressable>
  );
}
