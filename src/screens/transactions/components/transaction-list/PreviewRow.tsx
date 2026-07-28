import { memo } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Chip, Separator, Typography } from "heroui-native";
import { Money } from "@/ui/Money";
import { LiftMenu, type RowRect } from "@/ui/lift-menu";
import type { PreviewTransaction } from "@/core/server/schedules";
import type { ScheduleStatus } from "@/core/types/models";
import { useSurfaceLevel } from "@/ui/surface-level";

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
 * "Schedules" accordion. Mirrors TransactionRow's structure — an `item`-rung
 * strip with a hairline separator above (so consecutive rows read as one card
 * and the date headers break onto the canvas) — reads muted to signal
 * it hasn't posted yet, and carries a status pill (Due / Missed / Upcoming).
 * Long-press actions are wired by the parent (UpcomingSection).
 */
export const PreviewRow = memo(function PreviewRow({
  preview,
  isFirst,
  onLongPress,
  isLifted = false,
}: PreviewRowProps) {
  const { item } = useSurfaceLevel();
  const { t } = useTranslation(["transactions", "schedules"]);
  // Previews always read as due / missed / upcoming; default to upcoming.
  const statusPill = STATUS_PILL[preview.status] ?? STATUS_PILL.upcoming!;

  return (
    <View className={item}>
      {!isFirst && <Separator className="ml-4" />}
      <LiftMenu.Row
        isDisabled={!onLongPress}
        onLongPress={onLongPress && ((rect) => onLongPress(preview, rect))}
        isLifted={isLifted}
        contentClassName="gap-0.5 px-4 py-2.5 opacity-70"
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
      </LiftMenu.Row>
    </View>
  );
});
