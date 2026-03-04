import { Pressable, View } from 'react-native';
import { useTheme } from '../../providers/ThemeProvider';
import { Text } from '../atoms/Text';
import { formatBalance } from '../../../lib/format';
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
        <Text
          variant="body"
          color={colors.positive}
          style={{ fontWeight: '500', fontVariant: ['tabular-nums'] }}
        >
          {formatBalance(cat.spent)}
        </Text>
      </View>
    );
  }

  // ── Expense row ──

  // Available badge colors
  const pillBg =
    cat.balance > 0
      ? colors.positive + '30'
      : cat.balance < 0
        ? colors.negative + '30'
        : colors.cardBackground;
  const pillText =
    cat.balance > 0
      ? colors.positive
      : cat.balance < 0
        ? colors.negative
        : colors.textMuted;

  // Progress bar
  const spentAbs = Math.abs(cat.spent);
  const budgetedAbs = Math.abs(cat.budgeted);
  const pct = budgetedAbs > 0 ? spentAbs / budgetedAbs : 0;
  const clampedPct = Math.min(pct, 1);
  const barColor =
    pct >= 1
      ? colors.negative
      : pct >= 0.8
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
          accessibilityLabel={`${formatBalance(cat.balance)} available. Tap to move money.`}
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
            <Text
              variant="captionSm"
              color={pillText}
              style={{ fontWeight: '700', fontVariant: ['tabular-nums'] }}
            >
              {formatBalance(cat.balance)}
            </Text>
            {cat.carryIn !== 0 && (
              <Text
                variant="captionSm"
                color={cat.carryIn < 0 ? colors.negative : colors.positive}
                style={{ fontWeight: '600', fontSize: 9, marginTop: -1 }}
              >
                {cat.carryIn > 0 ? '+' : ''}{formatBalance(cat.carryIn)}
              </Text>
            )}
          </View>
        </Pressable>
      </View>

      {/* Line 2: Budgeted · Spent */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
        <Text variant="bodySm" color={colors.textMuted}>
          {'Budgeted '}
          <Text variant="bodySm" color={cat.budgeted !== 0 ? colors.textSecondary : colors.textMuted}>
            {formatBalance(cat.budgeted)}
          </Text>
          {'  ·  Spent '}
          <Text variant="bodySm" color={cat.spent !== 0 ? colors.textSecondary : colors.textMuted}>
            {cat.spent !== 0 ? formatBalance(cat.spent) : '—'}
          </Text>
        </Text>
      </View>

      {/* Line 3: Progress bar */}
      {budgetedAbs > 0 && (
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
              width: `${Math.round(clampedPct * 100)}%`,
              height: '100%',
              borderRadius: 1.5,
              backgroundColor: barColor,
            }}
          />
        </View>
      )}
    </Pressable>
  );
}
