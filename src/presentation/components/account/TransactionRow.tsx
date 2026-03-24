import { memo, useEffect } from "react";
import { Platform, Pressable, View } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useTranslation } from "react-i18next";
import { AnimatedView } from "../atoms/AnimatedView";
import { Icon } from "../atoms/Icon";
import { ContextMenu } from "../atoms/ContextMenu";
import { useTheme, useThemedStyles } from "../../providers/ThemeProvider";
import { Text, Amount, NotesWithTags, RowSeparator, Pill } from "..";
import { formatAmount } from "../../../lib/format";
import { SwipeableRow } from "../molecules/SwipeableRow";
import type { TransactionDisplay } from "@core/transactions";
import type { Tag } from "@core/tags/types";
import type { Theme } from "../../../theme";

interface TransactionRowProps {
  item: TransactionDisplay;
  onPress: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleCleared: (id: string) => void;
  onLongPress?: (id: string) => void;
  onDuplicate?: (id: string) => void;
  onMove?: (id: string) => void;
  onSetCategory?: (id: string) => void;
  onAddTag?: (id: string) => void;
  showAccountName?: boolean;
  tags?: Tag[];
  isFirst?: boolean;
  isLast?: boolean;
  isSelectMode?: boolean;
  isSelected?: boolean;
}

// EaseView transitions (state-driven visual animations)
const TIMING_CHECK_IN = { type: "timing" as const, duration: 450, easing: "easeOut" as const };
const TIMING_CHECK_OUT = { type: "timing" as const, duration: 350, easing: "easeOut" as const };
const NONE = { type: "none" as const };

// Reanimated timing for layout animation (checkbox width) — no bounce
const LAYOUT_ENTER = { duration: 500, easing: Easing.bezier(0.25, 0.1, 0.25, 1) };
const LAYOUT_EXIT = { duration: 400, easing: Easing.bezier(0.25, 0.1, 0.25, 1) };

// Checkbox: 22px icon + 8px marginRight = 30px total
const CHECKBOX_WIDTH = 30;

export const TransactionRow = memo(function TransactionRow({
  item,
  onPress,
  onDelete,
  onToggleCleared,
  onLongPress,
  onDuplicate,
  onMove,
  onSetCategory,
  onAddTag,
  showAccountName,
  tags,
  isFirst = false,
  isLast = false,
  isSelectMode = false,
  isSelected = false,
}: TransactionRowProps) {
  const { t } = useTranslation("transactions");
  const { colors, spacing } = useTheme();
  const styles = useThemedStyles(createStyles);
  const reducedMotion = useReducedMotion();
  const noAnim = reducedMotion ?? false;

  // Layout animation: checkbox container width (Reanimated — can't do layout with EaseView)
  const checkboxAnim = useSharedValue(isSelectMode ? 1 : 0);
  useEffect(() => {
    if (noAnim) {
      checkboxAnim.value = isSelectMode ? 1 : 0;
      return;
    }
    checkboxAnim.value = isSelectMode ? withTiming(1, LAYOUT_ENTER) : withTiming(0, LAYOUT_EXIT);
  }, [isSelectMode, noAnim]);

  const checkboxContainerStyle = useAnimatedStyle(() => ({
    width: interpolate(checkboxAnim.value, [0, 1], [0, CHECKBOX_WIDTH]),
    marginRight: interpolate(checkboxAnim.value, [0, 1], [0, 8]),
    overflow: "hidden" as const,
  }));

  const checkVisualTransition = noAnim ? NONE : isSelectMode ? TIMING_CHECK_IN : TIMING_CHECK_OUT;

  const rowContent = (
    <View
      style={{
        backgroundColor: isSelectMode && isSelected ? colors.primarySubtle : colors.cardBackground,
      }}
    >
      <Pressable
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        onPress={() => {
          if (isSelectMode) {
            onLongPress?.(item.id);
          } else {
            onPress(item.id);
          }
        }}
        onLongPress={
          Platform.OS === "android" || isSelectMode ? () => onLongPress?.(item.id) : undefined
        }
      >
        {/* Checkbox — Reanimated for layout (width), EaseView for visuals (opacity/scale) */}
        <Animated.View style={[styles.checkboxContainer, checkboxContainerStyle]}>
          <AnimatedView
            animate={{
              opacity: isSelectMode ? 1 : 0,
              scale: isSelectMode ? 1 : 0.5,
            }}
            transition={checkVisualTransition}
          >
            <View style={{ width: 22, height: 22 }}>
              <Icon name="ellipseOutline" size={22} color={colors.textMuted} />
              <AnimatedView
                style={{ position: "absolute" }}
                animate={{ scale: isSelected ? 1 : 0, opacity: isSelected ? 1 : 0 }}
                transition={{ type: "spring", damping: 12, stiffness: 300, mass: 0.6 }}
              >
                <Icon name="checkmarkCircle" size={22} color={colors.primary} />
              </AnimatedView>
            </View>
          </AnimatedView>
        </Animated.View>

        <View style={styles.content}>
          {/* Top row: payee + amount */}
          <View style={styles.topRow}>
            <View style={styles.payeeRow}>
              {item.transfer_id != null && (
                <Icon
                  name={item.amount < 0 ? "arrowForwardOutline" : "arrowBackOutline"}
                  size={14}
                  color={colors.textSecondary}
                  style={{ marginRight: spacing.xs }}
                />
              )}
              <Text
                variant="body"
                numberOfLines={1}
                style={{ flex: 1, fontWeight: "500" as const }}
              >
                {item.payeeName ?? t("noPayee")}
              </Text>
            </View>
            <View style={styles.amountRow}>
              <Amount
                value={item.transfer_id ? Math.abs(item.amount) : item.amount}
                variant="bodyLg"
                colored={false}
                color={!item.transfer_id && item.amount < 0 ? colors.negative : undefined}
                weight="700"
              />
              <View style={{ marginLeft: spacing.sm }}>
                {item.reconciled ? (
                  <Icon name="lockClosed" size={14} color={colors.primary} />
                ) : (
                  <Icon
                    name={item.cleared ? "checkmarkCircle" : "ellipseOutline"}
                    size={14}
                    color={item.cleared ? colors.positive : colors.textMuted}
                  />
                )}
              </View>
            </View>
          </View>

          {/* Category + account name row */}
          {item.is_parent && item.splitCategoryNames ? (
            <>
              {(() => {
                const names = item.splitCategoryNames.split("||");
                const amounts = item.splitCategoryAmounts?.split("||") ?? [];
                return names.map((name, i) => (
                  <View key={i} style={styles.splitLineRow}>
                    <Pill label={name || "No category"} size="sm" maxWidth="70%" />
                    <Text
                      variant="captionSm"
                      color={colors.textMuted}
                      style={{ fontVariant: ["tabular-nums"] }}
                    >
                      {formatAmount(Math.abs(Number(amounts[i]) || 0))}
                    </Text>
                    {i === 0 && showAccountName && item.accountName && (
                      <>
                        <View style={{ flex: 1 }} />
                        <Text
                          variant="captionSm"
                          color={colors.textMuted}
                          numberOfLines={1}
                          style={{ flexShrink: 0 }}
                        >
                          {item.accountName}
                        </Text>
                      </>
                    )}
                  </View>
                ));
              })()}
            </>
          ) : (
            <View style={styles.metaRow}>
              {item.transfer_id != null ? (
                <Pill
                  label={t("transfer")}
                  variant="primary"
                  fill="subtle"
                  size="sm"
                  maxWidth="70%"
                />
              ) : item.categoryName ? (
                <Pill label={item.categoryName} size="sm" maxWidth="70%" />
              ) : (
                <Pill
                  label={t("uncategorized")}
                  variant="warning"
                  fill="subtle"
                  size="sm"
                  maxWidth="70%"
                />
              )}
              {showAccountName && item.accountName && (
                <Text
                  variant="captionSm"
                  color={colors.textMuted}
                  numberOfLines={1}
                  style={{ flexShrink: 0 }}
                >
                  {item.accountName}
                </Text>
              )}
            </View>
          )}

          {/* Notes with inline tag pills */}
          {item.notes && <NotesWithTags notes={item.notes} tags={tags} />}
        </View>

        {!isLast && <RowSeparator />}
      </Pressable>
    </View>
  );

  // In select mode, no SwipeableRow and no ContextMenu
  if (isSelectMode) {
    return rowContent;
  }

  const swipeableContent = (
    <SwipeableRow
      onDelete={() => onDelete(item.id)}
      onSwipeRight={item.reconciled ? undefined : () => onToggleCleared(item.id)}
      swipeRightIcon={item.cleared ? "ellipseOutline" : "checkmarkCircle"}
      swipeRightColor={item.cleared ? colors.textMuted : colors.positive}
      isFirst={isFirst}
      isLast={isLast}
    >
      {rowContent}
    </SwipeableRow>
  );

  // Wrap in zeego ContextMenu on iOS
  if (Platform.OS === "ios") {
    return (
      <ContextMenu>
        <ContextMenu.Trigger>{swipeableContent}</ContextMenu.Trigger>
        <ContextMenu.Content>
          <ContextMenu.Item key="edit" onSelect={() => onPress(item.id)}>
            <ContextMenu.ItemTitle>{t("contextEdit")}</ContextMenu.ItemTitle>
            <ContextMenu.ItemIcon ios={{ name: "pencil" }} />
          </ContextMenu.Item>
          {!item.reconciled && (
            <ContextMenu.Item key="toggle-cleared" onSelect={() => onToggleCleared(item.id)}>
              <ContextMenu.ItemTitle>
                {item.cleared ? t("contextUnclear") : t("contextClear")}
              </ContextMenu.ItemTitle>
              <ContextMenu.ItemIcon ios={{ name: item.cleared ? "circle" : "checkmark.circle" }} />
            </ContextMenu.Item>
          )}
          <ContextMenu.Item key="duplicate" onSelect={() => onDuplicate?.(item.id)}>
            <ContextMenu.ItemTitle>{t("contextDuplicate")}</ContextMenu.ItemTitle>
            <ContextMenu.ItemIcon ios={{ name: "doc.on.doc" }} />
          </ContextMenu.Item>
          {onMove && (
            <ContextMenu.Item key="move" onSelect={() => onMove(item.id)}>
              <ContextMenu.ItemTitle>{t("contextMoveToAccount")}</ContextMenu.ItemTitle>
              <ContextMenu.ItemIcon ios={{ name: "arrow.right.arrow.left" }} />
            </ContextMenu.Item>
          )}
          {onSetCategory && (
            <ContextMenu.Item key="set-category" onSelect={() => onSetCategory(item.id)}>
              <ContextMenu.ItemTitle>{t("contextCategorize")}</ContextMenu.ItemTitle>
              <ContextMenu.ItemIcon ios={{ name: "tag" }} />
            </ContextMenu.Item>
          )}
          <ContextMenu.Item key="add-tag" onSelect={() => onAddTag?.(item.id)}>
            <ContextMenu.ItemTitle>{t("contextAddTag")}</ContextMenu.ItemTitle>
            <ContextMenu.ItemIcon ios={{ name: "number" }} />
          </ContextMenu.Item>
          <ContextMenu.Separator />
          <ContextMenu.Item key="delete" destructive onSelect={() => onDelete(item.id)}>
            <ContextMenu.ItemTitle>{t("contextDelete")}</ContextMenu.ItemTitle>
            <ContextMenu.ItemIcon ios={{ name: "trash" }} />
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu>
    );
  }

  return swipeableContent;
});

const createStyles = (theme: Theme) => ({
  row: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingVertical: theme.spacing.md,
    paddingLeft: theme.spacing.lg,
    paddingRight: theme.spacing.md,
  },
  pressed: {
    opacity: 0.7,
  },
  checkboxContainer: {
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  content: {
    flex: 1,
  },
  topRow: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "flex-start" as const,
  },
  payeeRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    flex: 1,
    marginRight: theme.spacing.md,
  },
  amountRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
  },
  metaRow: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    marginTop: theme.spacing.xs,
    gap: theme.spacing.sm,
  },
  splitLineRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    marginTop: theme.spacing.xs,
    gap: theme.spacing.xs,
  },
});
