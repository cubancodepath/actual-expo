import { useTranslation } from "react-i18next";
import { ListGroup, Separator } from "heroui-native";
import { Segment } from "heroui-native-pro";
import type { AverageTemplate, CopyTemplate } from "@/core/domain/goals/types";
import { AdjustmentField } from "../fields/AdjustmentField";
import { OptionRow } from "../fields/OptionRow";
import { StepperRow } from "../fields/StepperRow";

type Template = AverageTemplate | CopyTemplate;
type Mode = "average" | "copy";

/**
 * Budget from what this category did before: the average of the last N months,
 * or a straight copy of one earlier month.
 */
export function HistoricalEditor({
  template,
  onChange,
}: {
  template: Template;
  onChange: (next: Template) => void;
}) {
  const { t } = useTranslation("budget");

  const mode: Mode = template.type === "average" ? "average" : "copy";

  const setMode = (next: Mode) => {
    if (next === mode) return;
    if (next === "average") {
      onChange({
        type: "average",
        numMonths: 3,
        priority: template.priority,
        directive: "template",
      });
    } else {
      onChange({
        type: "copy",
        lookBack: 1,
        priority: template.priority,
        directive: "template",
      });
    }
  };

  return (
    <ListGroup>
      <OptionRow label={t("goals.fields.basedOn")}>
        <Segment value={mode} size="sm" onValueChange={(v) => setMode(v as Mode)}>
          <Segment.Group>
            <Segment.Indicator />
            <Segment.Item value="average">
              <Segment.Label>{t("goals.historical.average")}</Segment.Label>
            </Segment.Item>
            <Segment.Item value="copy">
              <Segment.Label>{t("goals.historical.copy")}</Segment.Label>
            </Segment.Item>
          </Segment.Group>
        </Segment>
      </OptionRow>
      <Separator className="mx-4" />

      {template.type === "average" ? (
        <>
          <StepperRow
            label={t("goals.fields.lookBackMonths")}
            value={template.numMonths}
            onChange={(numMonths) => onChange({ ...template, numMonths })}
            minValue={1}
            maxValue={24}
          />
          <Separator className="mx-4" />
          <AdjustmentField value={template} onChange={(adj) => onChange({ ...template, ...adj })} />
        </>
      ) : (
        <StepperRow
          label={t("goals.fields.copyFrom")}
          description={t("goals.fields.copyFromHint")}
          value={template.lookBack}
          onChange={(lookBack) => onChange({ ...template, lookBack })}
          minValue={1}
          maxValue={24}
        />
      )}
    </ListGroup>
  );
}
