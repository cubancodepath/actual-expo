import { useEffect } from 'react';
import { Platform, Pressable, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as ContextMenu from 'zeego/context-menu';
import { useTheme, useThemedStyles } from '../../providers/ThemeProvider';
import { Text, Amount, NotesWithTags } from '..';
import { formatAmount } from '../../../lib/format';
import { SwipeableRow } from '../molecules/SwipeableRow';
import type { TransactionDisplay } from '../../../transactions';
import type { Tag } from '../../../tags/types';
import type { Theme } from '../../../theme';

interface TransactionRowProps {
  item: TransactionDisplay;
  onPress: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleCleared: (id: string) => void;
  onLongPress?: (id: string) => void;
  onDuplicate?: (id: string) => void;
  onMove?: (id: string, targetAccountId: string) => void;
  onAddTag?: (id: string) => void;
  showAccountName?: boolean;
  tags?: Tag[];
  moveAccounts?: Array<{ id: string; name: string }>;
  isFirst?: boolean;
  isLast?: boolean;
  isSelectMode?: boolean;
  isSelected?: boolean;
}

export function TransactionRow({
  item,
  onPress,
  onDelete,
  onToggleCleared,
  onLongPress,
  onDuplicate,
  onMove,
  onAddTag,
  showAccountName,
  tags,
  moveAccounts,
  isFirst = false,
  isLast = false,
  isSelectMode = false,
  isSelected = false,
}: TransactionRowProps) {
  const { colors, spacing, borderWidth: bw } = useTheme();
  const styles = useThemedStyles(createStyles);

  // Select mode micro-animation: gentle shift when entering
  const selectAnim = useSharedValue(0);
  useEffect(() => {
    selectAnim.value = withTiming(isSelectMode ? 1 : 0, {
      duration: 300,
      easing: Easing.inOut(Easing.ease),
    });
  }, [isSelectMode]);

  const selectModeStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(selectAnim.value, [0, 1], [0, 2]) },
    ],
  }));

  const rowContent = (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        pressed && styles.pressed,
        isSelected && { backgroundColor: colors.primary + '12' },
      ]}
      onPress={() => {
        if (isSelectMode) {
          onLongPress?.(item.id);
        } else {
          onPress(item.id);
        }
      }}
      onLongPress={
        // On iOS, ContextMenu handles long-press natively (when not in select mode)
        // On Android, keep long-press for select mode
        Platform.OS === 'android' || isSelectMode
          ? () => onLongPress?.(item.id)
          : undefined
      }
    >
      {/* Selection checkbox */}
      {isSelectMode && (
        <Animated.View
          entering={FadeIn.duration(180).easing(Easing.out(Easing.quad))}
          exiting={FadeOut.duration(150).easing(Easing.in(Easing.quad))}
          style={styles.checkbox}
        >
          <Ionicons
            name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
            size={22}
            color={isSelected ? colors.primary : colors.textMuted}
          />
        </Animated.View>
      )}

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
            {!isSelectMode && (
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
            )}
          </View>
        </View>

        {/* Category + account name row */}
        {item.isParent && item.splitCategoryNames ? (
          <>
            {(() => {
              const names = item.splitCategoryNames.split('||');
              const amounts = item.splitCategoryAmounts?.split('||') ?? [];
              return names.map((name, i) => (
                <View key={i} style={styles.splitLineRow}>
                  <View style={styles.categoryPill}>
                    <Text variant="captionSm" color={colors.textSecondary} numberOfLines={1}>
                      {name || 'No category'}
                    </Text>
                  </View>
                  <Text variant="captionSm" color={colors.textMuted} style={{ fontVariant: ['tabular-nums'] }}>
                    {formatAmount(Math.abs(Number(amounts[i]) || 0))}
                  </Text>
                  {i === 0 && showAccountName && item.accountName && (
                    <>
                      <View style={{ flex: 1 }} />
                      <Text variant="captionSm" color={colors.textMuted} numberOfLines={1} style={{ flexShrink: 0 }}>
                        {item.accountName}
                      </Text>
                    </>
                  )}
                </View>
              ));
            })()}
          </>
        ) : (item.categoryName || (showAccountName && item.accountName)) && (
          <View style={styles.metaRow}>
            {item.categoryName ? (
              <View style={styles.categoryPill}>
                <Text variant="captionSm" color={colors.textSecondary} numberOfLines={1}>
                  {item.categoryName}
                </Text>
              </View>
            ) : <View />}
            {showAccountName && item.accountName && (
              <Text variant="captionSm" color={colors.textMuted} numberOfLines={1} style={{ flexShrink: 0 }}>
                {item.accountName}
              </Text>
            )}
          </View>
        )}

        {/* Notes with inline tag pills */}
        {item.notes && (
          <NotesWithTags notes={item.notes} tags={tags} />
        )}
      </View>

      {/* Inset separator (HIG) — doesn't touch container edges */}
      {!isLast && (
        <View
          style={{
            position: 'absolute',
            bottom: 0,
            left: spacing.lg,
            right: spacing.md,
            height: bw.thin,
            backgroundColor: colors.divider,
          }}
        />
      )}
    </Pressable>
  );

  // In select mode, no SwipeableRow and no ContextMenu
  if (isSelectMode) {
    return (
      <Animated.View style={selectModeStyle}>
        {rowContent}
      </Animated.View>
    );
  }

  const swipeableContent = (
    <SwipeableRow
      onDelete={() => onDelete(item.id)}
      onSwipeRight={item.reconciled ? undefined : () => onToggleCleared(item.id)}
      swipeRightIcon={item.cleared ? 'ellipse-outline' : 'checkmark-circle'}
      swipeRightColor={item.cleared ? colors.textMuted : colors.positive}
      isFirst={isFirst}
      isLast={isLast}
      style={{ marginHorizontal: spacing.lg }}
    >
      {rowContent}
    </SwipeableRow>
  );

  // Wrap in zeego ContextMenu on iOS
  if (Platform.OS === 'ios') {
    return (
      <ContextMenu.Root>
        <ContextMenu.Trigger>{swipeableContent}</ContextMenu.Trigger>
        <ContextMenu.Content>
          {!item.reconciled && (
            <ContextMenu.Item
              key="toggle-cleared"
              onSelect={() => onToggleCleared(item.id)}
            >
              <ContextMenu.ItemTitle>
                {item.cleared ? 'Unclear' : 'Clear'}
              </ContextMenu.ItemTitle>
              <ContextMenu.ItemIcon
                ios={{ name: item.cleared ? 'circle' : 'checkmark.circle' }}
              />
            </ContextMenu.Item>
          )}
          <ContextMenu.Item
            key="duplicate"
            onSelect={() => onDuplicate?.(item.id)}
          >
            <ContextMenu.ItemTitle>Duplicate</ContextMenu.ItemTitle>
            <ContextMenu.ItemIcon ios={{ name: 'doc.on.doc' }} />
          </ContextMenu.Item>
          {moveAccounts && moveAccounts.length > 0 && (
            <ContextMenu.Sub>
              <ContextMenu.SubTrigger key="move">
                <ContextMenu.ItemTitle>Move to...</ContextMenu.ItemTitle>
                <ContextMenu.ItemIcon ios={{ name: 'arrow.right.arrow.left' }} />
              </ContextMenu.SubTrigger>
              <ContextMenu.SubContent>
                {moveAccounts.map(acc => (
                  <ContextMenu.Item
                    key={acc.id}
                    onSelect={() => onMove?.(item.id, acc.id)}
                  >
                    <ContextMenu.ItemTitle>{acc.name}</ContextMenu.ItemTitle>
                  </ContextMenu.Item>
                ))}
              </ContextMenu.SubContent>
            </ContextMenu.Sub>
          )}
          <ContextMenu.Item
            key="add-tag"
            onSelect={() => onAddTag?.(item.id)}
          >
            <ContextMenu.ItemTitle>Add Tag</ContextMenu.ItemTitle>
            <ContextMenu.ItemIcon ios={{ name: 'tag' }} />
          </ContextMenu.Item>
          <ContextMenu.Separator />
          <ContextMenu.Item
            key="delete"
            destructive
            onSelect={() => onDelete(item.id)}
          >
            <ContextMenu.ItemTitle>Delete</ContextMenu.ItemTitle>
            <ContextMenu.ItemIcon ios={{ name: 'trash' }} />
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Root>
    );
  }

  return swipeableContent;
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
  checkbox: {
    marginRight: theme.spacing.sm,
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
    gap: theme.spacing.sm,
  },
  splitLineRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginTop: theme.spacing.xs,
    gap: theme.spacing.xs,
  },
  categoryPill: {
    backgroundColor: theme.colors.buttonSecondaryBackground,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xxs,
    borderRadius: theme.borderRadius.full,
    flexShrink: 1,
    maxWidth: '70%' as unknown as number,
  },
});
