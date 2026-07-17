import { useTranslation } from "react-i18next";
import { Split } from "lucide-react-native";
import type { RemainderTemplate } from "@/core/domain/goals/types";
import { StepperFieldRow } from "../fields/StepperFieldRow";

/**
 * Row for a leftovers-derived amount — rendered inside the goal editor's card
 * when Custom's "Based on" picks whatever is left. The weight is relative: a
 * category with weight 2 gets twice the share of one with weight 1.
 */
export function RemainderRows({
  template,
  onChange,
}: {
  template: RemainderTemplate;
  onChange: (next: RemainderTemplate) => void;
}) {
  const { t } = useTranslation("budget");
  return (
    <StepperFieldRow
      icon={Split}
      label={t("goals.fields.weight")}
      value={template.weight}
      onChange={(weight) => onChange({ ...template, weight })}
      minValue={1}
      maxValue={10}
    />
  );
}
