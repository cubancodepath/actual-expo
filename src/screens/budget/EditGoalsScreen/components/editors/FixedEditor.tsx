import { Fragment, useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { ListGroup, Separator, Switch, useThemeColor } from "heroui-native";
import { Segment } from "heroui-native-pro";
import {
  Archive,
  Banknote,
  CalendarDays,
  CalendarRange,
  ChevronRight,
  Repeat2,
} from "lucide-react-native";
import {
  allowedCustomModes,
  defaultYearlyDate,
  fixedConfigFromTemplate,
  templateFromFixedConfig,
  type FixedGoalConfig,
  type FixedTemplate,
  type RecurrenceSegment,
} from "@/core/domain/goals";
import type { Template } from "@/core/domain/goals/types";
import { AmountKeyboard, useAmountKeyboardState } from "@/ui/amount-keyboard";
import { Money } from "@/ui/Money";
import { BlinkingCursor } from "@/ui/BlinkingCursor";
import { formatCents } from "@/lib/currency";
import { currentMonth } from "@/lib/date";
import { DateFieldRow } from "../fields/DateFieldRow";
import { FieldRow } from "../fields/FieldRow";
import { RepeatWheels } from "../fields/RepeatWheels";
import { SelectFieldRow } from "../fields/SelectFieldRow";

/** Localized weekday names, Sunday-first to match Date.getDay(). */
function weekdayNames(locale: string): string[] {
  const fmt = new Intl.DateTimeFormat(locale, { weekday: "long" });
  // 2026-03-01 is a Sunday.
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2026, 2, 1 + i)));
}

/**
 * The amount, styled like the budget list's inline editor: the value grows a
 * caret while the in-app keypad is open — no color change.
 */
function AmountRow({ label, cents }: { label: string; cents: number }) {
  const accent = useThemeColor("accent");
  const { isOpen } = useAmountKeyboardState();
  return (
    <AmountKeyboard.Trigger>
      <FieldRow>
        <FieldRow.Icon icon={Banknote} />
        <FieldRow.Content>
          <FieldRow.Label>{label}</FieldRow.Label>
          {/* Money renders the text, so this is Value's styling by hand. */}
          <View className="flex-row items-center">
            <Money cents={cents} tone="plain" className="text-base" />
            {isOpen ? <BlinkingCursor color={accent} /> : null}
          </View>
        </FieldRow.Content>
      </FieldRow>
    </AmountKeyboard.Trigger>
  );
}

/**
 * Fixed recurring amount — the everyday goal, in user terms.
 *
 * Weekly/Monthly/Yearly are one card: cadence, amount, the day it lands on,
 * and what to do next period. Custom adds a second card for an arbitrary due
 * date and repeat, since that's a different question (when is this due, and
 * does it come back?) rather than more of the same fields.
 */
export function FixedEditor({
  template,
  onChange,
  onOpenModePane,
}: {
  template: FixedTemplate;
  onChange: (next: Template) => void;
  /** Open the "Next time I want to…" pane; `custom` = editor is on Custom. */
  onOpenModePane: (custom: boolean) => void;
}) {
  const { t, i18n } = useTranslation("budget");
  const muted = useThemeColor("muted");

  // "Custom" isn't a distinct stored shape: "every 1 month" IS the Monthly
  // preset's template. So being in Custom is UI state, and the config is read
  // through it — otherwise the editor would jump back to a preset (taking the
  // second card with it) the moment an interval landed on 1.
  const [isCustom, setIsCustom] = useState(
    () => fixedConfigFromTemplate(template).segment === "custom",
  );
  const config = fixedConfigFromTemplate(template, isCustom);
  const segment: RecurrenceSegment = config.segment;

  const apply = (next: FixedGoalConfig) => onChange(templateFromFixedConfig(next, template));

  const selectSegment = (next: RecurrenceSegment) => {
    setIsCustom(next === "custom");
    if (next === segment) return;
    const amountCents = config.amountCents;
    switch (next) {
      case "weekly":
        apply({ segment: "weekly", mode: "setAside", amountCents, weekday: 1 });
        break;
      case "monthly":
        apply({ segment: "monthly", mode: "setAside", amountCents, dayOfMonth: 1 });
        break;
      case "yearly":
        // Spreading toward the date is the friendlier default for a yearly sum.
        apply({ segment: "yearly", mode: "refill", amountCents, date: defaultYearlyDate() });
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

  const modeValue = t(
    config.mode === "refill"
      ? "goals.fixed.refillUpTo"
      : config.mode === "spend"
        ? "goals.fixed.spendDown"
        : "goals.fixed.setAside",
    { amount: formatCents(config.amountCents) },
  );

  // Only worth opening the pane when there's actually a choice: a one-shot
  // target can only be refill, a daily/weekly repeat can only be set-aside.
  const modeIsChoosable =
    config.segment !== "custom" || allowedCustomModes(config.repeat).length > 1;

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

        <AmountRow label={t("goals.fields.amount")} cents={config.amountCents} />

        {config.segment === "weekly" ? (
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

        {config.segment === "monthly" && config.mode === "refill" ? (
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

        {config.segment === "monthly" && config.mode === "setAside" ? (
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

        {config.segment === "yearly" ? (
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
      </ListGroup>

      {config.segment === "custom" ? (
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
