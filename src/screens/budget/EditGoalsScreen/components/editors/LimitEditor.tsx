import { useTranslation } from "react-i18next";
import { ListGroup, Separator } from "heroui-native";
import { todayStr } from "@/lib/date";
import type { LimitTemplate } from "@/core/domain/goals/types";
import { DayField } from "../fields/DayField";
import { SelectRow } from "../fields/SelectRow";
import { SwitchRow } from "../fields/SwitchRow";

type Period = LimitTemplate["period"];

/**
 * A cap on what this category may hold. Other goals fund it; this stops them
 * from going past the ceiling.
 *
 * A weekly cap needs an anchor date to know where its weeks start — the engine
 * counts from it, so it's required rather than optional here.
 */
export function LimitEditor({
  template,
  onChange,
}: {
  template: LimitTemplate;
  onChange: (next: LimitTemplate) => void;
}) {
  const { t } = useTranslation("budget");

  const setPeriod = (period: Period) => {
    onChange({
      ...template,
      period,
      // Only a weekly cap has a start date, and only a monthly one can hold.
      start: period === "weekly" ? (template.start ?? todayStr()) : undefined,
      hold: period === "monthly" ? template.hold : false,
    });
  };

  return (
    <ListGroup>
      <SelectRow<Period>
        label={t("goals.fields.resetPeriod")}
        value={template.period}
        choices={[
          { value: "daily", label: t("goals.limitPeriod.daily") },
          { value: "weekly", label: t("goals.limitPeriod.weekly") },
          { value: "monthly", label: t("goals.limitPeriod.monthly") },
        ]}
        onChange={setPeriod}
      />

      {template.period === "weekly" ? (
        <>
          <Separator className="mx-4" />
          <DayField
            label={t("goals.fields.weekStartsOn")}
            description={t("goals.fields.weekStartsOnHint")}
            value={template.start}
            onChange={(start) => onChange({ ...template, start })}
          />
        </>
      ) : null}

      {template.period === "monthly" ? (
        <>
          <Separator className="mx-4" />
          <SwitchRow
            label={t("goals.fields.keepSurplus")}
            description={t("goals.fields.keepSurplusHint")}
            isSelected={template.hold}
            onChange={(hold) => onChange({ ...template, hold })}
          />
        </>
      ) : null}
    </ListGroup>
  );
}
