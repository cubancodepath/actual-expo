import { Fragment, useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { ListGroup, Separator, Switch, useThemeColor } from "heroui-native";
import { Segment } from "heroui-native-pro";
import {
  Archive,
  CalendarDays,
  CalendarRange,
  ChevronRight,
  Repeat2,
  Sigma,
} from "lucide-react-native";
import {
  allowedCustomModes,
  defaultYearlyDate,
  fixedConfigFromTemplate,
  isFixedTemplate,
  templateFromFixedConfig,
  type DisplayTemplateType,
  type FixedGoalConfig,
  type RecurrenceSegment,
} from "@/screens/budget/goals";
import type {
  AverageTemplate,
  CopyTemplate,
  PercentageTemplate,
  RemainderTemplate,
  ScheduleTemplate,
  Template,
} from "@/core/types/models";
import type { Schedule } from "@/core/types/models";
import { formatCents } from "@/core/shared/util";
import { currentMonth } from "@/core/shared/months";
import { AmountRow } from "../fields/AmountRow";
import { DateFieldRow } from "../fields/DateFieldRow";
import { FieldRow } from "../fields/FieldRow";
import { RepeatWheels } from "../fields/RepeatWheels";
import { SelectFieldRow } from "../fields/SelectFieldRow";
import { HistoricalRows } from "./HistoricalEditor";
import { PercentageRows } from "./PercentageEditor";
import { RemainderRows } from "./RemainderEditor";
import { ScheduleRows } from "./ScheduleEditor";

/** Where a Custom goal's amount comes from. "fixed" = the user types it. */
type AmountSource = "fixed" | "percentage" | "historical" | "schedule" | "remainder";

const SOURCES: AmountSource[] = ["fixed", "percentage", "historical", "schedule", "remainder"];

/** Localized weekday names, Sunday-first to match Date.getDay(). */
function weekdayNames(locale: string): string[] {
  const fmt = new Intl.DateTimeFormat(locale, { weekday: "long" });
  // 2026-03-01 is a Sunday.
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2026, 2, 1 + i)));
}

/**
 * The one goal editor, in user terms.
 *
 * Weekly/Monthly/Yearly are the simple presets that cover most goals: cadence,
 * amount, the day it lands on, what to do next period. Custom is the power
 * area — an arbitrary due date and repeat, and a "Based on" row that swaps the
 * typed amount for a derived one (a share of income, past spending, a
 * schedule, whatever is left), whose settings appear right there. No type
 * catalogue anywhere.
 */
export function GoalEditor({
  template,
  displayType,
  schedules,
  onChange,
  onChangeType,
  onOpenModePane,
}: {
  template: Template;
  displayType: DisplayTemplateType;
  schedules: Schedule[];
  onChange: (next: Template) => void;
  /** Swap the amount's source (Custom's "Based on" row). */
  onChangeType: (next: DisplayTemplateType) => void;
  /** Open the "Next time I want to…" pane; `custom` = editor is on Custom. */
  onOpenModePane: (custom: boolean) => void;
}) {
  const { t, i18n } = useTranslation("budget");
  const muted = useThemeColor("muted");

  const source: AmountSource = displayType === "fixed" ? "fixed" : (displayType as AmountSource);

  // "Custom" isn't a distinct stored shape: "every 1 month" IS the Monthly
  // preset's template, and every derived source lives under Custom. So being
  // in Custom is UI state, and the fixed config is read through it.
  const [isCustom, setIsCustom] = useState(
    () => !isFixedTemplate(template) || fixedConfigFromTemplate(template).segment === "custom",
  );

  const config = isFixedTemplate(template) ? fixedConfigFromTemplate(template, isCustom) : null;
  const segment: RecurrenceSegment = config ? config.segment : "custom";

  const apply = (next: FixedGoalConfig) => {
    if (config) onChange(templateFromFixedConfig(next, template));
  };

  const selectSegment = (next: RecurrenceSegment) => {
    setIsCustom(next === "custom");
    if (next === segment && config) return;

    // Leaving a derived source for a preset means "no — my own amount, this
    // cadence". Retype first, then shape the preset; the two functional
    // updates land in order.
    if (!config && next !== "custom") onChangeType("fixed");
    if (!config && next === "custom") return;

    const amountCents = config?.amountCents ?? 0;
    switch (next) {
      case "weekly":
        onChange(
          templateFromFixedConfig(
            { segment: "weekly", mode: "setAside", amountCents, weekday: 1 },
            template,
          ),
        );
        break;
      case "monthly":
        onChange(
          templateFromFixedConfig(
            { segment: "monthly", mode: "setAside", amountCents, dayOfMonth: 1 },
            template,
          ),
        );
        break;
      case "yearly":
        // Spreading toward the date is the friendlier default for a yearly sum.
        onChange(
          templateFromFixedConfig(
            { segment: "yearly", mode: "refill", amountCents, date: defaultYearlyDate() },
            template,
          ),
        );
        break;
      case "custom":
        apply({
          segment: "custom",
          mode: "refill",
          amountCents,
          dueDate: defaultYearlyDate(),
          repeat: null,
        });
        break;
    }
  };

  const selectSource = (next: AmountSource) => {
    setIsCustom(true);
    onChangeType(next === "fixed" ? "fixed" : next);
  };

  const modeValue = config
    ? t(
        config.mode === "refill"
          ? "goals.fixed.refillUpTo"
          : config.mode === "spend"
            ? "goals.fixed.spendDown"
            : "goals.fixed.setAside",
        { amount: formatCents(config.amountCents) },
      )
    : null;

  // Only worth opening the pane when there's actually a choice: a one-shot
  // target can only be refill, a daily/weekly repeat can only be set-aside.
  const modeIsChoosable =
    config != null && (config.segment !== "custom" || allowedCustomModes(config.repeat).length > 1);

  const renderSourceRows = () => {
    switch (source) {
      case "percentage":
        return <PercentageRows template={template as PercentageTemplate} onChange={onChange} />;
      case "historical":
        return (
          <HistoricalRows
            template={template as AverageTemplate | CopyTemplate}
            onChange={onChange}
          />
        );
      case "schedule":
        return (
          <ScheduleRows
            template={template as ScheduleTemplate}
            schedules={schedules}
            onChange={onChange}
          />
        );
      case "remainder":
        return <RemainderRows template={template as RemainderTemplate} onChange={onChange} />;
      case "fixed":
        return null;
    }
  };

  return (
    <View className="gap-3">
      <ListGroup>
        <View className="px-3 pt-3 pb-2">
          <Segment value={segment} onValueChange={(v) => selectSegment(v as RecurrenceSegment)}>
            <Segment.Group>
              <Segment.Indicator />
              <Segment.Item value="weekly">
                <Segment.Label>{t("goals.segments.weekly")}</Segment.Label>
              </Segment.Item>
              <Segment.Item value="monthly">
                <Segment.Label>{t("goals.segments.monthly")}</Segment.Label>
              </Segment.Item>
              <Segment.Item value="yearly">
                <Segment.Label>{t("goals.segments.yearly")}</Segment.Label>
              </Segment.Item>
              <Segment.Item value="custom">
                <Segment.Label>{t("goals.segments.custom")}</Segment.Label>
              </Segment.Item>
            </Segment.Group>
          </Segment>
        </View>
        <Separator className="mx-4" />

        {segment === "custom" ? (
          <Fragment>
            <SelectFieldRow<AmountSource>
              icon={Sigma}
              label={t("goals.fixed.basedOn")}
              value={source}
              choices={SOURCES.map((s) => ({ value: s, label: t(`goals.sources.${s}`) }))}
              onChange={selectSource}
            />
            <Separator className="mx-4" />
          </Fragment>
        ) : null}

        {config ? (
          <AmountRow label={t("goals.fields.amount")} cents={config.amountCents} />
        ) : (
          renderSourceRows()
        )}

        {config?.segment === "weekly" ? (
          <Fragment>
            <Separator className="mx-4" />
            <SelectFieldRow<string>
              icon={CalendarDays}
              label={t("goals.fixed.onDay")}
              value={String(config.weekday)}
              choices={weekdayNames(i18n.language).map((name, weekday) => ({
                value: String(weekday),
                label: name,
              }))}
              onChange={(v) => apply({ ...config, weekday: Number(v) })}
            />
          </Fragment>
        ) : null}

        {config?.segment === "monthly" && config.mode === "refill" ? (
          <Fragment>
            <Separator className="mx-4" />
            {/* The label is this row's value — the switch says the rest. */}
            <FieldRow isMuted={!config.hold}>
              <FieldRow.Icon icon={Archive} />
              <FieldRow.Title>{t("goals.fixed.keepSurplus")}</FieldRow.Title>
              <FieldRow.Suffix>
                <Switch
                  isSelected={config.hold ?? false}
                  onSelectedChange={(hold) => apply({ ...config, hold })}
                />
              </FieldRow.Suffix>
            </FieldRow>
          </Fragment>
        ) : null}

        {config?.segment === "monthly" && config.mode === "setAside" ? (
          <Fragment>
            <Separator className="mx-4" />
            <SelectFieldRow<string>
              icon={CalendarDays}
              label={t("goals.fixed.onDay")}
              value={String(config.dayOfMonth)}
              choices={Array.from({ length: 31 }, (_, i) => ({
                value: String(i + 1),
                label: t("goals.fixed.dayOfMonth", { day: i + 1 }),
              }))}
              onChange={(v) => apply({ ...config, dayOfMonth: Number(v) })}
            />
          </Fragment>
        ) : null}

        {config?.segment === "yearly" ? (
          <Fragment>
            <Separator className="mx-4" />
            <DateFieldRow
              icon={CalendarDays}
              label={t("goals.fixed.onDay")}
              value={config.date}
              // Refill stores an annual by-date, which is month-granular — the
              // day would always read back as the 1st, so don't show one.
              monthOnly={config.mode === "refill"}
              onChange={(date) => apply({ ...config, date })}
            />
          </Fragment>
        ) : null}

        {modeValue ? (
          <Fragment>
            <Separator className="mx-4" />
            <FieldRow
              onPress={modeIsChoosable ? () => onOpenModePane(segment === "custom") : undefined}
            >
              <FieldRow.Icon icon={Repeat2} />
              <FieldRow.Content>
                <FieldRow.Label>{t("goals.fixed.nextTime")}</FieldRow.Label>
                <FieldRow.Value>{modeValue}</FieldRow.Value>
              </FieldRow.Content>
              {modeIsChoosable ? (
                <FieldRow.Suffix>
                  <ChevronRight size={16} color={muted} />
                </FieldRow.Suffix>
              ) : null}
            </FieldRow>
          </Fragment>
        ) : null}
      </ListGroup>

      {config?.segment === "custom" ? (
        <ListGroup>
          <DateFieldRow
            icon={CalendarDays}
            label={t("goals.fixed.dueOn")}
            value={config.dueDate}
            // by and spend keep no day — don't show one.
            monthOnly={config.mode !== "setAside"}
            onChange={(dueDate) => apply({ ...config, dueDate })}
          />
          {config.mode === "spend" ? (
            <Fragment>
              <Separator className="mx-4" />
              <DateFieldRow
                icon={CalendarRange}
                label={t("goals.fixed.spendFrom")}
                value={config.from ?? `${currentMonth()}-01`}
                monthOnly
                onChange={(from) => apply({ ...config, from })}
              />
            </Fragment>
          ) : null}
          <Separator className="mx-4" />
          {/* The label is this row's value — the switch says the rest, and
              the label greys out with it. */}
          <FieldRow isMuted={config.repeat == null}>
            <FieldRow.Icon icon={Repeat2} />
            <FieldRow.Title>{t("goals.fixed.repeat")}</FieldRow.Title>
            <FieldRow.Suffix>
              <Switch
                isSelected={config.repeat != null}
                onSelectedChange={(on) =>
                  apply({ ...config, repeat: on ? { unit: "month", interval: 1 } : null })
                }
              />
            </FieldRow.Suffix>
          </FieldRow>
          {config.repeat ? (
            <Fragment>
              <Separator className="mx-4" />
              <RepeatWheels
                value={config.repeat}
                onChange={(repeat) => apply({ ...config, repeat })}
              />
            </Fragment>
          ) : null}
        </ListGroup>
      ) : null}
    </View>
  );
}
