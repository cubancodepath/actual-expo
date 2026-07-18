import { Fragment, useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Accordion, Typography } from "heroui-native";
import type { PreviewTransaction } from "@/core/domain/schedules";
import { CollapsibleIndicator } from "@/ui/CollapsibleIndicator";
import { DateHeader } from "./DateHeader";
import { PreviewRow } from "./PreviewRow";

interface UpcomingSectionProps {
  previews: PreviewTransaction[];
}

/**
 * Collapsible "Upcoming" section shown at the top of a transactions list,
 * holding the schedule previews. Closed by default. Uses the same heroui
 * Accordion + Surface-card pattern as the budget groups. Rendered as the list's
 * ListHeaderComponent, so it scrolls with the transactions (not pinned).
 */
export function UpcomingSection({ previews }: UpcomingSectionProps) {
  const { t } = useTranslation("transactions");
  // Controlled + initialised empty → collapsed on mount.
  const [expanded, setExpanded] = useState<string[]>([]);

  return (
    <Accordion
      selectionMode="multiple"
      hideSeparator
      value={expanded}
      onValueChange={(v: string[]) => setExpanded(v)}
      className="mb-2"
    >
      <Accordion.Item value="upcoming">
        <Accordion.Trigger className="px-4 py-2">
          <View className="flex-1 flex-row items-center gap-2">
            <CollapsibleIndicator />
            <Typography className="text-sm font-semibold text-foreground">
              {t("upcoming")}
            </Typography>
            <Typography className="text-sm text-muted">{previews.length}</Typography>
          </View>
        </Accordion.Trigger>

        <Accordion.Content className="px-0 pb-0">
          {previews.map((preview, i) => {
            // Previews come date-descending; start a new date block whenever the
            // date changes. Date headers sit on the page background and the rows
            // on bg-surface, exactly like the real ledger.
            const isNewDate = i === 0 || previews[i - 1].date !== preview.date;
            return (
              <Fragment key={preview.id}>
                {isNewDate && <DateHeader date={preview.date} />}
                <PreviewRow preview={preview} isFirst={isNewDate} />
              </Fragment>
            );
          })}
        </Accordion.Content>
      </Accordion.Item>
    </Accordion>
  );
}
