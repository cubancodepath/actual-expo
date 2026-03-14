import { Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../providers/ThemeProvider';
import { Text } from '../atoms/Text';
import { Amount } from '../atoms/Amount';
import type { BudgetGroup } from '../../../budgets/types';
import { BUDGET_COLUMNS } from './BudgetCategoryRow';

interface BudgetGroupHeaderProps {
  group: BudgetGroup;
  isCollapsed: boolean;
  onToggle: () => void;
  showBudgetedColumn?: boolean;
}

export function BudgetGroupHeader({ group, isCollapsed, onToggle, showBudgetedColumn = true }: BudgetGroupHeaderProps) {
  const { t } = useTranslation('budget');
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
  const paddingH = spacing.lg + spacing.lg;

  return (
    <View style={{ backgroundColor: colors.pageBackground }}>
      {/* Column labels */}
      <View style={{
        flexDirection: 'row',
        paddingHorizontal: paddingH,
        paddingTop: spacing.lg,
      }}>
        <View style={{ flex: 1 }} />
        {showBudgetedColumn && !group.is_income && (
          <Text
            variant="captionSm"
            color={colors.textMuted}
            style={{ width: BUDGET_COLUMNS.budgeted, textAlign: 'right', fontWeight: '600' }}
          >
            {t('columnBudgeted')}
          </Text>
        )}
        <Text
          variant="captionSm"
          color={colors.textMuted}
          style={{ width: BUDGET_COLUMNS.available, textAlign: 'center', fontWeight: '600', paddingLeft: spacing.sm }}
        >
          {t('columnAvailable')}
        </Text>
      </View>
      {/* Group info row */}
      <Pressable
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: paddingH,
          paddingTop: spacing.xs,
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
        {showBudgetedColumn && !group.is_income && (
          <View style={{ width: BUDGET_COLUMNS.budgeted, alignItems: 'flex-end' }}>
            <Amount
              value={group.budgeted}
              variant="caption"
              color={group.budgeted !== 0 ? colors.textSecondary : colors.textMuted}
              weight="600"
            />
          </View>
        )}
        <View style={{ width: BUDGET_COLUMNS.available, alignItems: 'center' }}>
          <Amount value={balanceValue} variant="caption" color={balanceColor} weight="600" />
        </View>
      </Pressable>
    </View>
  );
}
