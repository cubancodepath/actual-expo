import { memo, useRef } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Chip, cn, PressableFeedback, Separator, Typography } from "heroui-native";
import { Money } from "@/ui/Money";
import { mediumHaptic } from "@/ui/haptics";
import type { PreviewTransaction } from "@/core/server/schedules";
import type { ScheduleStatus } from "@/core/types/models";
import type { RowRect } from "./TransactionRowMenu";

/** Slow scale under a long press, matching TransactionRow's lift feel. */
const ROW_PRESS_ANIMATION = {
  scale: { value: 0.97, timingConfig: { duration: 450 } },
};

interface PreviewRowProps {
  preview: PreviewTransaction;
  /** First row of its date block — no separator above it. */
  isFirst: boolean;
  /** Open the schedule actions menu; `rect` is the row's window frame. */
  onLongPress?: (preview: PreviewTransaction, rect: RowRect) => void;
  /** Whether the menu is open on this row and its floating clone is up. */
  isLifted?: boolean;
}

/** Status → chip color + i18n key (schedules namespace). Others show no pill. */
type PillDef = {
  color: "warning" | "danger" | "default";
  key: "statusDue" | "statusMissed" | "statusUpcoming";
};
const STATUS_PILL: Partial<Record<ScheduleStatus, PillDef>> = {
  due: { color: "warning", key: "statusDue" },
  missed: { color: "danger", key: "statusMissed" },
  upcoming: { color: "default", key: "statusUpcoming" },
};

/**
 * Read-only ledger row for an upcoming (scheduled) transaction inside the
 * "Schedules" accordion. Mirrors TransactionRow's structure — a `bg-surface`
 * strip with a hairline separator above (so consecutive rows read as one card
 * and the date headers break onto the page background) — reads muted to signal
 * it hasn't posted yet, and carries a status pill (Due / Missed / Upcoming).
 * Long-press actions are wired by the parent (UpcomingSection).
 */
export const PreviewRow = memo(function PreviewRow({
  preview,
  isFirst,
  onLongPress,
  isLifted = false,
}: PreviewRowProps) {
  const { t } = useTranslation(["transactions", "schedules"]);
  // Previews always read as due / missed / upcoming; default to upcoming.
  const statusPill = STATUS_PILL[preview.status] ?? STATUS_PILL.upcoming!;
  const rowViewRef = useRef<View>(null);

  return (
    <View className="bg-surface">
      {!isFirst && <Separator className="ml-4" />}
      <PressableFeedback
        animation={ROW_PRESS_ANIMATION}
        isDisabled={!onLongPress}
        onLongPress={() => {
          if (!onLongPress) return;
          mediumHaptic();
          rowViewRef.current?.measureInWindow((x, y, width, height) => {
            onLongPress(preview, { x, y, width, height });
          });
        }}
      >
        <View
          ref={rowViewRef}
          className={cn("w-full gap-0.5 px-4 py-2.5 opacity-70", isLifted && "opacity-0")}
        >
          <View className="flex-row items-center gap-2">
            <Typography className="flex-1 text-base italic text-muted" numberOfLines={1}>
              {preview.payeeName || t("noPayee")}
            </Typography>
            <Money cents={preview.amount} />
          </View>
          {/* Like the original app, previews show their status in the category
              slot (Upcoming / Due / Missed) rather than the category itself. */}
          <View className="flex-row items-center gap-2">
            <View className="flex-1 flex-row">
              <Chip
                variant="soft"
                color={statusPill.color}
                size="sm"
                pointerEvents="none"
                className="rounded-md"
              >
                <Chip.Label numberOfLines={1} className="font-normal">
                  {t(statusPill.key, { ns: "schedules" })}
                </Chip.Label>
              </Chip>
            </View>
          </View>
        </View>
      </PressableFeedback>
    </View>
  );
});
