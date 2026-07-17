import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ListGroup, Separator } from "heroui-native";
import type { PercentageTemplate } from "@/core/domain/goals/types";
import { useCategories } from "@/hooks/useCategories";
import { SelectRow } from "../fields/SelectRow";
import { StepperRow } from "../fields/StepperRow";
import { SwitchRow } from "../fields/SwitchRow";

/**
 * Budget a share of income. The source is either every income category at once
 * ('all-income', the alias the engine understands) or one specific paycheck.
 */
export function PercentageEditor({
  template,
  onChange,
}: {
  template: PercentageTemplate;
  onChange: (next: PercentageTemplate) => void;
}) {
  const { t } = useTranslation("budget");
  const { categories } = useCategories();

  const sources = useMemo(
    () => [
      { value: "all-income", label: t("goals.allIncome") },
      ...categories
        .filter((c) => c.is_income && !c.tombstone && !c.hidden)
        .map((c) => ({ value: c.id, label: c.name })),
    ],
    [categories, t],
  );

  return (
    <ListGroup>
      <StepperRow
        label={t("goals.fields.percent")}
        value={template.percent}
        onChange={(percent) => onChange({ ...template, percent })}
        minValue={1}
        maxValue={100}
        step={5}
        formatValue={(v) => `${v}%`}
      />
      <Separator className="mx-4" />
      <SelectRow
        label={t("goals.fields.incomeSource")}
        value={template.category}
        choices={sources}
        onChange={(category) => onChange({ ...template, category })}
      />
      <Separator className="mx-4" />
      <SwitchRow
        label={t("goals.fields.previousMonth")}
        description={t("goals.fields.previousMonthHint")}
        isSelected={template.previous}
        onChange={(previous) => onChange({ ...template, previous })}
      />
    </ListGroup>
  );
}
