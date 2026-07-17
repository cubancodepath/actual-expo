import { useTranslation } from "react-i18next";
import { ListGroup } from "heroui-native";
import type { RemainderTemplate } from "@/core/domain/goals/types";
import { StepperRow } from "../fields/StepperRow";

/**
 * Takes whatever is left once every other category is funded. The weight is
 * relative: a category with weight 2 gets twice the share of one with weight 1.
 */
export function RemainderEditor({
  template,
  onChange,
}: {
  template: RemainderTemplate;
  onChange: (next: RemainderTemplate) => void;
}) {
  const { t } = useTranslation("budget");
  return (
    <ListGroup>
      <StepperRow
        label={t("goals.fields.weight")}
        description={t("goals.fields.weightHint")}
        value={template.weight}
        onChange={(weight) => onChange({ ...template, weight })}
        minValue={1}
        maxValue={10}
      />
    </ListGroup>
  );
}
