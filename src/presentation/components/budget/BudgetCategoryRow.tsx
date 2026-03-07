import { memo, useRef } from 'react';
import { Platform, Pressable, View } from 'react-native';
import * as ContextMenu from 'zeego/context-menu';
import { useTheme } from '../../providers/ThemeProvider';
import { Text } from '../atoms/Text';
import { Amount } from '../atoms/Amount';
import { CompactCurrencyInput, type CompactCurrencyInputRef } from '../atoms/CompactCurrencyInput';
import { formatPrivacyAware } from '../../../lib/format';
import { getGoalProgress } from '../../../goals/progress';
import { parseGoalDef } from '../../../goals';
import { ProgressBar } from '../atoms/ProgressBar';
import type { BudgetCategory } from '../../../budgets/types';

interface BudgetCategoryRowProps {
  cat: BudgetCategory;
  isIncome: boolean;
  isFirst?: boolean;
  isLast?: boolean;
  /** Whether this row is in inline-edit mode (global edit mode). */
  editing?: boolean;
  /** Auto-focus the currency input when entering edit mode on this row. */
  autoFocusInput?: boolean;
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

export const BudgetCategoryRow = memo(function BudgetCategoryRow({
  cat,
  isIncome,
  isFirst = false,
  isLast = false,
  editing = false,
  autoFocusInput = false,
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
  const templates = hasGoal ? parseGoalDef(cat.goalDef) : [];
  const primaryTemplate = templates[0];

  // Detect limit-type goals (spending cap semantics)
  const isLimitGoal = hasGoal && !!primaryTemplate && (
    primaryTemplate.type === 'limit' || primaryTemplate.type === 'refill' ||
    (primaryTemplate.type === 'simple' && primaryTemplate.monthly === 0 && !!primaryTemplate.limit)
  );

  // Detect sinking funds (by/spend) — need total target for cumulative bar
  const sinkingFundTotal = hasGoal && !isLimitGoal && !cat.longGoal && primaryTemplate &&
    (primaryTemplate.type === 'by' || primaryTemplate.type === 'spend')
    ? Math.round(primaryTemplate.amount * 100)
    : 0;

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
      ? colors.budgetOverspentBg
      : ratio >= 0.8
        ? colors.budgetCautionBg
        : colors.budgetHealthyBg;
    pillText = ratio >= 1
      ? colors.budgetOverspent
      : ratio >= 0.8
        ? colors.budgetCaution
        : colors.budgetHealthy;
  } else if (hasGoal) {
    const funded = cat.longGoal
      ? cat.balance >= cat.goal!
      : cat.budgeted >= cat.goal!;
    pillBg = cat.balance < 0
      ? colors.budgetOverspentBg
      : funded
        ? colors.budgetHealthyBg
        : colors.budgetCautionBg;
    pillText = cat.balance < 0
      ? colors.budgetOverspent
      : funded
        ? colors.budgetHealthy
        : colors.budgetCaution;
  } else {
    pillBg = cat.balance > 0
      ? colors.budgetHealthyBg
      : cat.balance < 0
        ? colors.budgetOverspentBg
        : colors.cardBackground;
    pillText = cat.balance > 0
      ? colors.budgetHealthy
      : cat.balance < 0
        ? colors.budgetOverspent
        : colors.textMuted;
  }

  // ── Progress bar values (YNAB-style) ──
  //
  // Two bar modes:
  //   1. Savings goals (longGoal) — bar = balance / goal (how much saved toward target)
  //   2. Spending (everything else) — bar = spent (dark) + available (light) vs budget
  //
  // ProgressBar props:
  //   spent    = darker portion (amount consumed or saved)
  //   available = total filled portion (spent + remaining)
  //   overspent = full bar red with pulse

  let barSpent = 0;     // darker layer width 0–1
  let barAvailable = 0; // total filled width 0–1 (includes barSpent)
  let barColor = colors.positive;
  let barOverspent = false;

  if (isLimitGoal) {
    // Spending cap: spent vs limit
    const base = cat.goal!;
    const ratio = spentAbs / base;
    barSpent = Math.min(ratio, 1);
    barAvailable = 1; // full bar = the limit budget
    barOverspent = ratio >= 1;
    barColor = ratio >= 1
      ? colors.negative
      : ratio >= 0.8
        ? colors.warning
        : colors.positive;
  } else if (hasGoal && cat.longGoal) {
    // Long-term savings goal (#goal, refill): balance / goal
    // Single solid bar showing savings progress — no spent/available split
    const base = cat.goal!;
    const savedPct = Math.min(Math.max(cat.balance / base, 0), 1);
    barSpent = savedPct; // "spent" layer = saved amount (solid bar)
    barAvailable = savedPct; // same width — no lighter portion behind it
    barOverspent = cat.balance < 0;
    barColor = barOverspent
      ? colors.negative
      : colors.positive;
  } else if (hasGoal && sinkingFundTotal > 0) {
    // Sinking fund (by/spend): bar = cumulative balance / total target, color = on track status
    const savedPct = Math.min(Math.max(cat.balance / sinkingFundTotal, 0), 1);
    barSpent = savedPct;
    barAvailable = savedPct;
    barOverspent = cat.balance < 0;
    const funded = cat.budgeted >= cat.goal!;
    barColor = barOverspent
      ? colors.negative
      : funded
        ? colors.positive
        : colors.warning;
  } else if (hasGoal) {
    // Monthly goal (simple, periodic): spending progress vs goal
    const base = cat.goal!;
    barSpent = Math.min(spentAbs / base, 1);
    barAvailable = Math.min(Math.max((spentAbs + cat.balance) / base, 0), 1);
    barOverspent = cat.balance < 0;
    const funded = cat.budgeted >= base;
    barColor = barOverspent
      ? colors.negative
      : funded
        ? colors.positive
        : colors.warning;
  } else if (budgetedAbs > 0 || cat.balance !== 0) {
    // No goal: spending progress vs budgeted (or balance from carryover)
    const base = budgetedAbs > 0 ? budgetedAbs : Math.abs(cat.balance);
    barSpent = base > 0 ? Math.min(spentAbs / base, 1) : 0;
    barAvailable = base > 0 ? Math.min(Math.max((spentAbs + cat.balance) / base, 0), 1) : 0;
    barOverspent = cat.balance < 0;
    barColor = barOverspent
      ? colors.negative
      : cat.balance > 0
        ? colors.positive
        : colors.textMuted;
  }

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
            autoFocus={autoFocusInput}
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

      {/* Line 2: Progress bar (YNAB-style spending progress) */}
      {showProgressBar && (
        <ProgressBar
          spent={barSpent}
          available={barAvailable}
          color={barColor}
          overspent={barOverspent}
          style={{ marginTop: 6 }}
        />
      )}

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
});
