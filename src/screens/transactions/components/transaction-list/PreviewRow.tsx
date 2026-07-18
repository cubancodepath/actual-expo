import { memo } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Chip, Separator, Typography } from "heroui-native";
import { Money } from "@/ui/Money";
import type { PreviewTransaction } from "@/core/domain/schedules";

interface PreviewRowProps {
  preview: PreviewTransaction;
  /** First row of its date block — no separator above it. */
  isFirst: boolean;
}

/**
 * Read-only ledger row for an upcoming (scheduled) transaction inside the
 * "Upcoming" accordion. Mirrors TransactionRow's structure — a `bg-surface`
 * strip with a hairline separator above (so consecutive rows read as one card
 * and the date headers break onto the page background) — but has no press
 * handlers and reads muted to signal it hasn't posted yet. Status pills,
 * direction arrows and tap-through come in a later iteration.
 */
export const PreviewRow = memo(function PreviewRow({ preview, isFirst }: PreviewRowProps) {
  const { t } = useTranslation("transactions");

  return (
    <View className="bg-surface">
      {!isFirst && <Separator className="ml-4" />}
      <View className="w-full gap-0.5 px-4 py-2.5 opacity-70">
        <View className="flex-row items-center gap-2">
          <Typography className="flex-1 text-base italic text-muted" numberOfLines={1}>
            {preview.payeeName || t("noPayee")}
          </Typography>
          <Money cents={preview.amount} />
        </View>
        <View className="flex-row items-center gap-2">
          <View className="flex-1 flex-row">
            <Chip
              variant="soft"
              color="default"
              size="sm"
              pointerEvents="none"
              className="rounded-md"
            >
              <Chip.Label numberOfLines={1} className="text-muted font-normal italic">
                {preview.categoryName ?? t("uncategorized")}
              </Chip.Label>
            </Chip>
          </View>
        </View>
      </View>
    </View>
  );
});
