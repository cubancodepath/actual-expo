import { Fragment, useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Separator, Typography, useThemeColor } from "heroui-native";
import { CalendarClock, ChevronDown, Repeat2 } from "lucide-react-native";
import type { ScheduleTemplate } from "@/core/types/models";
import type { Schedule } from "@/core/types/models";
import { AdjustmentField } from "../fields/AdjustmentField";
import { FieldRow } from "../fields/FieldRow";
import { SelectFieldRow } from "../fields/SelectFieldRow";
import { SchedulePickerSheet } from "../SchedulePickerSheet";

type SavingsMode = "saveUp" | "full";

/**
 * Rows for a schedule-derived amount — rendered inside the goal editor's card
 * when Custom's "Based on" picks a schedule. Both the id and the name are
 * stored: the engine matches on either, and desktop's note format
 * (`#template schedule Internet`) only carries the name.
 */
export function ScheduleRows({
  template,
  schedules,
  onChange,
}: {
  template: ScheduleTemplate;
  schedules: Schedule[];
  onChange: (next: ScheduleTemplate) => void;
}) {
  const { t } = useTranslation("budget");
  const muted = useThemeColor("muted");
  const [pickerOpen, setPickerOpen] = useState(false);

  const linked = schedules.find((s) =>
    template.scheduleId ? s.id === template.scheduleId : s.name === template.name,
  );

  return (
    <Fragment>
      <FieldRow onPress={() => setPickerOpen(true)}>
        <FieldRow.Icon icon={CalendarClock} />
        <FieldRow.Content>
          <FieldRow.Label>{t("goals.fields.schedule")}</FieldRow.Label>
          <View className="flex-row items-center justify-between">
            <Typography className="text-base text-foreground">
              {linked?.name ?? t("goals.notLinked")}
            </Typography>
            <ChevronDown size={16} color={muted} />
          </View>
        </FieldRow.Content>
      </FieldRow>
      <Separator className="mx-4" />
      {/* The schedule's own "next time I want to": save toward it, or pay it
          whole when it lands. */}
      <SelectFieldRow<SavingsMode>
        icon={Repeat2}
        label={t("goals.fixed.nextTime")}
        value={template.full ? "full" : "saveUp"}
        choices={[
          { value: "saveUp", label: t("goals.savingsMode.saveUp") },
          { value: "full", label: t("goals.savingsMode.full") },
        ]}
        onChange={(mode) => onChange({ ...template, full: mode === "full" })}
      />
      <Separator className="mx-4" />
      <AdjustmentField value={template} onChange={(adj) => onChange({ ...template, ...adj })} />

      <SchedulePickerSheet
        isOpen={pickerOpen}
        onOpenChange={setPickerOpen}
        schedules={schedules}
        selectedId={linked?.id}
        onSelect={(schedule) =>
          onChange({ ...template, scheduleId: schedule.id, name: schedule.name ?? undefined })
        }
      />
    </Fragment>
  );
}
