import { Pressable } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../providers/ThemeProvider';
import { Text } from '../atoms/Text';
import { formatBalance } from '../../../lib/format';
import type { BudgetGroup } from '../../../budgets/types';

const COL_BUDGET = 76;
const COL_SPENT = 68;
const COL_BAL = 72;

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

  if (group.is_income) {
    return (
      <Pressable
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: spacing.lg,
          paddingVertical: 9,
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
          color={colors.positive}
          style={{ width: COL_BAL, fontWeight: '600', textAlign: 'right' }}
        >
          {formatBalance(group.spent)}
        </Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing.lg,
        paddingVertical: 9,
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
        color={colors.textSecondary}
        style={{ width: COL_BUDGET, fontWeight: '600', textAlign: 'right' }}
      >
        {formatBalance(group.budgeted)}
      </Text>
      <Text
        variant="caption"
        color={group.spent < 0 ? colors.textSecondary : colors.textMuted}
        style={{ width: COL_SPENT, fontWeight: '600', textAlign: 'right' }}
      >
        {group.spent !== 0 ? formatBalance(group.spent) : '—'}
      </Text>
      <Text
        variant="caption"
        color={group.balance < 0 ? colors.negative : colors.positive}
        style={{ width: COL_BAL, fontWeight: '600', textAlign: 'right' }}
      >
        {formatBalance(group.balance)}
      </Text>
    </Pressable>
  );
}
