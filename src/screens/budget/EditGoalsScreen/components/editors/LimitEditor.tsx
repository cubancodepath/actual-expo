import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { ListGroup, Separator, Switch } from "heroui-native";
import { Archive, CalendarDays, RotateCcw } from "lucide-react-native";
import { currentDay } from "@/core/shared/months";
import type { LimitTemplate } from "@/core/types/models";
import { AmountRow } from "../fields/AmountRow";
import { DateFieldRow } from "../fields/DateFieldRow";
import { FieldRow } from "../fields/FieldRow";
import { SelectFieldRow } from "../fields/SelectFieldRow";

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
      start: period === "weekly" ? (template.start ?? currentDay()) : undefined,
      hold: period === "monthly" ? template.hold : false,
    });
  };

  return (
    <ListGroup>
      <AmountRow label={t("goals.fields.capAmount")} cents={Math.round(template.amount * 100)} />
      <Separator className="mx-4" />

      <SelectFieldRow<Period>
        icon={RotateCcw}
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
        <Fragment>
          <Separator className="mx-4" />
          <DateFieldRow
            icon={CalendarDays}
            label={t("goals.fields.weekStartsOn")}
            value={template.start}
            onChange={(start) => onChange({ ...template, start })}
          />
        </Fragment>
      ) : null}

      {template.period === "monthly" ? (
        <Fragment>
          <Separator className="mx-4" />
          {/* The label is this row's value — the switch says the rest. */}
          <FieldRow isMuted={!template.hold}>
            <FieldRow.Icon icon={Archive} />
            <FieldRow.Title>{t("goals.fixed.keepSurplus")}</FieldRow.Title>
            <FieldRow.Suffix>
              <Switch
                isSelected={template.hold}
                onSelectedChange={(hold) => onChange({ ...template, hold })}
              />
            </FieldRow.Suffix>
          </FieldRow>
        </Fragment>
      ) : null}
    </ListGroup>
  );
}
