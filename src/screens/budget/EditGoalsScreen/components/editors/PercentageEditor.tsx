import { Fragment, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Separator, Switch } from "heroui-native";
import { HandCoins, Percent } from "lucide-react-native";
import type { PercentageTemplate } from "@/core/domain/goals/types";
import { useCategories } from "@/hooks/useCategories";
import { FieldRow } from "../fields/FieldRow";
import { SelectFieldRow } from "../fields/SelectFieldRow";
import { StepperFieldRow } from "../fields/StepperFieldRow";

/**
 * Rows for a share-of-income amount — rendered inside the goal editor's card
 * when Custom's "Based on" picks income. The source is either every income
 * category at once ('all-income', the alias the engine understands) or one
 * specific paycheck.
 */
export function PercentageRows({
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
    <Fragment>
      <StepperFieldRow
        icon={Percent}
        label={t("goals.fields.percent")}
        value={template.percent}
        onChange={(percent) => onChange({ ...template, percent })}
        minValue={1}
        maxValue={100}
        step={5}
        formatValue={(v) => `${v}%`}
      />
      <Separator className="mx-4" />
      <SelectFieldRow
        icon={HandCoins}
        label={t("goals.fields.incomeSource")}
        value={template.category}
        choices={sources}
        onChange={(category) => onChange({ ...template, category })}
      />
      <Separator className="mx-4" />
      {/* The label is this row's value — the switch says the rest. */}
      <FieldRow isMuted={!template.previous}>
        <FieldRow.Icon icon={HandCoins} />
        <FieldRow.Title>{t("goals.fields.previousMonth")}</FieldRow.Title>
        <FieldRow.Suffix>
          <Switch
            isSelected={template.previous}
            onSelectedChange={(previous) => onChange({ ...template, previous })}
          />
        </FieldRow.Suffix>
      </FieldRow>
    </Fragment>
  );
}
