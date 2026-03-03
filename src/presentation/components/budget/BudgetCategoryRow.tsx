import { Pressable, TextInput, View } from 'react-native';
import { useTheme } from '../../providers/ThemeProvider';
import { Text } from '../atoms/Text';
import { formatBalance } from '../../../lib/format';
import type { BudgetCategory } from '../../../budgets/types';

const COL_BUDGET = 76;
const COL_SPENT = 68;
const COL_BAL = 72;

interface BudgetCategoryRowProps {
  cat: BudgetCategory;
  isIncome: boolean;
  isEditing: boolean;
  editValue: string;
  onEditValueChange: (value: string) => void;
  onStartEdit: (id: string, currentCents: number) => void;
  onSaveEdit: () => void;
  onLongPress: (cat: BudgetCategory) => void;
  onBalancePress: (cat: BudgetCategory) => void;
}

export function BudgetCategoryRow({
  cat,
  isIncome,
  isEditing,
  editValue,
  onEditValueChange,
  onStartEdit,
  onSaveEdit,
  onLongPress,
  onBalancePress,
}: BudgetCategoryRowProps) {
  const { colors, spacing, borderWidth: bw } = useTheme();

  const rowStyle = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: spacing.lg,
    paddingVertical: 13,
    borderBottomWidth: bw.thin,
    borderBottomColor: colors.divider,
    backgroundColor: colors.pageBackground,
  };

  if (isIncome) {
    return (
      <View style={rowStyle}>
        <Text variant="body" style={{ flex: 1 }} numberOfLines={1}>
          {cat.name}
        </Text>
        <Text
          variant="body"
          color={colors.positive}
          style={{ width: COL_BAL, textAlign: 'right', fontVariant: ['tabular-nums'] }}
        >
          {formatBalance(cat.spent)}
        </Text>
      </View>
    );
  }

  return (
    <Pressable
      style={rowStyle}
      onLongPress={() => onLongPress(cat)}
      delayLongPress={400}
    >
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
        style={{ width: COL_BUDGET, alignItems: 'flex-end' }}
        onPress={() => onStartEdit(cat.id, cat.budgeted)}
      >
        {isEditing ? (
          <TextInput
            style={{
              color: colors.link,
              fontSize: 14,
              fontWeight: '600',
              textAlign: 'right',
              padding: 0,
              minWidth: 56,
              borderBottomWidth: 1,
              borderBottomColor: colors.link,
            }}
            value={editValue}
            onChangeText={onEditValueChange}
            onBlur={onSaveEdit}
            onSubmitEditing={onSaveEdit}
            keyboardType="decimal-pad"
            autoFocus
            selectTextOnFocus
          />
        ) : (
          <Text
            variant="body"
            color={cat.budgeted === 0 ? colors.textMuted : undefined}
            style={{ textAlign: 'right', fontWeight: '500', fontVariant: ['tabular-nums'] }}
          >
            {formatBalance(cat.budgeted)}
          </Text>
        )}
      </Pressable>

      <Text
        variant="body"
        color={cat.spent < 0 ? colors.textSecondary : colors.textMuted}
        style={{ width: COL_SPENT, textAlign: 'right', fontVariant: ['tabular-nums'] }}
      >
        {cat.spent !== 0 ? formatBalance(cat.spent) : '—'}
      </Text>

      <Pressable
        style={{ width: COL_BAL, alignItems: 'flex-end' }}
        onPress={() => onBalancePress(cat)}
        hitSlop={4}
      >
        <Text
          variant="body"
          color={
            cat.balance < 0
              ? colors.negative
              : cat.balance > 0
                ? colors.positive
                : colors.textMuted
          }
          style={{ textAlign: 'right', fontWeight: '500', fontVariant: ['tabular-nums'] }}
        >
          {formatBalance(cat.balance)}
        </Text>
        {cat.carryIn !== 0 && (
          <Text
            variant="captionSm"
            color={cat.carryIn < 0 ? colors.negative : colors.positive}
            style={{ textAlign: 'right', marginTop: 1, fontWeight: '600' }}
          >
            {cat.carryIn > 0 ? '+' : ''}
            {formatBalance(cat.carryIn)}
          </Text>
        )}
      </Pressable>
    </Pressable>
  );
}
