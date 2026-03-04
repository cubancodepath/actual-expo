import { Pressable, View } from 'react-native';
import { useTheme } from '../../providers/ThemeProvider';
import { Text } from '../atoms/Text';
import { Amount } from '../atoms/Amount';
import { formatPrivacyAware } from '../../../lib/format';
import { getGoalProgress } from '../../../goals/progress';
import type { BudgetCategory } from '../../../budgets/types';

interface BudgetCategoryRowProps {
  cat: BudgetCategory;
  isIncome: boolean;
  isFirst?: boolean;
  isLast?: boolean;
  onLongPress: (cat: BudgetCategory) => void;
  onBalancePress: (cat: BudgetCategory) => void;
}

export function BudgetCategoryRow({
  cat,
  isIncome,
  isFirst = false,
  isLast = false,
  onLongPress,
  onBalancePress,
}: BudgetCategoryRowProps) {
  const { colors, spacing, borderRadius: br, borderWidth: bw } = useTheme();

  const insetStyle = {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.cardBackground,
    borderTopLeftRadius: isFirst ? br.lg : 0,
    borderTopRightRadius: isFirst ? br.lg : 0,
    borderBottomLeftRadius: isLast ? br.lg : 0,
    borderBottomRightRadius: isLast ? br.lg : 0,
    borderBottomWidth: isLast ? 0 : bw.thin,
    borderBottomColor: colors.divider,
  };

  // ── Income row (simple) ──
  if (isIncome) {
    return (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: spacing.lg,
          paddingVertical: 13,
          minHeight: 44,
          ...insetStyle,
        }}
      >
        <Text variant="body" style={{ flex: 1 }} numberOfLines={1}>
          {cat.name}
        </Text>
        <Amount value={cat.spent} variant="body" color={colors.positive} weight="500" />
      </View>
    );
  }

  // ── Expense row ──

  const hasGoal = cat.goal !== null && cat.goal > 0;

  // Available badge colors — goal-aware
  let pillBg: string;
  let pillText: string;

  if (hasGoal) {
    const funded = cat.longGoal
      ? cat.balance >= cat.goal!
      : cat.budgeted >= cat.goal!;
    pillBg = cat.balance < 0
      ? colors.negative + '30'
      : funded
        ? colors.positive + '30'
        : colors.warning + '30';
    pillText = cat.balance < 0
      ? colors.negative
      : funded
        ? colors.positive
        : colors.warning;
  } else {
    pillBg = cat.balance > 0
      ? colors.positive + '30'
      : cat.balance < 0
        ? colors.negative + '30'
        : colors.cardBackground;
    pillText = cat.balance > 0
      ? colors.positive
      : cat.balance < 0
        ? colors.negative
        : colors.textMuted;
  }

  // Progress bar
  const spentAbs = Math.abs(cat.spent);
  const budgetedAbs = Math.abs(cat.budgeted);

  // Goal dual-bar values
  let goalFundedPct = 0;
  let goalSpentPct = 0;
  let goalColor = colors.positive;
  if (hasGoal) {
    const fundedValue = cat.longGoal ? cat.balance : cat.budgeted;
    goalFundedPct = Math.min(Math.max(fundedValue / cat.goal!, 0), 1);
    goalSpentPct = Math.min(Math.max(spentAbs / cat.goal!, 0), 1);
    goalColor = cat.balance < 0
      ? colors.negative
      : goalFundedPct >= 1
        ? colors.positive
        : colors.warning;
  }

  // No-goal single bar values
  const noGoalPct = budgetedAbs > 0 ? spentAbs / budgetedAbs : 0;
  const noGoalClampedPct = Math.min(noGoalPct, 1);
  const noGoalBarColor = noGoalPct >= 1
    ? colors.negative
    : noGoalPct >= 0.8
      ? colors.warning
      : colors.positive;

  return (
    <Pressable
      style={{
        paddingHorizontal: spacing.lg,
        paddingTop: 12,
        paddingBottom: 10,
        minHeight: 44,
        ...insetStyle,
      }}
      onLongPress={() => onLongPress(cat)}
      delayLongPress={400}
    >
      {/* Line 1: Name + Available pill */}
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4, overflow: 'hidden' }}>
          <Text variant="body" numberOfLines={1} style={{ flexShrink: 1 }}>
            {cat.name}
          </Text>
          {cat.carryover && (
            <Text variant="caption" color={colors.primary} style={{ fontWeight: '700' }}>
              ↻
            </Text>
          )}
        </View>
        <Pressable
          onPress={(e) => {
            e.stopPropagation?.();
            onBalancePress(cat);
          }}
          accessibilityLabel={`${formatPrivacyAware(cat.balance)} available. Tap to move money.`}
          accessibilityRole="button"
          style={{
            alignSelf: 'stretch',
            justifyContent: 'center',
            paddingLeft: spacing.sm,
          }}
        >
          <View
            style={{
              backgroundColor: pillBg,
              borderRadius: 100,
              paddingHorizontal: 10,
              paddingVertical: 3,
              minWidth: 48,
              alignItems: 'center',
            }}
          >
            <Amount value={cat.balance} variant="captionSm" color={pillText} weight="700" />
            {cat.carryIn !== 0 && (
              <Amount
                value={cat.carryIn}
                showSign
                variant="captionSm"
                color={cat.carryIn < 0 ? colors.negative : colors.positive}
                weight="600"
                style={{ fontSize: 9, marginTop: -1 }}
              />
            )}
          </View>
        </Pressable>
      </View>

      {/* Line 2: Progress text */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: 4 }}>
        {getGoalProgress(cat).map((seg, i) =>
          'text' in seg
            ? <Text key={i} variant="bodySm" color={colors.textMuted}>{seg.text}</Text>
            : <Amount key={i} value={seg.amount} variant="bodySm" color={colors.textSecondary} colored={false} />
        )}
      </View>

      {/* Line 3: Progress bar */}
      {hasGoal ? (
        <View
          style={{
            height: 3,
            borderRadius: 1.5,
            backgroundColor: colors.divider,
            marginTop: 6,
            overflow: 'hidden',
          }}
        >
          {/* Segment 1: spent (lighter) */}
          <View
            style={{
              position: 'absolute', left: 0, top: 0, bottom: 0,
              width: `${Math.round(goalSpentPct * 100)}%`,
              borderRadius: 1.5,
              backgroundColor: goalColor + '50',
            }}
          />
          {/* Segment 2: funded but not spent (darker, starts after spent) */}
          {goalFundedPct > goalSpentPct && (
            <View
              style={{
                position: 'absolute', top: 0, bottom: 0,
                left: `${Math.round(goalSpentPct * 100)}%`,
                width: `${Math.round((goalFundedPct - goalSpentPct) * 100)}%`,
                borderRadius: 1.5,
                backgroundColor: goalColor + '90',
              }}
            />
          )}
        </View>
      ) : budgetedAbs > 0 ? (
        <View
          style={{
            height: 3,
            borderRadius: 1.5,
            backgroundColor: colors.divider,
            marginTop: 6,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              width: `${Math.round(noGoalClampedPct * 100)}%`,
              height: '100%',
              borderRadius: 1.5,
              backgroundColor: noGoalBarColor,
            }}
          />
        </View>
      ) : null}
    </Pressable>
  );
}
