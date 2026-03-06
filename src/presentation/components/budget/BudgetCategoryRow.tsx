import { useRef } from 'react';
import { Platform, Pressable, View } from 'react-native';
import * as ContextMenu from 'zeego/context-menu';
import { useTheme } from '../../providers/ThemeProvider';
import { Text } from '../atoms/Text';
import { Amount } from '../atoms/Amount';
import { CompactCurrencyInput, type CompactCurrencyInputRef } from '../atoms/CompactCurrencyInput';
import { formatPrivacyAware } from '../../../lib/format';
import { getGoalProgress } from '../../../goals/progress';
import { parseGoalDef } from '../../../goals';
import type { BudgetCategory } from '../../../budgets/types';

interface BudgetCategoryRowProps {
  cat: BudgetCategory;
  isIncome: boolean;
  isFirst?: boolean;
  isLast?: boolean;
  /** Whether this row is in inline-edit mode (global edit mode). */
  editing?: boolean;
  /** Current edit value in cents (only used when editing). */
  editValue?: number;
  onPress?: (cat: BudgetCategory) => void;
  onLongPress: (cat: BudgetCategory) => void;
  onMoveMoney?: (cat: BudgetCategory) => void;
  onToggleCarryover?: (cat: BudgetCategory) => void;
  /** Called on every keystroke while editing. */
  onEditChange?: (catId: string, cents: number) => void;
  /** Whether to show progress bars and goal text (default true). */
  showProgressBar?: boolean;
}

export function BudgetCategoryRow({
  cat,
  isIncome,
  isFirst = false,
  isLast = false,
  editing = false,
  editValue,
  onPress,
  onLongPress,
  onMoveMoney,
  onToggleCarryover,
  onEditChange,
  showProgressBar = true,
}: BudgetCategoryRowProps) {
  const { colors, spacing, borderRadius: br, borderWidth: bw } = useTheme();
  const inputRef = useRef<CompactCurrencyInputRef>(null);

  const insetStyle = {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.cardBackground,
    borderTopLeftRadius: isFirst ? br.lg : 0,
    borderTopRightRadius: isFirst ? br.lg : 0,
    borderBottomLeftRadius: isLast ? br.lg : 0,
    borderBottomRightRadius: isLast ? br.lg : 0,
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
        {!isLast && (
          <View style={{ position: 'absolute', bottom: 0, left: spacing.lg, right: spacing.lg, height: bw.thin, backgroundColor: colors.divider }} />
        )}
      </View>
    );
  }

  // ── Expense row ──

  const hasGoal = cat.goal !== null && cat.goal > 0;

  // Detect limit-type goals (spending cap semantics)
  const isLimitGoal = hasGoal && (() => {
    const templates = parseGoalDef(cat.goalDef);
    if (templates.length === 0) return false;
    const p = templates[0];
    return p.type === 'limit' || p.type === 'refill' || (p.type === 'simple' && !p.monthly && !!p.limit);
  })();

  // Progress bar values (computed early for pill coloring)
  const spentAbs = Math.abs(cat.spent);
  const budgetedAbs = Math.abs(cat.budgeted);

  // Available badge colors — goal-aware
  let pillBg: string;
  let pillText: string;

  if (isLimitGoal) {
    // Limit goals: green = under limit, yellow = approaching, red = over
    const ratio = spentAbs / cat.goal!;
    pillBg = ratio >= 1
      ? colors.negative + '30'
      : ratio >= 0.8
        ? colors.warning + '30'
        : colors.positive + '30';
    pillText = ratio >= 1
      ? colors.negative
      : ratio >= 0.8
        ? colors.warning
        : colors.positive;
  } else if (hasGoal) {
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

  // Goal dual-bar values
  let goalFundedPct = 0;
  let goalSpentPct = 0;
  let goalColor = colors.positive;
  if (hasGoal && !isLimitGoal) {
    const fundedValue = cat.longGoal ? cat.balance : cat.budgeted;
    goalFundedPct = Math.min(Math.max(fundedValue / cat.goal!, 0), 1);
    goalSpentPct = Math.min(Math.max(spentAbs / cat.goal!, 0), 1);
    goalColor = cat.balance < 0
      ? colors.negative
      : goalFundedPct >= 1
        ? colors.positive
        : colors.warning;
  }

  // Limit-type single bar: spent vs limit
  let limitSpentPct = 0;
  let limitBarColor = colors.positive;
  if (isLimitGoal) {
    const ratio = spentAbs / cat.goal!;
    limitSpentPct = Math.min(ratio, 1);
    limitBarColor = ratio >= 1
      ? colors.negative
      : ratio >= 0.8
        ? colors.warning
        : colors.positive;
  }

  // No-goal single bar values
  const noGoalPct = budgetedAbs > 0 ? spentAbs / budgetedAbs : 0;
  const noGoalClampedPct = Math.min(noGoalPct, 1);
  const noGoalBarColor = noGoalPct >= 1
    ? colors.negative
    : noGoalPct >= 0.8
      ? colors.warning
      : colors.positive;

  const pressableContent = (
    <Pressable
      style={{
        paddingHorizontal: spacing.lg,
        paddingTop: 12,
        paddingBottom: 10,
        minHeight: 44,
        ...insetStyle,
      }}
      onPress={() => {
        if (editing) {
          inputRef.current?.focus();
        } else {
          onPress?.(cat);
        }
      }}
      onLongPress={Platform.OS === 'android' ? () => onLongPress(cat) : undefined}
      delayLongPress={400}
    >
      {/* Line 1: Name + Budget input (when editing) + Available pill */}
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
        {editing && (
          <CompactCurrencyInput
            ref={inputRef}
            value={editValue ?? cat.budgeted}
            onChangeValue={(cents) => onEditChange?.(cat.id, cents)}
          />
        )}
        <View
          accessibilityLabel={`${formatPrivacyAware(cat.balance)} available`}
          style={{
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
          </View>
        </View>
      </View>

      {/* Line 2: Progress bar */}
      {showProgressBar && (isLimitGoal ? (
        <View
          style={{
            height: 5,
            borderRadius: 2.5,
            backgroundColor: colors.divider,
            marginTop: 6,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              width: `${Math.round(limitSpentPct * 100)}%`,
              height: '100%',
              borderRadius: 2.5,
              backgroundColor: limitBarColor,
            }}
          />
        </View>
      ) : hasGoal ? (
        <View
          style={{
            height: 5,
            borderRadius: 2.5,
            backgroundColor: colors.divider,
            marginTop: 6,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              position: 'absolute', left: 0, top: 0, bottom: 0,
              width: `${Math.round(goalSpentPct * 100)}%`,
              borderRadius: 2.5,
              backgroundColor: goalColor + '50',
            }}
          />
          {goalFundedPct > goalSpentPct && (
            <View
              style={{
                position: 'absolute', top: 0, bottom: 0,
                left: `${Math.round(goalSpentPct * 100)}%`,
                width: `${Math.round((goalFundedPct - goalSpentPct) * 100)}%`,
                borderRadius: 2.5,
                backgroundColor: goalColor + '90',
              }}
            />
          )}
        </View>
      ) : budgetedAbs > 0 ? (
        <View
          style={{
            height: 5,
            borderRadius: 2.5,
            backgroundColor: colors.divider,
            marginTop: 6,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              width: `${Math.round(noGoalClampedPct * 100)}%`,
              height: '100%',
              borderRadius: 2.5,
              backgroundColor: noGoalBarColor,
            }}
          />
        </View>
      ) : null)}

      {/* Line 3: Progress text (informational) */}
      {showProgressBar && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: 3 }}>
          {getGoalProgress(cat).map((seg, i) =>
            'text' in seg
              ? <Text key={i} variant="captionSm" color={colors.textMuted}>{seg.text}</Text>
              : <Amount key={i} value={seg.amount} variant="captionSm" color={colors.textMuted} colored={false} />
          )}
        </View>
      )}
      {!isLast && (
        <View style={{ position: 'absolute', bottom: 0, left: spacing.lg, right: spacing.lg, height: bw.thin, backgroundColor: colors.divider }} />
      )}
    </Pressable>
  );

  if (Platform.OS === 'ios') {
    const carryoverLabel = cat.carryover ? 'Remove Overspending Rollover' : 'Rollover Overspending';
    return (
      <ContextMenu.Root>
        <ContextMenu.Trigger>{pressableContent}</ContextMenu.Trigger>
        <ContextMenu.Content>
          <ContextMenu.Item
            key="move-money"
            onSelect={() => onMoveMoney?.(cat)}
          >
            <ContextMenu.ItemTitle>Move Money</ContextMenu.ItemTitle>
            <ContextMenu.ItemIcon ios={{ name: 'arrow.left.arrow.right' }} />
          </ContextMenu.Item>
          <ContextMenu.Item
            key="toggle-carryover"
            onSelect={() => onToggleCarryover?.(cat)}
          >
            <ContextMenu.ItemTitle>{carryoverLabel}</ContextMenu.ItemTitle>
            <ContextMenu.ItemIcon
              ios={{ name: cat.carryover ? 'arrow.uturn.backward' : 'arrow.clockwise' }}
            />
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Root>
    );
  }

  return pressableContent;
}
