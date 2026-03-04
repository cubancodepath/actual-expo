import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useThemedStyles } from '../../providers/ThemeProvider';
import { Text, Amount } from '..';
import { SwipeableRow } from '../molecules/SwipeableRow';
import type { TransactionDisplay } from '../../../transactions';
import type { Theme } from '../../../theme';

interface TransactionRowProps {
  item: TransactionDisplay;
  onPress: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleCleared: (id: string) => void;
  showAccountName?: boolean;
  isFirst?: boolean;
  isLast?: boolean;
}

export function TransactionRow({
  item,
  onPress,
  onDelete,
  onToggleCleared,
  showAccountName,
  isFirst = false,
  isLast = false,
}: TransactionRowProps) {
  const { colors, spacing, borderRadius: br, borderWidth: bw } = useTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <SwipeableRow
      onDelete={() => onDelete(item.id)}
      isFirst={isFirst}
      isLast={isLast}
      style={{ marginHorizontal: spacing.lg }}
    >
    <Pressable
      style={({ pressed }) => [
        styles.row,
        !isLast && { borderBottomWidth: bw.thin, borderBottomColor: colors.divider },
        pressed && styles.pressed,
      ]}
      onPress={() => onPress(item.id)}
    >
      <View style={styles.content}>
        {/* Top row: payee + amount */}
        <View style={styles.topRow}>
          <View style={styles.payeeRow}>
            {item.transferred_id != null && (
              <Ionicons name="swap-horizontal" size={14} color={colors.primary} style={{ marginRight: spacing.xs }} />
            )}
            <Text variant="body" numberOfLines={1} style={{ flex: 1, fontWeight: '500' as const }}>
              {item.payeeName ?? '(no payee)'}
            </Text>
          </View>
          <View style={styles.amountRow}>
            <Amount value={item.amount} variant="body" showSign style={{ fontWeight: '600' as const }} />
            <Pressable
              onPress={() => { if (!item.reconciled) onToggleCleared(item.id); }}
              hitSlop={10}
              style={{ marginLeft: spacing.sm }}
            >
              {item.reconciled ? (
                <Ionicons name="lock-closed" size={14} color={colors.primary} />
              ) : (
                <Ionicons
                  name={item.cleared ? 'checkmark-circle' : 'ellipse-outline'}
                  size={14}
                  color={item.cleared ? colors.positive : colors.textMuted}
                />
              )}
            </Pressable>
          </View>
        </View>

        {/* Category + account name row */}
        {(item.categoryName || (showAccountName && item.accountName)) && (
          <View style={styles.metaRow}>
            {item.categoryName ? (
              <View style={styles.categoryPill}>
                <Text variant="captionSm" color={colors.textSecondary}>
                  {item.categoryName}
                </Text>
              </View>
            ) : <View />}
            {showAccountName && item.accountName && (
              <Text variant="captionSm" color={colors.textMuted}>
                {item.accountName}
              </Text>
            )}
          </View>
        )}

        {/* Notes */}
        {item.notes && (
          <Text
            variant="caption"
            color={colors.textMuted}
            numberOfLines={1}
            style={{ fontStyle: 'italic', marginTop: spacing.xxs }}
          >
            {item.notes}
          </Text>
        )}
      </View>

      {/* Navigation chevron */}
      <Ionicons
        name="chevron-forward"
        size={16}
        color={colors.textMuted}
        style={styles.chevron}
      />
    </Pressable>
    </SwipeableRow>
  );
}

const createStyles = (theme: Theme) => ({
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: theme.colors.cardBackground,
    paddingVertical: theme.spacing.md,
    paddingLeft: theme.spacing.lg,
    paddingRight: theme.spacing.md,
  },
  pressed: {
    opacity: 0.7,
  },
  content: {
    flex: 1,
  },
  topRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'flex-start' as const,
  },
  payeeRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    flex: 1,
    marginRight: theme.spacing.md,
  },
  amountRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  metaRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginTop: theme.spacing.xs,
  },
  categoryPill: {
    backgroundColor: theme.colors.buttonSecondaryBackground,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xxs,
    borderRadius: theme.borderRadius.full,
  },
  chevron: {
    marginLeft: theme.spacing.sm,
  },
});
