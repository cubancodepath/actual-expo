import { memo } from "react";
import { Platform, Pressable, View } from "react-native";
import { Icon } from "../atoms/Icon";
import { ContextMenu } from "../atoms/ContextMenu";
import { useTheme, useThemedStyles } from "../../providers/ThemeProvider";
import { Text, Amount } from "..";
import { ScheduleStatusBadge } from "../atoms/ScheduleStatusBadge";
import { SwipeableRow } from "../molecules/SwipeableRow";
import type { PreviewTransaction } from "../../../schedules/preview";
import type { Theme } from "../../../theme";

interface UpcomingScheduleRowProps {
  item: PreviewTransaction;
  onPost: (scheduleId: string) => void;
  onPostToday: (scheduleId: string) => void;
  onSkip: (scheduleId: string) => void;
  onComplete: (scheduleId: string) => void;
  onDelete: (scheduleId: string) => void;
  onPress: (scheduleId: string) => void;
  showAccountName?: boolean;
  isFirst?: boolean;
  isLast?: boolean;
}

export const UpcomingScheduleRow = memo(function UpcomingScheduleRow({
  item,
  onPost,
  onPostToday,
  onSkip,
  onComplete,
  onDelete,
  onPress,
  showAccountName,
  isFirst = false,
  isLast = false,
}: UpcomingScheduleRowProps) {
  const { colors, spacing, borderWidth: bw } = useTheme();
  const styles = useThemedStyles(createStyles);

  const rowContent = (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      onPress={() => onPress(item.scheduleId)}
    >
      <View style={styles.content}>
        {/* Top row: payee + amount */}
        <View style={styles.topRow}>
          <View style={styles.payeeRow}>
            <Icon
              name={item.isRecurring ? "repeat" : "calendarOutline"}
              size={14}
              color={colors.primary}
              style={{ marginRight: spacing.xs }}
            />
            <Text variant="body" numberOfLines={1} style={{ flex: 1, fontWeight: "500" }}>
              {item.payeeName}
            </Text>
          </View>
          <Amount value={item.amount} variant="body" showSign style={{ fontWeight: "600" }} />
        </View>

        {/* Bottom row: status badge + category + account name */}
        <View style={styles.metaRow}>
          <ScheduleStatusBadge status={item.status} />
          {item.categoryName && (
            <View style={styles.categoryPill}>
              <Text variant="captionSm" color={colors.textSecondary} numberOfLines={1}>
                {item.categoryName}
              </Text>
            </View>
          )}
          {showAccountName && item.accountName && (
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
      </View>

      {/* Inset separator */}
      {!isLast && (
        <View
          style={{
            position: "absolute",
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

  const swipeableContent = (
    <SwipeableRow
      onDelete={() => onSkip(item.scheduleId)}
      onSwipeRight={() => onPost(item.scheduleId)}
      swipeRightIcon="checkmarkCircle"
      swipeRightColor={colors.positive}
      isFirst={isFirst}
      isLast={isLast}
    >
      {rowContent}
    </SwipeableRow>
  );

  if (Platform.OS === "ios") {
    return (
      <ContextMenu>
        <ContextMenu.Trigger>{swipeableContent}</ContextMenu.Trigger>
        <ContextMenu.Content>
          <ContextMenu.Item key="edit" onSelect={() => onPress(item.scheduleId)}>
            <ContextMenu.ItemTitle>Edit Schedule</ContextMenu.ItemTitle>
            <ContextMenu.ItemIcon ios={{ name: "pencil" }} />
          </ContextMenu.Item>
          <ContextMenu.Separator />
          <ContextMenu.Item key="post" onSelect={() => onPost(item.scheduleId)}>
            <ContextMenu.ItemTitle>Post Transaction</ContextMenu.ItemTitle>
            <ContextMenu.ItemIcon ios={{ name: "checkmark.circle" }} />
          </ContextMenu.Item>
          <ContextMenu.Item key="post-today" onSelect={() => onPostToday(item.scheduleId)}>
            <ContextMenu.ItemTitle>Post as Today</ContextMenu.ItemTitle>
            <ContextMenu.ItemIcon ios={{ name: "calendar.badge.checkmark" }} />
          </ContextMenu.Item>
          <ContextMenu.Separator />
          <ContextMenu.Item key="skip" onSelect={() => onSkip(item.scheduleId)}>
            <ContextMenu.ItemTitle>Skip</ContextMenu.ItemTitle>
            <ContextMenu.ItemIcon ios={{ name: "forward.end" }} />
          </ContextMenu.Item>
          <ContextMenu.Item key="complete" onSelect={() => onComplete(item.scheduleId)}>
            <ContextMenu.ItemTitle>Complete</ContextMenu.ItemTitle>
            <ContextMenu.ItemIcon ios={{ name: "checkmark.seal" }} />
          </ContextMenu.Item>
          <ContextMenu.Separator />
          <ContextMenu.Item key="delete" destructive onSelect={() => onDelete(item.scheduleId)}>
            <ContextMenu.ItemTitle>Delete</ContextMenu.ItemTitle>
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
    backgroundColor: theme.colors.primarySubtle,
    paddingVertical: theme.spacing.md,
    paddingLeft: theme.spacing.lg,
    paddingRight: theme.spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: "rgba(135, 25, 224, 0.35)",
  },
  pressed: {
    opacity: 0.8,
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
  categoryPill: {
    backgroundColor: theme.colors.buttonSecondaryBackground,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xxs,
    borderRadius: theme.borderRadius.full,
    flexShrink: 1,
    maxWidth: "70%" as unknown as number,
  },
});
