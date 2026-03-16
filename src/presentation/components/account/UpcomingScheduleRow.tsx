import { memo } from "react";
import { Platform, Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ContextMenu from "zeego/context-menu";
import { useTheme, useThemedStyles } from "../../providers/ThemeProvider";
import { Text, Amount } from "..";
import { ScheduleStatusBadge } from "../atoms/ScheduleStatusBadge";
import { SwipeableRow } from "../molecules/SwipeableRow";
import { formatDateLong } from "../../../lib/date";
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
            <Ionicons
              name={item.isRecurring ? "repeat" : "calendar-outline"}
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

        {/* Bottom row: date + status badge */}
        <View style={styles.metaRow}>
          <Text variant="captionSm" color={colors.textSecondary}>
            {formatDateLong(item.date)}
          </Text>
          <ScheduleStatusBadge status={item.status} />
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
      swipeRightIcon="checkmark-circle"
      swipeRightColor={colors.positive}
      isFirst={isFirst}
      isLast={isLast}
      style={{ marginHorizontal: spacing.lg }}
    >
      {rowContent}
    </SwipeableRow>
  );

  if (Platform.OS === "ios") {
    return (
      <ContextMenu.Root>
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
      </ContextMenu.Root>
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
    opacity: 0.6,
  },
  pressed: {
    opacity: 0.7,
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
  metaRow: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    marginTop: theme.spacing.xs,
  },
});
