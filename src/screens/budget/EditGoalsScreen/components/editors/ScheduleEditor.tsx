import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ListGroup, Separator } from "heroui-native";
import type { ScheduleTemplate } from "@/core/domain/goals/types";
import type { Schedule } from "@/core/domain/schedules/types";
import { AdjustmentField } from "../fields/AdjustmentField";
import { OptionRow } from "../fields/OptionRow";
import { SelectRow } from "../fields/SelectRow";
import { SchedulePickerSheet } from "../SchedulePickerSheet";

type SavingsMode = "saveUp" | "full";

/**
 * Fund an existing schedule. Both the id and the name are stored: the engine
 * matches on either, and desktop's note format (`#template schedule Internet`)
 * only carries the name.
 */
export function ScheduleEditor({
  template,
  schedules,
  onChange,
}: {
  template: ScheduleTemplate;
  schedules: Schedule[];
  onChange: (next: ScheduleTemplate) => void;
}) {
  const { t } = useTranslation("budget");
  const [pickerOpen, setPickerOpen] = useState(false);

  const linked = schedules.find((s) =>
    template.scheduleId ? s.id === template.scheduleId : s.name === template.name,
  );

  return (
    <>
      <ListGroup>
        <OptionRow
          label={t("goals.fields.schedule")}
          value={linked?.name ?? t("goals.notLinked")}
          onPress={() => setPickerOpen(true)}
        />
        <Separator className="mx-4" />
        <SelectRow<SavingsMode>
          label={t("goals.fields.savingsMode")}
          description={
            template.full ? t("goals.savingsMode.fullHint") : t("goals.savingsMode.saveUpHint")
          }
          value={template.full ? "full" : "saveUp"}
          choices={[
            { value: "saveUp", label: t("goals.savingsMode.saveUp") },
            { value: "full", label: t("goals.savingsMode.full") },
          ]}
          onChange={(mode) => onChange({ ...template, full: mode === "full" })}
        />
        <Separator className="mx-4" />
        <AdjustmentField value={template} onChange={(adj) => onChange({ ...template, ...adj })} />
      </ListGroup>

      <SchedulePickerSheet
        isOpen={pickerOpen}
        onOpenChange={setPickerOpen}
        schedules={schedules}
        selectedId={linked?.id}
        onSelect={(schedule) =>
          onChange({ ...template, scheduleId: schedule.id, name: schedule.name ?? undefined })
        }
      />
    </>
  );
}
