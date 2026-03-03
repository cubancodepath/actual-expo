import { Pressable, View } from 'react-native';
import { AntDesign, Ionicons } from '@expo/vector-icons';
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
}

export function TransactionRow({
  item,
  onPress,
  onDelete,
  onToggleCleared,
}: TransactionRowProps) {
  const { colors, spacing } = useTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <SwipeableRow onDelete={() => onDelete(item.id)}>
    <Pressable
      style={styles.row}
      onPress={() => onPress(item.id)}
    >
      <View style={styles.content}>
        {/* Top row: payee + amount */}
        <View style={styles.topRow}>
          <View style={styles.payeeRow}>
            {item.transferred_id != null && (
              <Ionicons name="swap-horizontal" size={14} color={colors.primary} style={{ marginRight: spacing.xs }} />
            )}
            <Text variant="bodyLg" numberOfLines={1} style={{ flex: 1 }}>
              {item.payeeName ?? '(no payee)'}
            </Text>
          </View>
          <View style={styles.amountRow}>
            <Amount value={item.amount} variant="bodyLg" showSign />
            <Pressable
              onPress={() => { if (!item.reconciled) onToggleCleared(item.id); }}
              hitSlop={10}
              style={{ marginLeft: spacing.sm }}
            >
              {item.reconciled ? (
                <Ionicons name="lock-closed" size={16} color={colors.primary} />
              ) : (
                <AntDesign
                  name={item.cleared ? 'copyright-circle' : 'copyright'}
                  size={16}
                  color={item.cleared ? colors.primary : colors.textMuted}
                />
              )}
            </Pressable>
          </View>
        </View>

        {/* Category pill */}
        {item.categoryName && (
          <View style={styles.categoryPill}>
            <Text variant="captionSm" color={colors.textSecondary}>
              {item.categoryName}
            </Text>
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
    </Pressable>
    </SwipeableRow>
  );
}

const createStyles = (theme: Theme) => ({
  row: {
    flexDirection: 'row' as const,
    backgroundColor: theme.colors.cardBackground,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
  },
  content: {
    flex: 1,
  },
  topRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
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
  categoryPill: {
    alignSelf: 'flex-start' as const,
    backgroundColor: theme.colors.buttonSecondaryBackground,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xxs,
    borderRadius: theme.borderRadius.full,
    marginTop: theme.spacing.xs,
  },
});
