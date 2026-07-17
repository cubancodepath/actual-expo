import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { Separator } from "heroui-native";
import { CalendarSearch, History } from "lucide-react-native";
import type { AverageTemplate, CopyTemplate } from "@/core/domain/goals/types";
import { AdjustmentField } from "../fields/AdjustmentField";
import { SelectFieldRow } from "../fields/SelectFieldRow";
import { StepperFieldRow } from "../fields/StepperFieldRow";

type Template = AverageTemplate | CopyTemplate;
type Method = "average" | "copy";

/**
 * Rows for a history-derived amount — rendered inside the goal editor's card
 * when Custom's "Based on" picks past spending: the average of the last N
 * months, or a straight copy of one earlier month.
 */
export function HistoricalRows({
  template,
  onChange,
}: {
  template: Template;
  onChange: (next: Template) => void;
}) {
  const { t } = useTranslation("budget");

  const method: Method = template.type === "average" ? "average" : "copy";

  const setMethod = (next: Method) => {
    if (next === method) return;
    if (next === "average") {
      onChange({
        type: "average",
        numMonths: 3,
        priority: template.priority,
        directive: "template",
      });
    } else {
      onChange({ type: "copy", lookBack: 1, priority: template.priority, directive: "template" });
    }
  };

  return (
    <Fragment>
      <SelectFieldRow<Method>
        icon={History}
        label={t("goals.fields.method")}
        value={method}
        choices={[
          { value: "average", label: t("goals.historical.average") },
          { value: "copy", label: t("goals.historical.copy") },
        ]}
        onChange={setMethod}
      />
      <Separator className="mx-4" />

      {template.type === "average" ? (
        <Fragment>
          <StepperFieldRow
            icon={CalendarSearch}
            label={t("goals.fields.lookBackMonths")}
            value={template.numMonths}
            onChange={(numMonths) => onChange({ ...template, numMonths })}
            minValue={1}
            maxValue={24}
          />
          <Separator className="mx-4" />
          <AdjustmentField value={template} onChange={(adj) => onChange({ ...template, ...adj })} />
        </Fragment>
      ) : (
        <StepperFieldRow
          icon={CalendarSearch}
          label={t("goals.fields.copyFrom")}
          value={template.lookBack}
          onChange={(lookBack) => onChange({ ...template, lookBack })}
          minValue={1}
          maxValue={24}
        />
      )}
    </Fragment>
  );
}
